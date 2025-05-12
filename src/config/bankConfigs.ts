import { BankParseConfig } from '../types/transactions';

// --- Define bank-specific configurations ---
export const bankConfigs: Record<string, BankParseConfig> = {
  eqbank: {
    label: 'EQ Bank (CSV)',
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
  amex: {
    label: 'American Express (XLS)',
    // Summary.xls has its header on row 13 (1-based), so skip the first 12 rows:
    skipRows: 12,
    // These field names will be matched case-insensitively from the XLS headers:
    dateField: 'Date',
    descriptionField: 'Description',
    payeeField: 'Merchant', 
    amountField: 'Amount',
    // AMEX dates are in MM/DD/YYYY (e.g. 07/25/2024)
    dateFormat: 'MM/DD/YYYY',
    // All amounts come in one column.
    // For credit cards in YNAB:
    // - Purchases (charges) should be outflows (negative transaction.amount internally, then positive in YNAB Outflow column).
    // - Payments to the card (or refunds) should be inflows (positive transaction.amount internally, then positive in YNAB Inflow column).
    // This transform assumes the AMEX 'Amount' column shows:
    //   - Charges as POSITIVE numbers (e.g., 50.00 for a purchase).
    //   - Payments/credits as NEGATIVE numbers (e.g., -100.00 for a payment to the card).
    // We multiply by -1 to flip the sign to match our internal convention (charges negative, payments positive).
    transformAmount: (_outflow?: string, _inflow?: string, amount?: string) => {
      if (typeof amount === 'string') {
        // strip out currency/commas and parse
        const cleaned = amount.replace(/[^0-9.\-]/g, '');
        let num = parseFloat(cleaned);
        if (isNaN(num)) {
          return 0;
        }
        // Flip the sign: AMEX positive charges -> internal negative; AMEX negative payments -> internal positive
        return num * -1; 
      }
      return 0;
    }
  },
  scotiabank: {
    label: 'Scotiabank (CSV)',
    // CSV Fields: Filter,Date,Description,Sub-description,Status,Type of Transaction,Amount
    // Header is the first line. Data starts from the second line.
    skipRows: 0, // PapaParse `header: true` uses the first line as headers.
    dateField: 'Date',
    descriptionField: 'Description',    // Will be YNAB Memo if Sub-description is Payee
    payeeField: 'Sub-description',      // Will be YNAB Payee
    amountField: 'Amount',              // This field contains the numeric value
    // transactionTypeField: 'Type of Transaction', // Not directly used by transformAmount signature, but Amount reflects type
    dateFormat: 'YYYY-MM-DD',         // e.g., "2025-05-10"
    transformAmount: (_outflow?: string, _inflow?: string, amountStr?: string) => {
      // Scotiabank CSV sample:
      // Debit:  Type="Debit", Amount="37.88"   -> Internal goal: -37.88
      // Credit: Type="Credit", Amount="-5124.07" -> Internal goal: +5124.07
      if (typeof amountStr === 'string') {
        const cleanedAmount = amountStr.replace(/\$/g, '').replace(/,/g, '');
        const num = parseFloat(cleanedAmount);
        if (isNaN(num)) {
          return 0;
        }
        // If num is positive (e.g., "37.88" for Debit), it's an outflow, return -num.
        // If num is negative (e.g., "-5124.07" for Credit), it's an inflow, return -num (to make it positive).
        // This effectively means all amounts are multiplied by -1 to fit the internal positive=inflow, negative=outflow convention.
        return -num;
      }
      return 0;
    }
  }
};
