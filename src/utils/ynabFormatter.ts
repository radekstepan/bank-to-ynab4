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
  dateFormat?: string;   // e.g., 'YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY' for parsing assistance
  // Function to transform amount if needed (e.g. from string "1,234.56 CR")
  transformAmount?: (outflow?: string, inflow?: string, amount?: string) => number;
}

// --- Define bank-specific configurations ---
// Add more configurations as needed
const bankConfigs: Record<string, BankParseConfig> = {
  eqbank: { // Assuming CSV from EQ Bank similar to common bank exports
    dateField: 'Transaction Date', // Or "Date" - adjust based on actual EQ Bank CSV header
    descriptionField: 'Description', // Or "Details"
    outflowField: 'Withdrawals', // Or "Debit"
    inflowField: 'Deposits',   // Or "Credit"
    skipRows: 0, // Assuming first row is header
    dateFormat: 'YYYY-MM-DD', // Assuming EQ Bank provides dates in this format or parseable by `new Date()`
    transformAmount: (outflow?: string, inflow?: string) => {
      const outflowNum = outflow ? parseFloat(outflow.replace(/[^0-9.-]/g, '')) : 0;
      const inflowNum = inflow ? parseFloat(inflow.replace(/[^0-9.-]/g, '')) : 0;
      if (outflowNum > 0) return -outflowNum;
      if (inflowNum > 0) return inflowNum;
      return 0;
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
    // Attempt to parse the date. This is a common source of issues.
    // Robust date parsing might require a library like date-fns if formats are diverse.
    let dateObj: Date;
    if (inputFormat === 'DD/MM/YYYY' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
        const parts = dateString.split('/');
        dateObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    } else if (inputFormat === 'MM/DD/YYYY' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
        const parts = dateString.split('/');
        dateObj = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    } else {
       dateObj = new Date(dateString); // Relies on browser's date parsing, YYYY-MM-DD is usually safe
    }

    if (isNaN(dateObj.getTime())) {
      console.warn(`Could not parse date: ${dateString}`);
      return dateString; // Return original if parsing fails
    }
    // Format to YYYY-MM-DD
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
      
      let amount = 0;
      if (config.transformAmount) {
        amount = config.transformAmount(
          row[config.outflowField || ''],
          row[config.inflowField || ''],
          row[config.amountField || '']
        );
      } else if (config.amountField) {
        const rawAmount = row[config.amountField];
        amount = typeof rawAmount === 'string' ? parseFloat(rawAmount.replace(/[^0-9.-]/g, '')) : Number(rawAmount);
      } else if (config.outflowField && config.inflowField) {
        const outflow = row[config.outflowField];
        const inflow = row[config.inflowField];
        const outflowNum = typeof outflow === 'string' ? parseFloat(outflow.replace(/[^0-9.-]/g, '')) : Number(outflow) || 0;
        const inflowNum = typeof inflow === 'string' ? parseFloat(inflow.replace(/[^0-9.-]/g, '')) : Number(inflow) || 0;
        amount = inflowNum - outflowNum;
      }

      if (!dateValue || !descriptionValue || isNaN(amount)) {
        console.warn(`Skipping row ${index + (config.skipRows || 0) + 1} due to missing data or invalid amount:`, row);
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
        header: true,
        skipEmptyLines: true,
        preview: 0, // 0 means parse all rows
        complete: (results) => {
          if (results.errors.length) {
            console.error("CSV Parsing errors:", results.errors);
            // Potentially still resolve with data if some rows are fine
            // reject(new Error(`CSV Parsing errors: ${results.errors.map(e => e.message).join(', ')}`));
          }
          resolve(results.data.slice(skipRows));
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
          const workbook = XLSX.read(data, { type: 'array', cellDates: true }); // cellDates can help with Excel dates
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          // Use {header: 1} to get array of arrays, then manually skip rows and build objects if headers are complex
          // or if skipRows needs to apply before headers are determined.
          // For now, assuming XLSX.utils.sheet_to_json handles headers correctly after skipRows.
          // This implies skipRows for XLSX is more about data rows if header is row 1.
          // If headers are not on the first row after skipRows, this needs adjustment.
          let jsonData = XLSX.utils.sheet_to_json(worksheet, {
            // raw: false, // try to get formatted dates/numbers
            // dateNF: 'yyyy-mm-dd', // if you want to force date format from excel
          });

          if (skipRows > 0) {
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
      // YNAB wants amounts as positive numbers in specific columns
      const outflow = transaction.amount < 0 ? Math.abs(transaction.amount).toFixed(2) : "0.00";
      const inflow = transaction.amount > 0 ? transaction.amount.toFixed(2) : "0.00";

      return {
        Date: transaction.date, // Already formatted to YYYY-MM-DD
        Payee: transaction.description,
        Category: '', // Users will categorize in YNAB
        Memo: '',     // Users can add memos in YNAB
        Outflow: outflow,
        Inflow: inflow,
      };
    });
  }

  static generateYNABCSVString(ynabTransactions: YNABTransaction[]): string {
    // Using XLSX to convert JSON to CSV string is robust for special characters and quoting
    const worksheet = XLSX.utils.json_to_sheet(ynabTransactions, {
      header: ['Date', 'Payee', 'Category', 'Memo', 'Outflow', 'Inflow'], // Explicitly set header order
      skipHeader: true, // We will prepend our own header string
    });
    const csvString = XLSX.utils.sheet_to_csv(worksheet);
    return `${YNAB_CSV_HEADER}\n${csvString}`;
  }
}
