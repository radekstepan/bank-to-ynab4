import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { NormalizedTransaction, YNABTransaction, ConvertToYNABOptions } from '../types/transactions';
import { bankConfigs } from '../config/bankConfigs';

// YNAB CSV Header (used by XLSX.utils.json_to_sheet's header option)
export const YNAB_CSV_HEADER_ARRAY = ['Date', 'Payee', 'Category', 'Memo', 'Outflow', 'Inflow'];

// Helper function to get row value with case-insensitive header matching
function getRowValue(row: any, fieldNameFromConfig?: string): any {
  if (!fieldNameFromConfig || typeof fieldNameFromConfig !== 'string') return undefined;
  
  // Try exact match first (common and faster)
  if (row.hasOwnProperty(fieldNameFromConfig)) {
    return row[fieldNameFromConfig];
  }
  
  // Try case-insensitive match if exact match fails
  const lowerConfigField = fieldNameFromConfig.toLowerCase();
  for (const key in row) {
    if (row.hasOwnProperty(key) && typeof key === 'string' && key.toLowerCase() === lowerConfigField) {
      return row[key];
    }
  }
  return undefined; // Field not found
}

export class YNABFormatter {
  // Parses input date string based on hint and standardizes to YYYY-MM-DD
  private static formatDate(dateString: string, inputFormatHint?: string): string {
    let dateObj: Date | undefined = undefined;

    // Prioritize specific format hints if provided
    if (inputFormatHint === 'DD/MM/YYYY' && /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(dateString)) {
        const parts = dateString.split(/[\/\-.]/);
        const yearPart = parts[2].length === 2 ? '20' + parts[2] : parts[2];
        dateObj = new Date(Date.UTC(parseInt(yearPart), parseInt(parts[1]) - 1, parseInt(parts[0])));
    } else if (inputFormatHint === 'MM/DD/YYYY' && /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(dateString)) {
        const parts = dateString.split(/[\/\-.]/);
        const yearPart = parts[2].length === 2 ? '20' + parts[2] : parts[2];
        dateObj = new Date(Date.UTC(parseInt(yearPart), parseInt(parts[0]) - 1, parseInt(parts[1])));
    } else if (inputFormatHint === 'YYYY/MM/DD' && /^\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}$/.test(dateString)) {
        const parts = dateString.split(/[\/\-.]/);
        dateObj = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
    } else {
       // No specific inputFormatHint matched, or no hint provided.
       // Try to parse it normally first.
       const initialDateObj = new Date(dateString);

       // Check if dateString is purely numeric (e.g., "44926", "2023")
       if (/^\d+$/.test(dateString)) {
         const numericValue = parseInt(dateString, 10);
         // And if initialDateObj is valid (not NaN)
         if (!isNaN(initialDateObj.getTime())) {
           // And if the parsed year is the same as the numeric string value
           // (this means Date.parse treated it as a year, e.g., new Date("2023") or new Date("44926"))
           if (initialDateObj.getUTCFullYear() === numericValue) {
             // If this "year" is in a range typical for Excel serials (e.g. 20000-80000, roughly 1954-2119)
             // then it was probably an Excel serial misinterpreted as a year by Date.parse.
             // We choose a range that's less likely to be an actual year someone types.
             if (numericValue >= 20000 && numericValue <= 80000) { 
               const baseDate = new Date(Date.UTC(1899, 11, 30)); // Excel base date for serial numbers
               dateObj = new Date(baseDate.getTime() + numericValue * 24 * 60 * 60 * 1000);
             } else {
               // It was parsed as a year (e.g., "2023"), and it's not in the suspicious Excel serial range. Keep it.
               dateObj = initialDateObj;
             }
           } else {
             // Parsed year is not the same as numericValue OR initialDateObj was for a different kind of date string.
             // Keep initialDateObj. Example: dateString "01022023" might be parsed to Jan 2 2023 by new Date().
             dateObj = initialDateObj;
           }
         } else {
           // initialDateObj is NaN from new Date(dateString).
           // If dateString looks like an Excel serial (4 or 5 digits, common for dates), try parsing it that way.
           if (/^\d{4,5}$/.test(dateString) && numericValue >= 1 && numericValue < 100000) { // Wider range for NaN fallback
             const baseDate = new Date(Date.UTC(1899, 11, 30));
             dateObj = new Date(baseDate.getTime() + numericValue * 24 * 60 * 60 * 1000);
           } else {
             // Still NaN, and doesn't look like a typical Excel serial.
             dateObj = initialDateObj; // Keep the NaN dateObj
           }
         }
       } else {
         // dateString is not purely numeric (e.g., "Dec 25 2023", "2023-12-25").
         // Use the result from new Date(dateString).
         dateObj = initialDateObj;
       }
    }

