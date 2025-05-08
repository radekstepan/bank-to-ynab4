import * as XLSX from 'xlsx';
import Papa from 'papaparse';

// Intermediate normalized transaction structure
export interface NormalizedTransaction {
  date: string; // Should be in YYYY-MM-DD format after parsing
  description: string;
  amount: number; // Positive for inflow, negative for outflow
  // checkNum?: string; // Optional: if bank data includes it
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
export interface BankParseConfig {
  label: string; // User-friendly label for dropdown
  dateField: string;
  descriptionField: string;
  outflowField?: string; 
  inflowField?: string;  
  amountField?: string;  
  skipRows?: number;     
  dateFormat?: string;   // e.g., 'YYYY-MM-DD', 'MM/DD/YYYY', 'DD MMM YYYY' for parsing assistance
  transformAmount?: (outflow?: string, inflow?: string, amount?: string) => number;
}

// --- Define bank-specific configurations ---
// Add a 'label' field for UI display
export const bankConfigs: Record<string, BankParseConfig> = {
  eqbank: {
    label: 'EQ Bank (CSV/XLSX)',
    dateField: 'Transfer date', 
    descriptionField: 'Description', 
    amountField: 'Amount',       
    skipRows: 0, 
    dateFormat: 'DD MMM YYYY', 
    transformAmount: (_outflow?: string, _inflow?: string, amount?: string) => {
      if (typeof amount === 'string') {
        const cleanedAmount = amount.replace(/\$/g, '').replace(/,/g, '');
        const num = parseFloat(cleanedAmount);
        return isNaN(num) ? 0 : num; 
      }
      return 0;
    }
  },
  generic_dmy: {
    label: 'Generic CSV/XLSX (Date, Desc, Amount - DD/MM/YYYY)',
    dateField: 'Date',
    descriptionField: 'Description',
    amountField: 'Amount',
    skipRows: 0,
    dateFormat: 'DD/MM/YYYY',
     transformAmount: (_o, _i, amount?: string) => {
       return amount ? parseFloat(String(amount).replace(/[^0-9.-]/g, '')) : 0;
     }
  },
  generic_mdy: {
    label: 'Generic CSV/XLSX (Date, Desc, Amount - MM/DD/YYYY)',
    dateField: 'Date',
    descriptionField: 'Description',
    amountField: 'Amount',
    skipRows: 0,
    dateFormat: 'MM/DD/YYYY',
    transformAmount: (_o, _i, amount?: string) => {
       return amount ? parseFloat(String(amount).replace(/[^0-9.-]/g, '')) : 0;
     }
  }
};

// YNAB CSV Header
export const YNAB_CSV_HEADER = "Date,Payee,Category,Memo,Outflow,Inflow";

export interface ConvertToYNABOptions {
  importMemos: boolean;
  swapPayeesMemos: boolean;
}

export class YNABFormatter {
  private static formatDate(dateString: string, inputFormatHint?: string): string {
    let dateObj: Date;

    // Prioritize specific format hints if provided and they match the pattern
    if (inputFormatHint === 'DD/MM/YYYY' && /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(dateString)) {
        const parts = dateString.split(/[\/\-.]/);
        dateObj = new Date(parseInt(parts[2].length === 2 ? '20' + parts[2] : parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    } else if (inputFormatHint === 'MM/DD/YYYY' && /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(dateString)) {
        const parts = dateString.split(/[\/\-.]/);
        dateObj = new Date(parseInt(parts[2].length === 2 ? '20' + parts[2] : parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    } else if (inputFormatHint === 'YYYY/MM/DD' && /^\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}$/.test(dateString)) {
        const parts = dateString.split(/[\/\-.]/);
        dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    } else {
       // Fallback to direct parsing for other formats like 'DD MMM YYYY' or ISO
       dateObj = new Date(dateString);
       // If direct parsing failed and it looks like a common Excel date number
       if (isNaN(dateObj.getTime()) && /^\d{5}$/.test(dateString)) { // Check if it's an Excel serial date number
         const excelSerialDate = parseInt(dateString, 10);
         // Excel serial date is days since 1899-12-30 (for Windows Excel)
         const baseDate = new Date(1899, 11, 30); // December 30, 1899
         dateObj = new Date(baseDate.getTime() + excelSerialDate * 24 * 60 * 60 * 1000);
       }
    }

    if (isNaN(dateObj.getTime())) {
      console.warn(`Could not parse date: "${dateString}" with inputFormatHint: "${inputFormatHint}". Falling back to original string.`);
      return dateString; 
    }
    
    const year = dateObj.getFullYear();
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`; // Standardize to YYYY-MM-DD for internal use
  }


  static async parseFile(file: File, bankType: string, uiDateFormatHint?: string): Promise<NormalizedTransaction[]> {
    const config = bankConfigs[bankType];
    if (!config) {
      throw new Error(`Unsupported bank type: ${bankType}. No configuration found.`);
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    let rawData: any[];

    // Use UI hint if provided, otherwise fallback to bank config's date format
    const effectiveDateFormat = uiDateFormatHint || config.dateFormat;

    if (fileExtension === 'csv') {
      rawData = await this.parseCSV(file); // CSV parsing usually gets headers right
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      rawData = await this.parseXLSX(file, config.skipRows);
    } else {
      throw new Error('Unsupported file type. Please upload CSV, XLS, or XLSX.');
    }
    
    // Data might have an effective skipRows applied if headers are not on the first line for XLSX
    // For CSV, PapaParse's `header: true` handles the first line as header.
    // If config.skipRows is > 0 for CSV, it implies more lines to skip *after* the header.
    // This logic might need refinement if CSVs have multiple pre-header rows.
    // For now, assuming PapaParse handles CSV header row, and config.skipRows applies to XLSX content rows.

    const transactions = rawData.slice(fileExtension === 'csv' ? (config.skipRows || 0) : 0).map((row: any, index: number) => {
      const dateValue = row[config.dateField];
      const descriptionValue = row[config.descriptionField];
      
      let amount: number = 0;
      if (config.transformAmount) {
        const amountArg = config.amountField ? String(row[config.amountField]) : undefined;
        const outflowArg = config.outflowField ? String(row[config.outflowField]) : undefined;
        const inflowArg = config.inflowField ? String(row[config.inflowField]) : undefined;
        amount = config.transformAmount(outflowArg, inflowArg, amountArg);
      } else if (config.amountField) {
        const rawAmount = row[config.amountField];
        const cleanedAmount = typeof rawAmount === 'string' ? rawAmount.replace(/[^0-9.-]/g, '') : String(rawAmount);
        amount = parseFloat(cleanedAmount) || 0;
      } else if (config.outflowField && config.inflowField) {
        const outflow = row[config.outflowField];
        const inflow = row[config.inflowField];
        const outflowNum = parseFloat(String(outflow).replace(/[^0-9.-]/g, '')) || 0;
        const inflowNum = parseFloat(String(inflow).replace(/[^0-9.-]/g, '')) || 0;
        amount = inflowNum - outflowNum;
      }

      if (dateValue === undefined || dateValue === null || String(dateValue).trim() === '' ||
          descriptionValue === undefined || descriptionValue === null || String(descriptionValue).trim() === '') {
        console.warn(`Skipping row ${index + (config.skipRows || 0) + 1} due to missing date or description:`, row);
        return null;
      }
      
      return {
        date: this.formatDate(String(dateValue), effectiveDateFormat),
        description: String(descriptionValue).trim(),
        amount: amount,
      };
    }).filter(Boolean) as NormalizedTransaction[];
    
    if (transactions.length === 0 && rawData.length > 0) {
        console.warn("File parsed but no valid transactions extracted. Check field names in bank config and file structure.");
        console.log("Raw data sample (first few rows):", rawData.slice(0,5));
        console.log("Expected field names from config:", {date: config.dateField, desc: config.descriptionField, amt: config.amountField});
    }
    return transactions;
  }

  private static parseCSV(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true, 
        skipEmptyLines: true,
        dynamicTyping: false, // Keep all as strings initially to avoid type issues before specific parsing
        complete: (results) => {
          if (results.errors.length) {
            console.error("CSV Parsing errors:", results.errors.map(e => `Row ${e.row}: ${e.message} (${e.code})`).join('\n'));
            // Depending on severity, might still resolve results.data or reject
          }
          resolve(results.data as any[]); 
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
          const workbook = XLSX.read(data, { type: 'array', cellDates: true, dateNF:'yyyy-mm-dd'}); // Attempt to get dates as JS Dates
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // For XLSX, if skipRows is provided, we adjust the range or process the JSON later.
          // sheet_to_json respects `range` option if header is not 0.
          // Simpler to slice after conversion if header is always row 0 effectively for sheet_to_json.
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            raw: false, // format values (e.g. dates)
            header: 1, // Get array of arrays first to handle headers manually if needed
            // defval: "" // default value for empty cells
          });

          if (!jsonData || jsonData.length === 0) {
            resolve([]);
            return;
          }

          // Effective header row after skipping initial non-data rows
          const headerRowIndex = skipRows; 
          if (headerRowIndex >= jsonData.length) {
             console.error("skipRows is too large, no data or header row found.");
             resolve([]);
             return;
          }
          const headers: string[] = (jsonData[headerRowIndex] as any[]).map(String);
          const dataRows = jsonData.slice(headerRowIndex + 1);

          const formattedJsonData = dataRows.map(rowArray => {
            const rowObject: {[key: string]: any} = {};
            (rowArray as any[]).forEach((cellValue, index) => {
                if (headers[index]) {
                    // If cellValue is a Date object from cellDates: true, format it.
                    // Otherwise, it might be string or number.
                    if (cellValue instanceof Date) {
                        // Let our formatDate handle it later with proper hints
                        rowObject[headers[index]] = cellValue.toISOString().split('T')[0]; // pre-format to YYYY-MM-DD
                    } else {
                        rowObject[headers[index]] = cellValue;
                    }
                }
            });
            return rowObject;
          });
          resolve(formattedJsonData);

        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  }

  static convertToYNABTransactions(
    transactions: NormalizedTransaction[],
    options: ConvertToYNABOptions
  ): YNABTransaction[] {
    return transactions.map((transaction) => {
      let finalPayee = "";
      let finalMemo = "";
      const description = transaction.description;

      if (options.importMemos) { // Only use description if importMemos is true
        if (options.swapPayeesMemos) {
          finalPayee = description;
          // finalMemo remains empty or could be from another source if we had one
        } else {
          finalMemo = description;
          // finalPayee remains empty or from another source
        }
      }
      // If options.importMemos is false, both finalPayee and finalMemo remain based on their initial empty string values,
      // as description is not used.

      const outflowValue = transaction.amount < 0 ? Math.abs(transaction.amount).toFixed(2) : "";
      const inflowValue = transaction.amount > 0 ? transaction.amount.toFixed(2) : "";
      
      let finalOutflow = "";
      let finalInflow = "";

      if (transaction.amount < 0) {
        finalOutflow = Math.abs(transaction.amount).toFixed(2);
      } else if (transaction.amount > 0) {
        finalInflow = transaction.amount.toFixed(2);
      }
      // For $0 transactions, both will be empty strings, which is usually fine for YNAB.

      return {
        Date: transaction.date, // Already YYYY-MM-DD, YNAB handles this or converts
        Payee: finalPayee,
        Category: "", // Category is always empty
        Memo: finalMemo,
        Outflow: finalOutflow,
        Inflow: finalInflow,
      };
    });
  }

  static generateYNABCSVString(ynabTransactions: YNABTransaction[]): string {
    // YNAB can be picky about date formats. It often accepts YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY.
    // Our internal format is YYYY-MM-DD, which should be safe.
    const dataForSheet = ynabTransactions.map(tx => ({
        Date: tx.Date, // Use the already formatted date
        Payee: tx.Payee,
        Category: tx.Category,
        Memo: tx.Memo,
        Outflow: tx.Outflow,
        Inflow: tx.Inflow
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataForSheet, {
      header: ['Date', 'Payee', 'Category', 'Memo', 'Outflow', 'Inflow'], 
      skipHeader: false, // XLSX.utils.sheet_to_csv will include this header
    });
    
    // Generate CSV string. XLSX.utils.sheet_to_csv prepends a BOM by default, which is good for Excel.
    // It also uses the header row from the worksheet.
    const csvString = XLSX.utils.sheet_to_csv(worksheet, { FS: ','}); // Specify Field Separator
    
    // sheet_to_csv actually includes the header if it's part of the sheet.
    // So we don't need to prepend YNAB_CSV_HEADER if json_to_sheet included it.
    return csvString; 
  }
}
