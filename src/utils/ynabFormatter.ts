import * as XLSX from 'xlsx';
import Papa from 'papaparse';

// Intermediate normalized transaction structure
export interface NormalizedTransaction {
  date: string; // Should be in YYYY-MM-DD format after parsing
  description: string;
  amount: number; // Positive for inflow, negative for outflow
}

// YNAB's expected transaction structure for CSV import
export interface YNABTransaction {
  Date: string;      // YYYY-MM-DD or MM/DD/YYYY or DD/MM/YYYY
  Payee: string;
  Category: string;  // Optional, can be empty
  Memo: string;      // Optional, can be empty
  Outflow: string;   // Positive number string, e.g., "123.45"
  Inflow: string;    // Positive number string, e.g., "678.90"
}

// Configuration for parsing different bank formats
interface BankParseConfig {
  dateField: string;
  descriptionField: string;
  outflowField?: string; // Use if separate debit/credit columns
  inflowField?: string;  // Use if separate debit/credit columns
  amountField?: string;  // Use if single amount column (positive/negative)
  skipRows?: number;     // For CSVs with extra header lines
  dateFormat?: string;   // e.g., 'YYYY-MM-DD', 'MM/DD/YYYY', 'DD MMM YYYY' for parsing assistance
  // Function to transform amount if needed (e.g. from string "1,234.56 CR")
  transformAmount?: (outflow?: string, inflow?: string, amount?: string) => number;
}

// --- Define bank-specific configurations ---
const bankConfigs: Record<string, BankParseConfig> = {
  eqbank: {
    dateField: 'Transfer date', // CORRECTED: Matches CSV header
    descriptionField: 'Description', // Matches CSV header
    amountField: 'Amount',       // CORRECTED: Uses the single 'Amount' column
    skipRows: 0, // First row is header
    dateFormat: 'DD MMM YYYY', // Input format hint (e.g., 07 MAY 2025)
    transformAmount: (_outflow?: string, _inflow?: string, amount?: string) => {
      if (typeof amount === 'string') {
        // Remove '$' and ',' then parse.
        // Handles "-$180" or "$78.79"
        const cleanedAmount = amount.replace(/\$/g, '').replace(/,/g, '');
        const num = parseFloat(cleanedAmount);
        return isNaN(num) ? 0 : num; // Return 0 if parsing fails, preserves sign
      }
      return 0; // If amount is not a string or undefined
    }
  },
  // Example for a bank with a single 'Amount' column:
  // 'genericBankWithAmount': {
  //   dateField: 'Date',
  //   descriptionField: 'Transaction Description',
  //   amountField: 'Amount',
  //   skipRows: 0,
  //   dateFormat: 'MM/DD/YYYY',
  //   transformAmount: (_o, _i, amount?: string) => {
  //     return amount ? parseFloat(amount.replace(/[^0-9.-]/g, '')) : 0;
  //   }
  // }
};

// YNAB CSV Header
export const YNAB_CSV_HEADER = "Date,Payee,Category,Memo,Outflow,Inflow";

export class YNABFormatter {
  private static formatDate(dateString: string, inputFormat?: string): string {
    let dateObj: Date;

    // Standardize common date variations that new Date() might misinterpret
    // For 'DD MMM YYYY' (e.g., '07 MAY 2025'), new Date() usually handles it correctly.
    if (inputFormat === 'DD/MM/YYYY' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
        const parts = dateString.split('/');
        dateObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    } else if (inputFormat === 'MM/DD/YYYY' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
        const parts = dateString.split('/');
        dateObj = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    } else {
       // For formats like 'DD MMM YYYY' or 'YYYY-MM-DD'
       dateObj = new Date(dateString);
    }

    if (isNaN(dateObj.getTime())) {
      console.warn(`Could not parse date: ${dateString} with inputFormat: ${inputFormat}. Falling back to original.`);
      return dateString; // Return original if parsing fails to avoid breaking YNAB import
    }
    // Format to YYYY-MM-DD which is a safe bet for YNAB
    const year = dateObj.getFullYear();
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }


