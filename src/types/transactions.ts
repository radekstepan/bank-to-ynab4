// Intermediate normalized transaction structure
export interface NormalizedTransaction {
  date: string; // Should be in YYYY-MM-DD format after parsing
  description: string;
  amount: number; // Positive for inflow, negative for outflow
  payee?: string; // Optional: if bank data includes a specific payee/merchant
  // checkNum?: string; // Optional: if bank data includes it
}

// YNAB's expected transaction structure for CSV import
export interface YNABTransaction {
  Date: string;      // Format depends on outputDateFormat option (e.g., DD/MM/YYYY)
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
  payeeField?: string;   // Optional: Field name for Payee/Merchant
  outflowField?: string; 
  inflowField?: string;  
  amountField?: string;  
  skipRows?: number;     
  dateFormat?: string;   // e.g., 'YYYY-MM-DD', 'MM/DD/YYYY', 'DD MMM YYYY' for parsing assistance
  transformAmount?: (outflow?: string, inflow?: string, amount?: string) => number;
}

export interface ConvertToYNABOptions {
  importMemos: boolean;
  swapPayeesMemos: boolean;
  outputDateFormat?: string; // e.g., "Day/Month/Year", "Month/Day/Year", "Year/Month/Day"
}
