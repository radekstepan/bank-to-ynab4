import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { YNABFormatter, YNAB_CSV_HEADER_ARRAY } from './ynabFormatter';
import { NormalizedTransaction, YNABTransaction, ConvertToYNABOptions } from '../types/transactions';
import { bankConfigs } from '../config/bankConfigs';

// Mock dependencies
jest.mock('xlsx');
jest.mock('papaparse');

// Helper to create a mock File
function createMockFile(content: string, name: string, type: string = 'text/csv'): File {
  return new File([content], name, { type });
}

describe('YNABFormatter', () => {
  // Reset all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseFile', () => {
    it('should throw error for unsupported bank type', async () => {
      const file = createMockFile('', 'test.csv');
      await expect(YNABFormatter.parseFile(file, 'unsupported')).rejects.toThrow(
        'Unsupported bank type: unsupported. No configuration found.'
      );
    });

    it('should throw error for unsupported file type', async () => {
      const file = createMockFile('', 'test.txt');
      await expect(YNABFormatter.parseFile(file, 'eqbank')).rejects.toThrow(
        'Unsupported file type. Please upload CSV, XLS, or XLSX.'
      );
    });

    it('should call parseCSV for CSV files', async () => {
      // Setup
      const mockData = [
        { 'Transfer date': '01 Jan 2023', 'Description': 'Test Transaction', 'Amount': '$100.00' }
      ];
      (Papa.parse as jest.Mock).mockImplementation((file, options) => {
        options.complete({ data: mockData, errors: [] });
      });

      // Execute
      const file = createMockFile('', 'test.csv');
      const result = await YNABFormatter.parseFile(file, 'eqbank');

      // Verify
      expect(Papa.parse).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2023-01-01');
      expect(result[0].description).toBe('Test Transaction');
      expect(result[0].amount).toBe(100);
    });

    it('should call parseXLSX for XLSX files', async () => {
      // Setup
      const mockSheetData = [
        ['Date', 'Description', 'Merchant', 'Amount'],
        ['07/25/2023', 'Coffee Shop', 'Starbucks', '10.50']
      ];
      const mockJsonData = [
        { 'Date': '07/25/2023', 'Description': 'Coffee Shop', 'Merchant': 'Starbucks', 'Amount': '10.50' }
      ];

      // Mock XLSX.read and sheet_to_json
      (XLSX.read as jest.Mock).mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} }
      });
      (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValue(mockSheetData);

      // Mock FileReader
      const originalFileReader = global.FileReader;
      const mockFileReaderInstance = {
        onload: null as any,
        onerror: null as any,
        readAsArrayBuffer: jest.fn(function(this: any, blob: Blob) {
          setTimeout(() => {
            if (this.onload) {
              this.onload({ target: { result: new ArrayBuffer(0) } });
            }
          }, 0);
        })
      };
      const MockFileReader = jest.fn(() => mockFileReaderInstance);
      global.FileReader = MockFileReader as any;

      // Mock the private parseXLSX method to return our test data
      const originalParseXLSX = (YNABFormatter as any).parseXLSX;
      (YNABFormatter as any).parseXLSX = jest.fn().mockResolvedValue(mockJsonData);

      // Execute
      const file = createMockFile('', 'test.xlsx');
      const result = await YNABFormatter.parseFile(file, 'amex');

      // Verify
      expect((YNABFormatter as any).parseXLSX).toHaveBeenCalledWith(file, 12); // amex config has skipRows: 12
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2023-07-25');
      expect(result[0].description).toBe('Coffee Shop');
      expect(result[0].payee).toBe('Starbucks');
      expect(result[0].amount).toBe(-10.5); // amex config flips the sign

      // Restore original methods
      (YNABFormatter as any).parseXLSX = originalParseXLSX;
      global.FileReader = originalFileReader;
    });

    it('should handle case-insensitive field matching', async () => {
      // Setup - field names with different casing
      const mockData = [
        { 'TRANSFER DATE': '01 Jan 2023', 'Description': 'Test Transaction', 'amount': '$100.00' }
      ];
      (Papa.parse as jest.Mock).mockImplementation((file, options) => {
        options.complete({ data: mockData, errors: [] });
      });

      // Execute
      const file = createMockFile('', 'test.csv');
      const result = await YNABFormatter.parseFile(file, 'eqbank');

      // Verify
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2023-01-01');
      expect(result[0].description).toBe('Test Transaction');
      expect(result[0].amount).toBe(100);
    });

    it('should skip rows with missing required fields', async () => {
      // Setup - missing description
      const mockData = [
        { 'Transfer date': '01 Jan 2023', 'Description': '', 'Amount': '$100.00' },
        { 'Transfer date': '02 Jan 2023', 'Description': 'Valid Transaction', 'Amount': '$200.00' }
      ];
      (Papa.parse as jest.Mock).mockImplementation((file, options) => {
        options.complete({ data: mockData, errors: [] });
      });

      // Execute
      const file = createMockFile('', 'test.csv');
      const result = await YNABFormatter.parseFile(file, 'eqbank');

      // Verify
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2023-01-02');
      expect(result[0].description).toBe('Valid Transaction');
      expect(result[0].amount).toBe(200);
    });

    it('should handle CSV parsing errors', async () => {
      // Setup - simulate CSV parsing error
      const mockError = new Error('CSV parsing error');
      (Papa.parse as jest.Mock).mockImplementation((file, options) => {
        options.error(mockError);
      });

      // Execute and verify
      const file = createMockFile('', 'test.csv');
      await expect(YNABFormatter.parseFile(file, 'eqbank')).rejects.toThrow('CSV parsing error');
    });

    it('should handle empty data', async () => {
      // Setup - empty data
      (Papa.parse as jest.Mock).mockImplementation((file, options) => {
        options.complete({ data: [], errors: [] });
      });

      // Execute
      const file = createMockFile('', 'test.csv');
      const result = await YNABFormatter.parseFile(file, 'eqbank');

      // Verify
      expect(result).toHaveLength(0);
    });

    it('should handle invalid date formats and log warnings', async () => {
      // Setup - invalid date
      const mockData = [
        { 'Transfer date': 'invalid-date', 'Description': 'Test Transaction', 'Amount': '$100.00' }
      ];
      (Papa.parse as jest.Mock).mockImplementation((file, options) => {
        options.complete({ data: mockData, errors: [] });
      });

      // Spy on console.warn
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Execute
      const file = createMockFile('', 'test.csv');
      const result = await YNABFormatter.parseFile(file, 'eqbank');

      // Verify that a warning was logged about date parsing
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls.some(call => 
        call[0] && typeof call[0] === 'string' && call[0].includes('Could not parse date') && call[0].includes('invalid-date')
      )).toBe(true);

      // Verify that the transaction was still included but with the original date string
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('invalid-date');

      // Restore console.warn
      consoleWarnSpy.mockRestore();
    });
  });

  describe('convertToYNABTransactions', () => {
    const normalizedTransactions: NormalizedTransaction[] = [
      {
        date: '2023-01-01',
        description: 'Grocery Store',
        amount: -50.25,
        payee: 'Whole Foods'
      },
      {
        date: '2023-01-02',
        description: 'Salary Deposit',
        amount: 1000.00
      },
      {
        date: '2023-01-03',
        description: 'Gas Station',
        amount: -30.50
      }
    ];

    it('should convert normalized transactions to YNAB format with default options', () => {
      // Default options
      const options: ConvertToYNABOptions = {
        importMemos: false,
        swapPayeesMemos: false
      };

      const result = YNABFormatter.convertToYNABTransactions(normalizedTransactions, options);

      expect(result).toHaveLength(3);
      
      // Transaction with payee
      expect(result[0]).toEqual({
        Date: '2023-01-01',
        Payee: 'Whole Foods',
        Category: '',
        Memo: '',
        Outflow: '50.25',
        Inflow: ''
      });

      // Transaction with positive amount
      expect(result[1]).toEqual({
        Date: '2023-01-02',
        Payee: '',
        Category: '',
        Memo: '',
        Outflow: '',
        Inflow: '1000.00'
      });

      // Transaction with negative amount
      expect(result[2]).toEqual({
        Date: '2023-01-03',
        Payee: '',
        Category: '',
        Memo: '',
        Outflow: '30.50',
        Inflow: ''
      });
    });

    it('should import memos when importMemos is true', () => {
      const options: ConvertToYNABOptions = {
        importMemos: true,
        swapPayeesMemos: false
      };

      const result = YNABFormatter.convertToYNABTransactions(normalizedTransactions, options);

      // Transaction with payee - description should go to memo
      expect(result[0].Memo).toBe('Grocery Store');
      expect(result[0].Payee).toBe('Whole Foods');

      // Transaction without payee - description should go to memo
      expect(result[2].Memo).toBe('Gas Station');
      expect(result[2].Payee).toBe('');
    });

    it('should swap payees and memos when swapPayeesMemos is true', () => {
      const options: ConvertToYNABOptions = {
        importMemos: true,
        swapPayeesMemos: true
      };

      const result = YNABFormatter.convertToYNABTransactions(normalizedTransactions, options);

      // Transaction with payee - description should go to memo, payee stays as payee
      expect(result[0].Memo).toBe('Grocery Store');
      expect(result[0].Payee).toBe('Whole Foods');

      // Transaction without payee - description should go to payee, memo should be empty
      expect(result[2].Memo).toBe('');
      expect(result[2].Payee).toBe('Gas Station');
    });

    it('should format dates according to outputDateFormat', () => {
      const options: ConvertToYNABOptions = {
        importMemos: false,
        swapPayeesMemos: false,
        outputDateFormat: 'Day/Month/Year'
      };

      const result = YNABFormatter.convertToYNABTransactions(normalizedTransactions, options);

      expect(result[0].Date).toBe('01/01/2023');
      expect(result[1].Date).toBe('02/01/2023');
      expect(result[2].Date).toBe('03/01/2023');
    });
  });

  describe('generateYNABCSVString', () => {
    it('should generate a CSV string from YNAB transactions', () => {
      // Setup
      const ynabTransactions: YNABTransaction[] = [
        {
          Date: '01/01/2023',
          Payee: 'Grocery Store',
          Category: 'Food',
          Memo: 'Weekly shopping',
          Outflow: '50.25',
          Inflow: ''
        },
        {
          Date: '02/01/2023',
          Payee: 'Employer',
          Category: 'Income',
          Memo: 'Salary',
          Outflow: '',
          Inflow: '1000.00'
        }
      ];

      // Mock XLSX.utils.json_to_sheet and sheet_to_csv
      (XLSX.utils.json_to_sheet as jest.Mock).mockReturnValue({});
      (XLSX.utils.sheet_to_csv as jest.Mock).mockReturnValue('Date,Payee,Category,Memo,Outflow,Inflow\n01/01/2023,Grocery Store,Food,Weekly shopping,50.25,\n02/01/2023,Employer,Income,Salary,,1000.00');

      // Execute
      const result = YNABFormatter.generateYNABCSVString(ynabTransactions);

      // Verify
      expect(XLSX.utils.json_to_sheet).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            Date: '01/01/2023',
            Payee: 'Grocery Store',
            Category: 'Food',
            Memo: 'Weekly shopping',
            Outflow: '50.25',
            Inflow: ''
          })
        ]),
        { header: YNAB_CSV_HEADER_ARRAY, skipHeader: false }
      );
      expect(XLSX.utils.sheet_to_csv).toHaveBeenCalled();
      expect(result).toBe('Date,Payee,Category,Memo,Outflow,Inflow\n01/01/2023,Grocery Store,Food,Weekly shopping,50.25,\n02/01/2023,Employer,Income,Salary,,1000.00');
    });
  });

  describe('private formatDate method', () => {
    // Test the private formatDate method indirectly through parseFile
    it('should format DD/MM/YYYY dates correctly', async () => {
      // Setup
      const mockData = [
        { 'Date': '31/12/2023', 'Description': 'Test Transaction', 'Amount': '100.00' }
      ];
      (Papa.parse as jest.Mock).mockImplementation((file, options) => {
        options.complete({ data: mockData, errors: [] });
      });

      // Create a temporary config for testing
      const originalConfigs = { ...bankConfigs };
      (bankConfigs as any).testBank = {
        label: 'Test Bank',
        dateField: 'Date',
        descriptionField: 'Description',
        amountField: 'Amount',
        dateFormat: 'DD/MM/YYYY'
      };

      // Execute
      const file = createMockFile('', 'test.csv');
      const result = await YNABFormatter.parseFile(file, 'testBank');

      // Verify
      expect(result[0].date).toBe('2023-12-31');

      // Restore original configs
      Object.assign(bankConfigs, originalConfigs);
      delete (bankConfigs as any).testBank;
    });

    it('should format MM/DD/YYYY dates correctly', async () => {
      // Setup
      const mockData = [
        { 'Date': '12/31/2023', 'Description': 'Test Transaction', 'Amount': '100.00' }
      ];
      (Papa.parse as jest.Mock).mockImplementation((file, options) => {
        options.complete({ data: mockData, errors: [] });
      });

      // Create a temporary config for testing
      const originalConfigs = { ...bankConfigs };
      (bankConfigs as any).testBank = {
        label: 'Test Bank',
        dateField: 'Date',
        descriptionField: 'Description',
        amountField: 'Amount',
        dateFormat: 'MM/DD/YYYY'
      };

      // Execute
      const file = createMockFile('', 'test.csv');
      const result = await YNABFormatter.parseFile(file, 'testBank');

      // Verify
      expect(result[0].date).toBe('2023-12-31');

      // Restore original configs
      Object.assign(bankConfigs, originalConfigs);
      delete (bankConfigs as any).testBank;
    });

    it('should format YYYY/MM/DD dates correctly', async () => {
      // Setup
      const mockData = [
        { 'Date': '2023/12/31', 'Description': 'Test Transaction', 'Amount': '100.00' }
      ];
      (Papa.parse as jest.Mock).mockImplementation((file, options) => {
        options.complete({ data: mockData, errors: [] });
      });

      // Create a temporary config for testing
      const originalConfigs = { ...bankConfigs };
      (bankConfigs as any).testBank = {
        label: 'Test Bank',
        dateField: 'Date',
        descriptionField: 'Description',
        amountField: 'Amount',
        dateFormat: 'YYYY/MM/DD'
      };

      // Execute
      const file = createMockFile('', 'test.csv');
      const result = await YNABFormatter.parseFile(file, 'testBank');

      // Verify
      expect(result[0].date).toBe('2023-12-31');

      // Restore original configs
      Object.assign(bankConfigs, originalConfigs);
      delete (bankConfigs as any).testBank;
    });

    it('should handle Excel serial date numbers', async () => {
      // Since we can't easily mock the private static formatDate method,
      // we'll test this functionality by checking if the parseFile method
      // can handle Excel serial date numbers correctly
      
      // Setup - create a mock implementation for parseCSV that returns data with Excel date
      const originalParseCSV = (YNABFormatter as any).parseCSV;
      (YNABFormatter as any).parseCSV = jest.fn().mockResolvedValue([
        { 'Date': '44926', 'Description': 'Test Transaction', 'Amount': '100.00' }
      ]);
      
      // Create a console.warn spy to check if any warnings are logged
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Create a temporary config for testing
      const originalConfigs = { ...bankConfigs };
      (bankConfigs as any).testBank = {
        label: 'Test Bank',
        dateField: 'Date',
        descriptionField: 'Description',
        amountField: 'Amount'
      };

      // Execute
      const file = createMockFile('', 'test.csv');
      const result = await YNABFormatter.parseFile(file, 'testBank');

      // Verify - we're not testing the exact date conversion here, just that it doesn't fail
      // and doesn't log a warning about failing to parse the date
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].description).toBe('Test Transaction');
      
      // Check that no warnings were logged about date parsing failures
      const dateWarningCalls = consoleWarnSpy.mock.calls.filter(
        call => call[0] && typeof call[0] === 'string' && call[0].includes('Could not parse date')
      );
      expect(dateWarningCalls.length).toBe(0);

      // Restore original methods and configs
      (YNABFormatter as any).parseCSV = originalParseCSV;
      consoleWarnSpy.mockRestore();
      Object.assign(bankConfigs, originalConfigs);
      delete (bankConfigs as any).testBank;
    });
  });

  describe('private formatDateForOutput method', () => {
    // Test the private formatDateForOutput method indirectly through convertToYNABTransactions
    it('should format dates according to Day/Month/Year format', () => {
      const normalizedTransactions: NormalizedTransaction[] = [
        {
          date: '2023-01-31',
          description: 'Test Transaction',
          amount: 100
        }
      ];

      const options: ConvertToYNABOptions = {
        importMemos: false,
        swapPayeesMemos: false,
        outputDateFormat: 'Day/Month/Year'
      };

      const result = YNABFormatter.convertToYNABTransactions(normalizedTransactions, options);
      expect(result[0].Date).toBe('31/01/2023');
    });

    it('should format dates according to Month/Day/Year format', () => {
      const normalizedTransactions: NormalizedTransaction[] = [
        {
          date: '2023-01-31',
          description: 'Test Transaction',
          amount: 100
        }
      ];

      const options: ConvertToYNABOptions = {
        importMemos: false,
        swapPayeesMemos: false,
        outputDateFormat: 'Month/Day/Year'
      };

      const result = YNABFormatter.convertToYNABTransactions(normalizedTransactions, options);
      expect(result[0].Date).toBe('01/31/2023');
    });

    it('should format dates according to Year/Month/Day format', () => {
      const normalizedTransactions: NormalizedTransaction[] = [
        {
          date: '2023-01-31',
          description: 'Test Transaction',
          amount: 100
        }
      ];

      const options: ConvertToYNABOptions = {
        importMemos: false,
        swapPayeesMemos: false,
        outputDateFormat: 'Year/Month/Day'
      };

      const result = YNABFormatter.convertToYNABTransactions(normalizedTransactions, options);
      expect(result[0].Date).toBe('2023/01/31');
    });

    it('should keep ISO format when no outputDateFormat is specified', () => {
      const normalizedTransactions: NormalizedTransaction[] = [
        {
          date: '2023-01-31',
          description: 'Test Transaction',
          amount: 100
        }
      ];

      const options: ConvertToYNABOptions = {
        importMemos: false,
        swapPayeesMemos: false
      };

      const result = YNABFormatter.convertToYNABTransactions(normalizedTransactions, options);
      expect(result[0].Date).toBe('2023-01-31');
    });
  });
});
