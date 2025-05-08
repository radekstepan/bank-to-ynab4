import { BankParseConfig } from '../types/transactions';

// --- Define bank-specific configurations ---
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
