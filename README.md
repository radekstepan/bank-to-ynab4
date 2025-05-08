# 🏦 Bank to YNAB4 Converter 💰

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

A modern web application that converts bank statement files (CSV, XLS, XLSX) to YNAB4-compatible CSV format for easy importing into YNAB4 (You Need A Budget).

## ✨ Features

- 📊 Support for multiple bank statement formats
- 📅 Configurable date format parsing
- 🔍 Transaction preview before conversion
- 💾 One-click download of YNAB4-compatible CSV files
- 🖥️ Works entirely in your browser - no data is sent to any server
- 🎨 Clean, responsive UI built with React and TailwindCSS

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or newer)
- Yarn or npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/bank-to-ynab4.git
   cd bank-to-ynab4
   ```

2. Install dependencies:
   ```bash
   yarn install
   # or
   npm install
   ```

3. Start the development server:
   ```bash
   yarn start
   # or
   npm start
   ```

4. Open your browser and navigate to `http://localhost:3000` (or the port specified in your Webpack config if different)

## 🛠️ Building for Production

```bash
yarn build
# or
npm run build
```

The built files will be in the `dist` directory, ready to be deployed to any static hosting service.

## 📖 How to Use

1. **Select a Bank Statement File** 📂
   - Click the file upload area to select your bank statement file (CSV, XLS, or XLSX)

2. **Configure Import Settings** ⚙️
   - Choose your bank type from the dropdown menu
   - Select the desired output date format for the YNAB4 CSV file

3. **Preview Transactions** 👀
   - Review the transactions that will be imported
   - Verify that dates, descriptions, and amounts are correctly parsed

4. **Download YNAB4 CSV** ⬇️
   - Click the "Download YNAB4 CSV" button
   - The file will be named with your original filename plus "_YNAB4.csv"

5. **Import into YNAB4** 📥
   - Open YNAB4
   - Use the "Import" function in your desired account
   - Select the downloaded CSV file

## 🏦 Supported Banks

Currently supported bank formats:
- EQ Bank (CSV/XLSX)
- Generic CSV/XLSX with Date, Description, Amount columns (DD/MM/YYYY format)
- Generic CSV/XLSX with Date, Description, Amount columns (MM/DD/YYYY format)

## 🧩 Adding New Bank Formats

To add support for additional banks, edit the `bankConfigs` object in `src/config/bankConfigs.ts`:

```typescript
// src/config/bankConfigs.ts
import { BankParseConfig } from '../types/transactions';

export const bankConfigs: Record<string, BankParseConfig> = {
  // Existing configurations...
  
  your_bank_name: {
    label: 'Your Bank Name (CSV/XLSX)',
    dateField: 'Date Field Name in Statement',
    descriptionField: 'Description Field Name in Statement',
    amountField: 'Amount Field Name in Statement',
    skipRows: 0, // Number of rows to skip before header
    dateFormat: 'DD/MM/YYYY', // Format used in your bank's statements for parsing
    transformAmount: (_outflow?: string, _inflow?: string, amount?: string) => {
      // Custom logic to parse amount if needed
      return amount ? parseFloat(String(amount).replace(/[^0-9.-]/g, '')) : 0;
    }
  }
};
```
You may also need to import `BankParseConfig` from `../types/transactions` if it's not already imported in that file.

## 📝 Notes on YNAB4 Import Format

- Bank's "Description" field is imported as "Memo" in YNAB4
- "Payee" and "Category" fields are left blank for YNAB4 to auto-match
- Positive amounts are treated as inflows, negative amounts as outflows

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License - see the LICENSE file for details.

## 🙏 Acknowledgements

- [React](https://reactjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [TailwindCSS](https://tailwindcss.com/)
- [PapaParse](https://www.papaparse.com/) for CSV parsing
- [SheetJS](https://sheetjs.com/) for Excel file handling
- [Lucide React](https://lucide.dev/) for beautiful icons
- [YNAB4](https://www.youneedabudget.com/) for the awesome budgeting software