  static async parseFile(file: File, bankType: string): Promise<NormalizedTransaction[]> {
    const config = bankConfigs[bankType];
    if (!config) {
      throw new Error(`Unsupported bank type: ${bankType}. No configuration found.`);
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    let rawData: any[];

    if (fileExtension === 'csv') {
      rawData = await this.parseCSV(file, config.skipRows);
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      rawData = await this.parseXLSX(file, config.skipRows);
    } else {
      throw new Error('Unsupported file type. Please upload CSV, XLS, or XLSX.');
    }

    return rawData.map((row: any, index: number) => {
      const dateValue = row[config.dateField];
      const descriptionValue = row[config.descriptionField];

      let amount: number = 0; // Default to 0
      if (config.transformAmount) {
        // Pass the relevant field(s) to transformAmount based on config
        const amountArg = config.amountField ? row[config.amountField] : undefined;
        const outflowArg = config.outflowField ? row[config.outflowField] : undefined;
        const inflowArg = config.inflowField ? row[config.inflowField] : undefined;
        amount = config.transformAmount(outflowArg, inflowArg, amountArg);
      } else if (config.amountField) { // Fallback if no transformAmount but amountField exists
        const rawAmount = row[config.amountField];
        const cleanedAmount = typeof rawAmount === 'string' ? rawAmount.replace(/[^0-9.-]/g, '') : String(rawAmount);
        const num = parseFloat(cleanedAmount);
        amount = isNaN(num) ? 0 : num;
      } else if (config.outflowField && config.inflowField) { // Fallback for separate outflow/inflow
        const outflow = row[config.outflowField];
        const inflow = row[config.inflowField];
        const outflowNum = typeof outflow === 'string' ? parseFloat(outflow.replace(/[^0-9.-]/g, '')) : Number(outflow) || 0;
        const inflowNum = typeof inflow === 'string' ? parseFloat(inflow.replace(/[^0-9.-]/g, '')) : Number(inflow) || 0;
        amount = inflowNum - outflowNum;
      }

      // Ensure dateValue and descriptionValue are present. Amount can be 0.
      if (dateValue === undefined || dateValue === null || String(dateValue).trim() === '' ||
          descriptionValue === undefined || descriptionValue === null || String(descriptionValue).trim() === '') {
        console.warn(`Skipping row ${index + (config.skipRows || 0) + 2} due to missing date or description:`, row);
        return null;
      }
      
      return {
        date: this.formatDate(String(dateValue), config.dateFormat),
        description: String(descriptionValue).trim(),
        amount: amount,
      };
    }).filter(Boolean) as NormalizedTransaction[]; // Filter out nulls
  }

  private static parseCSV(file: File, skipRows: number = 0): Promise<any[]> {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true, // Uses the first row as keys
        skipEmptyLines: true,
        // `preview: 0` is not needed if `skipRows` is handled after parsing all data.
        // PapaParse's `header: true` means the first row *is* the header.
        // `skipRows` in our context should mean data rows to skip *after* the header.
        // So, if skipRows is > 0, we slice the data *after* PapaParse gives it to us.
        // Currently, the `map` function implicitly handles if `skipRows` was meant for header data.
        // For this CSV, skipRows: 0 is correct as the first row is headers.
        complete: (results) => {
          if (results.errors.length) {
            console.error("CSV Parsing errors:", results.errors.map(e => `Row ${e.row}: ${e.message} (${e.code})`).join('\n'));
            // Depending on severity, you might reject or still resolve with partial data
          }
          // If skipRows was meant to skip data rows *after* header, slice here:
          // resolve(results.data.slice(skipRows));
          resolve(results.data); // Assuming skipRows=0 for files where 1st row is header.
        },
        error: (error: Error) => {
          reject(error);
        },
      });
    });
  }

  private static parseXLSX(file: File, skipRows: number = 0): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          let jsonData = XLSX.utils.sheet_to_json(worksheet, {
            // header: 1, // To get array of arrays if manual header processing is needed
            // defval: '', // Default value for empty cells
          });

          if (skipRows > 0) { // If skipRows is for data rows after header
            jsonData = jsonData.slice(skipRows);
          }
          resolve(jsonData);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  }

  static convertToYNABTransactions(transactions: NormalizedTransaction[]): YNABTransaction[] {
    return transactions.map((transaction) => {
      const outflow = transaction.amount < 0 ? Math.abs(transaction.amount).toFixed(2) : ""; // Empty string if 0
      const inflow = transaction.amount > 0 ? transaction.amount.toFixed(2) : "";   // Empty string if 0

      // Ensure one of them is populated if amount is non-zero, YNAB might prefer "0.00"
      const finalOutflow = (transaction.amount < 0) ? Math.abs(transaction.amount).toFixed(2) : (transaction.amount === 0 && inflow === "" ? "0.00" : "");
      const finalInflow = (transaction.amount > 0) ? transaction.amount.toFixed(2) : (transaction.amount === 0 && outflow === "" ? "0.00" : "");


      return {
        Date: transaction.date,
        Payee: transaction.description,
        Category: '', 
        Memo: '',     
        Outflow: finalOutflow,
        Inflow: finalInflow,
      };
    });
  }

  static generateYNABCSVString(ynabTransactions: YNABTransaction[]): string {
    const worksheet = XLSX.utils.json_to_sheet(ynabTransactions, {
      header: ['Date', 'Payee', 'Category', 'Memo', 'Outflow', 'Inflow'], 
      skipHeader: true, 
    });
    const csvString = XLSX.utils.sheet_to_csv(worksheet);
    return `${YNAB_CSV_HEADER}\n${csvString}`;
  }
}