    if (!dateObj || isNaN(dateObj.getTime())) {
      console.warn(`Could not parse date: "${dateString}" with inputFormatHint: "${inputFormatHint || 'none'}". Falling back to original string.`);
      return dateString; // Return original string if parsing failed
    }
    
    // Standardize to YYYY-MM-DD for internal use, using UTC parts
    const year = dateObj.getUTCFullYear();
    const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getUTCDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Helper to format a YYYY-MM-DD date string to a desired output format string
  static formatDateForOutput(isoDate: string, formatKey?: string): string {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      // If isoDate is not in the expected YYYY-MM-DD format, return it as is.
      return isoDate;
    }
    const parts = isoDate.split('-');
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];

    switch (formatKey) {
      case 'Day/Month/Year': // DD/MM/YYYY
        return `${day}/${month}/${year}`;
      case 'Month/Day/Year': // MM/DD/YYYY
        return `${month}/${day}/${year}`;
      case 'Year/Month/Day': // YYYY/MM/DD
        return `${year}/${month}/${day}`; // Outputting with slashes for consistency with other options
      default:
        // Default to YYYY-MM-DD if no specific formatKey or an unrecognized one is provided
        // YNAB often accepts YYYY-MM-DD directly.
        return isoDate; 
    }
  }


  static async parseFile(file: File, bankType: string, uiDateFormatHint?: string, importStartDate?: string): Promise<NormalizedTransaction[]> {
    const config = bankConfigs[bankType];
    if (!config) {
      throw new Error(`Unsupported bank type: ${bankType}. No configuration found.`);
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    let rawData: any[];

    const effectiveDateFormat = uiDateFormatHint || config.dateFormat;

    if (fileExtension === 'csv') {
      rawData = await this.parseCSV(file); 
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      rawData = await this.parseXLSX(file, config.skipRows);
    } else {
      throw new Error('Unsupported file type. Please upload CSV, XLS, or XLSX.');
    }
    
    const transactions = rawData.slice(fileExtension === 'csv' ? (config.skipRows || 0) : 0).map((row: any, index: number) => {
      // Use getRowValue for case-insensitive access
      const dateValue = getRowValue(row, config.dateField);
      const descriptionValue = getRowValue(row, config.descriptionField);
      const payeeValue = config.payeeField ? getRowValue(row, config.payeeField) : undefined;
      
      let amount: number = 0;
      if (config.transformAmount) {
        const amountArg = config.amountField ? String(getRowValue(row, config.amountField)) : undefined;
        const outflowArg = config.outflowField ? String(getRowValue(row, config.outflowField)) : undefined;
        const inflowArg = config.inflowField ? String(getRowValue(row, config.inflowField)) : undefined;
        amount = config.transformAmount(outflowArg, inflowArg, amountArg);
      } else if (config.amountField) {
        const rawAmount = getRowValue(row, config.amountField);
        const cleanedAmount = typeof rawAmount === 'string' ? rawAmount.replace(/[^0-9.-]/g, '') : String(rawAmount);
        amount = parseFloat(cleanedAmount) || 0;
      } else if (config.outflowField && config.inflowField) {
        const outflow = getRowValue(row, config.outflowField);
        const inflow = getRowValue(row, config.inflowField);
        const outflowNum = parseFloat(String(outflow).replace(/[^0-9.-]/g, '')) || 0;
        const inflowNum = parseFloat(String(inflow).replace(/[^0-9.-]/g, '')) || 0;
        amount = inflowNum - outflowNum;
      }

      if (dateValue === undefined || dateValue === null || String(dateValue).trim() === '' ||
          descriptionValue === undefined || descriptionValue === null || String(descriptionValue).trim() === '') {
        console.warn(`Skipping row ${index + (config.skipRows || 0) + 1} due to missing date or description:`, row);
        return null;
      }
      
      const normalizedTx: NormalizedTransaction = {
        date: this.formatDate(String(dateValue), effectiveDateFormat), // Standardizes to YYYY-MM-DD
        description: String(descriptionValue).trim(),
        amount: amount,
      };

      if (payeeValue !== undefined && payeeValue !== null && String(payeeValue).trim() !== '') {
        normalizedTx.payee = String(payeeValue).trim();
      }
      
      return normalizedTx;
    }).filter(Boolean) as NormalizedTransaction[];
    
    // Filter transactions by importStartDate if provided
    let filteredTransactions = transactions;
    if (importStartDate && importStartDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.log(`Filtering transactions from date (inclusive): ${importStartDate}`);
        filteredTransactions = transactions.filter(tx => {
            if (!tx.date || !tx.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                console.warn(`Transaction has invalid or unparsed date format ('${tx.date}'), cannot reliably filter by start date. Including this transaction:`, tx);
                return true; // Include transactions with unparseable dates
            }
            return tx.date >= importStartDate;
        });
        console.log(`Transactions before start date filtering: ${transactions.length}, after: ${filteredTransactions.length}`);
    }

    if (filteredTransactions.length === 0 && rawData.length > 0) {
        const originalCount = transactions.length; // Count before date filtering
        let reason = "Check field names in bank config (case-insensitive matching is attempted), file structure, skipRows setting, and transformAmount logic.";
        if (importStartDate && importStartDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            if (originalCount > 0) {
                 reason += ` Also, check the 'Import transactions from' date filter ('${importStartDate}'); ${originalCount} transactions were found before this filter was applied.`;
            } else {
                 reason += ` The 'Import transactions from' date filter ('${importStartDate}') is active, but no transactions were found even before applying this filter.`;
            }
        }
        console.warn(`File parsed but no valid transactions extracted. ${reason}`);
        console.log("Raw data sample (first few rows with detected headers):", rawData.slice(0,5));
        console.log("Expected field names from config (will be matched case-insensitively):", {date: config.dateField, desc: config.descriptionField, payee: config.payeeField, amt: config.amountField, outflow: config.outflowField, inflow: config.inflowField });
    }
    return filteredTransactions;
  }

  private static parseCSV(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true, 
        skipEmptyLines: true,
        dynamicTyping: false, 
        complete: (results) => {
          if (results.errors.length) {
            console.error("CSV Parsing errors:", results.errors.map(e => `Row ${e.row}: ${e.message} (${e.code})`).join('\n'));
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
          // cellDates:true attempts to parse dates, dateNF applies if they are numbers
          const workbook = XLSX.read(data, { type: 'array', cellDates: true, dateNF:'yyyy-mm-dd'}); 
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // Get array of arrays to manually handle headers after skipping rows
          const jsonDataRaw: any[][] = XLSX.utils.sheet_to_json(worksheet, {
            raw: false, // Format values (e.g. dates, numbers)
            header: 1,  // Output as array of arrays
            defval: ""  // Default value for empty cells
          });

          if (!jsonDataRaw || jsonDataRaw.length === 0) {
            resolve([]);
            return;
          }

          // Find the header row by looking for the first row with "Date" in the first column
          // This is particularly useful for AMEX imports where the header row position can vary
          let headerRowIndex = skipRows; // Default to skipRows if no "Date" header is found
          
          // Only search for "Date" header if this is likely an AMEX file (based on skipRows value)
          // This preserves behavior for other bank types
          if (skipRows >= 10) { // AMEX typically has skipRows of 12 or 13
            for (let i = 0; i < jsonDataRaw.length; i++) {
              const row = jsonDataRaw[i];
              if (row && row.length > 0 && String(row[0]).trim().toLowerCase() === "date") {
                headerRowIndex = i;
                break;
              }
            }
          }
          
          if (headerRowIndex >= jsonDataRaw.length) {
             console.error("Header row not found or skipRows is too large.");
             resolve([]);
             return;
          }
          
          const headers: string[] = jsonDataRaw[headerRowIndex].map(String);
          const dataRows = jsonDataRaw.slice(headerRowIndex + 1);

          const formattedJsonData = dataRows.map(rowArray => {
            const rowObject: {[key: string]: any} = {};
            rowArray.forEach((cellValue, index) => {
                if (headers[index]) { // Ensure header exists for this column
                    // If cellDates:true parsed it as a Date object
                    if (cellValue instanceof Date) {
                        // Convert to YYYY-MM-DD string using UTC to avoid timezone issues
                        const year = cellValue.getUTCFullYear();
                        const month = (cellValue.getUTCMonth() + 1).toString().padStart(2, '0');
                        const day = cellValue.getUTCDate().toString().padStart(2, '0');
                        rowObject[headers[index]] = `${year}-${month}-${day}`;
                    } else {
                        rowObject[headers[index]] = cellValue !== null && cellValue !== undefined ? String(cellValue) : "";
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

      // Determine Payee
      if (transaction.payee) { // Payee from normalized transaction (via payeeField) takes precedence
        finalPayee = transaction.payee;
      } else if (options.importMemos && options.swapPayeesMemos) {
        finalPayee = description; // If no payeeField, and swap is on, description becomes Payee
      }
      // else finalPayee remains "" (blank)

      // Determine Memo
      if (options.importMemos) {
        if (transaction.payee) {
          // If Payee came from payeeField, Description always goes to Memo
          finalMemo = description;
        } else if (options.swapPayeesMemos) {
          // If no payeeField and swap is on, Description became Payee, so Memo is blank
          finalMemo = ""; 
        } else {
          // If no payeeField and swap is off, Description is Memo
          finalMemo = description;
        }
      }
      // else finalMemo remains "" (blank if importMemos is false)

      // transaction.amount: negative for charges/outflows, positive for payments/inflows (after transformAmount)
      const finalOutflow = transaction.amount < 0 ? Math.abs(transaction.amount).toFixed(2) : "";
      const finalInflow = transaction.amount > 0 ? transaction.amount.toFixed(2) : "";
      
      const ynabDate = YNABFormatter.formatDateForOutput(transaction.date, options.outputDateFormat);

      return {
        Date: ynabDate,
        Payee: finalPayee,
        Category: "", 
        Memo: finalMemo,
        Outflow: finalOutflow,
        Inflow: finalInflow,
      };
    });
  }

  static generateYNABCSVString(ynabTransactions: YNABTransaction[]): string {
    const dataForSheet = ynabTransactions.map(tx => ({
        Date: tx.Date, 
        Payee: tx.Payee,
        Category: tx.Category,
        Memo: tx.Memo,
        Outflow: tx.Outflow,
        Inflow: tx.Inflow
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataForSheet, {
      header: YNAB_CSV_HEADER_ARRAY,
      skipHeader: false, 
    });
    
    const csvString = XLSX.utils.sheet_to_csv(worksheet, { FS: ','}); 
    return csvString; 
  }
}
