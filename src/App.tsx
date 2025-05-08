import React, { useState, useEffect } from 'react';
import { AlertTriangle, ChevronDown, Check, UploadCloud, Download } from 'lucide-react';
import { YNABFormatter } from './utils/ynabFormatter';
import { NormalizedTransaction, ConvertToYNABOptions } from './types/transactions';
import { bankConfigs } from './config/bankConfigs';
import StyledButton from './components/StyledButton';

// Main App Component
export default function App() {
  const [parsedTransactions, setParsedTransactions] = useState<NormalizedTransaction[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  
  const initialBankOptions = Object.keys(bankConfigs)
    .filter(key => !key.startsWith('generic_')) // Remove generic options
    .map(key => ({
      value: key,
      label: bankConfigs[key].label || key.charAt(0).toUpperCase() + key.slice(1)
    }));

  const [selectedAccount, setSelectedAccount] = useState<string>(initialBankOptions[0]?.value || '');
  const [outputDateFormat, setOutputDateFormat] = useState('Day/Month/Year'); 

  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{type: 'info' | 'success' | 'error' | 'warning', text: string} | null>(null);

  const totalTransactions = parsedTransactions.length;

  const availableBankOptions = Object.keys(bankConfigs)
    .filter(key => !key.startsWith('generic_')) 
    .map(key => ({
      value: key,
      label: bankConfigs[key].label || key.charAt(0).toUpperCase() + key.slice(1)
    }));
  
  useEffect(() => {
    if (availableBankOptions.length > 0 && !availableBankOptions.find(opt => opt.value === selectedAccount)) {
      setSelectedAccount(availableBankOptions[0].value);
    } else if (availableBankOptions.length === 0 && selectedAccount !== '') {
      setSelectedAccount(''); 
    }
  }, [availableBankOptions, selectedAccount]);


  const processAndSetTransactions = async (
    fileToParse: File, 
    accountToUse: string, 
    inputFileDateFormatSetting: string, 
    isReparse: boolean = false
  ) => {
    if (!accountToUse && availableBankOptions.length > 0) {
      setStatusMessage({type: 'warning', text: "Please select a valid bank account type first."});
      setIsProcessing(false);
      return;
    }
    if (availableBankOptions.length === 0) {
        setStatusMessage({type: 'warning', text: "No bank types configured. Cannot process file."});
        setIsProcessing(false);
        return;
    }

    const actionText = isReparse ? "Re-processing" : "Processing";
    const resultText = isReparse ? "re-loaded" : "loaded";

    setStatusMessage({ type: 'info', text: `${actionText} ${fileToParse.name}...` });
    setIsProcessing(true);
    setParsedTransactions([]); 

    try {
        let formatHint = '';
        if (inputFileDateFormatSetting === 'Day/Month/Year') formatHint = 'DD/MM/YYYY';
        else if (inputFileDateFormatSetting === 'Month/Day/Year') formatHint = 'MM/DD/YYYY';
        else if (inputFileDateFormatSetting === 'Year/Month/Day') formatHint = 'YYYY/MM/DD';

        const transactions = await YNABFormatter.parseFile(fileToParse, accountToUse, formatHint);

        if (transactions.length === 0) {
            setParsedTransactions([]);
            setStatusMessage({
                type: 'warning',
                text: `No transactions found in ${fileToParse.name} with current settings. Check file, bank, or input date format.`
            });
        } else {
            setParsedTransactions(transactions);
            setStatusMessage({
                type: 'success',
                text: `${transactions.length} transactions ${resultText} from ${fileToParse.name}. Ready for import preview.`
            });
        }
    } catch (error: any) {
        console.error(`Error ${actionText.toLowerCase()} file:`, error);
        setParsedTransactions([]);
        setStatusMessage({ type: 'error', text: `Error ${actionText.toLowerCase()} file: ${error.message}.` });
    } finally {
        setIsProcessing(false);
    }
  };


  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.csv') || file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) {
        setSelectedFile(file); 
        setSelectedFileName(file.name);
        // Note: outputDateFormat is passed as inputFileDateFormatSetting here. This maintains existing behavior
        // for input parsing hint, though ideally input and output formats are fully decoupled.
        await processAndSetTransactions(file, selectedAccount, outputDateFormat, false);
      } else {
        setSelectedFile(null);
        setSelectedFileName('');
        setParsedTransactions([]);
        setStatusMessage({ type: 'error', text: 'Unsupported file type. Please upload CSV, XLS, or XLSX.' });
      }
    }
    event.target.value = ''; 
  };

  const handleImport = () => {
    if (parsedTransactions.length === 0) {
      setStatusMessage({ type: 'warning', text: 'No transactions to import. Please load a file with valid transactions first.' });
      return;
    }
    setIsProcessing(true);
    setStatusMessage({ type: 'info', text: 'Preparing YNAB4 CSV file...' });

    console.log('Importing transactions with settings:', {
      selectedAccount,
      outputDateFormat, 
      transactionsCount: parsedTransactions.length,
      fieldMapping: "Description to Memo, Payee blank"
    });

    const transactionsToImport = parsedTransactions;

    try {
      const ynabConvertOptions: ConvertToYNABOptions = {
        importMemos: true,      
        swapPayeesMemos: false,
        outputDateFormat: outputDateFormat // Pass the selected output date format
      };
      const ynabTransactions = YNABFormatter.convertToYNABTransactions(transactionsToImport, ynabConvertOptions);
      const ynabCsvString = YNABFormatter.generateYNABCSVString(ynabTransactions);


      const blob = new Blob([ynabCsvString], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const originalFileNameWithoutExt = selectedFileName.substring(0, selectedFileName.lastIndexOf('.')) || selectedFileName || "export";
      link.setAttribute('href', URL.createObjectURL(blob));
      link.setAttribute('download', `${originalFileNameWithoutExt}_YNAB4.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      setStatusMessage({ type: 'success', text: 'Transactions successfully converted and download started!' });
    } catch (error: any) {
        console.error("Error during import process:", error);
        setStatusMessage({ type: 'error', text: `Error during import: ${error.message}` });
    } finally {
        setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    console.log('Import cancelled');
    setSelectedFile(null);
    setSelectedFileName('');
    setParsedTransactions([]);
    setStatusMessage(null);
    setIsProcessing(false);
  };

  const formatDateForDisplay = (isoDate: string): string => {
    try {
        // Assuming isoDate is expected to be in YYYY-MM-DD format from normalization
        const parts = isoDate.split('-');
        if (parts.length !== 3) return isoDate; // Not YYYY-MM-DD

        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10); // 1-indexed month
        const day = parseInt(parts[2], 10);

        if (isNaN(year) || isNaN(month) || isNaN(day)) return isoDate;
        
        // Create a Date object specifically using UTC to avoid timezone shifts
        const d = new Date(Date.UTC(year, month - 1, day)); // month-1 for 0-indexed month in constructor
        
        // Validate if the constructed date matches the input parts (e.g. for invalid dates like 2023-02-30)
        if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
            return isoDate; // Invalid date components
        }
        
        if (isNaN(d.getTime())) return isoDate;

        const displayDay = String(d.getUTCDate()).padStart(2, '0');
        const displayMonth = String(d.getUTCMonth() + 1).padStart(2, '0'); // Back to 1-indexed for display
        const displayYear = String(d.getUTCFullYear()); 

        // Use Day/Month/Year format by default for preview display
        return `${displayDay}/${displayMonth}/${displayYear}`;
    } catch (e) {
        console.error("Error formatting date for display:", e, "Input was:", isoDate);
        return isoDate; 
    }
  };


  return (
    <div className="min-h-screen bg-slate-800 py-6 flex flex-col justify-center sm:py-12 font-sans">
      <div className="relative py-3 sm:max-w-xl md:max-w-2xl lg:max-w-3xl mx-auto w-full">
        <div className="relative px-6 py-8 bg-slate-200 shadow-lg sm:rounded-lg sm:px-10">
          <div className="max-w-full mx-auto">
            <h1 className="text-2xl font-semibold text-slate-700">Import Transactions</h1>
            
            <div className="mt-4">
                <label htmlFor="file-upload-input" className="block text-sm font-medium text-slate-700 mb-1">
                    Select Statement File (.csv, .xls, .xlsx):
                </label>
                <div className="mt-1 flex rounded-md shadow-sm">
                    <div className="relative flex items-stretch flex-grow focus-within:z-10">
                        <input
                            type="file"
                            id="file-upload-input"
                            name="file-upload-input"
                            className="hidden"
                            onChange={handleFileChange}
                            accept=".csv,.xls,.xlsx"
                            disabled={isProcessing}
                        />
                        <label
                            htmlFor="file-upload-input"
                            className={`w-full p-2.5 text-slate-700 bg-white border border-slate-400 rounded-md shadow-sm outline-none appearance-none focus:border-blue-500 cursor-pointer ${isProcessing ? 'bg-slate-100 cursor-not-allowed' : 'hover:bg-slate-50'}`}
                        >
                            {selectedFileName || "Click to select a file..."}
                        </label>
                         <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                           <UploadCloud className="h-5 w-5 text-slate-400" aria-hidden="true" />
                         </div>
                    </div>
                </div>
            </div>

            {statusMessage && (
                 <div className={`mt-4 p-3 rounded-md flex items-start text-sm ${
                    statusMessage.type === 'success' ? 'bg-green-100 border-l-4 border-green-500 text-green-800' :
                    statusMessage.type === 'error' ? 'bg-red-100 border-l-4 border-red-500 text-red-800' :
                    statusMessage.type === 'warning' ? 'bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800' :
                    'bg-blue-100 border-l-4 border-blue-500 text-blue-800'
                 }`}>
                    {statusMessage.type === 'success' && <Check className="h-5 w-5 mr-2 flex-shrink-0" />}
                    {statusMessage.type !== 'success' && <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />}
                    <span>{statusMessage.text}</span>
                 </div>
            )}

            {parsedTransactions.length > 0 && !isProcessing && (
              <>
                {/* Settings Area: Bank Account, Output Date Format */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 items-start">
                  <div>
                    <label htmlFor="bankAccount" className="block text-sm font-medium text-slate-700 mb-1">Importing from Account:</label>
                    <div className="relative">
                        <select
                            id="bankAccount"
                            value={selectedAccount}
                            onChange={async (e) => {
                                const newAccount = e.target.value;
                                setSelectedAccount(newAccount); 
                                if (selectedFile) {
                                    // Note: outputDateFormat is passed as inputFileDateFormatSetting here.
                                    await processAndSetTransactions(selectedFile, newAccount, outputDateFormat, true);
                                } else {
                                     if (statusMessage && statusMessage.text.includes("Please select a valid bank account type first.")) {
                                        if (newAccount || availableBankOptions.length === 0) { 
                                           setStatusMessage(null);
                                        }
                                    }
                                }
                            }}
                            disabled={isProcessing || availableBankOptions.length === 0}
                            className="w-full p-2.5 text-slate-700 bg-white border border-slate-400 rounded-md shadow-sm outline-none appearance-none focus:border-blue-500"
                        >
                          {availableBankOptions.length > 0 ? (
                            availableBankOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))
                          ) : (
                            <option value="" disabled>No bank types configured</option>
                          )}
                        </select>
                        <ChevronDown className="w-5 h-5 text-slate-500 absolute top-1/2 right-3 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="outputDateFormatSelect" className="block text-sm font-medium text-slate-700 mb-1">Output File Date Format:</label>
                    <div className="relative">
                      <select
                        id="outputDateFormatSelect"
                        value={outputDateFormat} 
                        onChange={(e) => { 
                            const newOutputDateFormat = e.target.value;
                            setOutputDateFormat(newOutputDateFormat); 
                            // FIX: Removed re-parsing call to prevent UI reload on output format change.
                            // The change to outputDateFormat will be picked up during the CSV generation (handleImport).
                        }}
                        disabled={isProcessing}
                        className="w-full p-2.5 text-slate-700 bg-white border border-slate-400 rounded-md shadow-sm outline-none appearance-none focus:border-blue-500"
                      >
                        <option value="Day/Month/Year">Day/Month/Year (DD/MM/YYYY)</option>
                        <option value="Month/Day/Year">Month/Day/Year (MM/DD/YYYY)</option>
                        <option value="Year/Month/Day">Year/Month/Day (YYYY/MM/DD)</option>
                      </select>
                      <ChevronDown className="w-5 h-5 text-slate-500 absolute top-1/2 right-3 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                </div>


                <div className="mt-6">
                  <h2 className="text-xl font-semibold text-slate-700 mb-1">Import Preview</h2>
                  <p className="text-xs text-slate-600 mb-2">Bank's 'Description' will be imported as 'Memo'. 'Payee' and 'Category' will be blank.</p>
                  <div className="border border-slate-400 rounded-md overflow-hidden">
                    <div className="max-h-60 overflow-y-auto">
                      <table className="min-w-full divide-y divide-slate-300">
                        <thead className="bg-slate-600 sticky top-0">
                          <tr>
                            {['Date', 'Payee (Blank)', 'Memo (from Description)', 'Amount'].map((header) => (
                              <th
                                key={header}
                                scope="col"
                                className="px-4 py-2.5 text-left text-xs font-medium text-white uppercase tracking-wider"
                              >
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-300">
                          {parsedTransactions.map((tx, index) => (
                                <tr key={index} className="hover:bg-slate-50">
                                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-slate-600">{formatDateForDisplay(tx.date)}</td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-slate-500 italic">(Blank)</td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-slate-800 font-medium">{tx.description}</td>
                                <td className={`px-4 py-2.5 whitespace-nowrap text-sm text-right ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                
                <div className="mt-8 pt-6 border-t border-slate-300 flex justify-end space-x-3">
                  <StyledButton
                    type="button"
                    onClick={handleCancel}
                    disabled={isProcessing}
                    className="border-slate-400 text-slate-700 bg-slate-50 hover:bg-slate-100 focus:ring-slate-500"
                  >
                    Cancel & Reset
                  </StyledButton>
                  <StyledButton
                    type="button"
                    onClick={handleImport}
                    disabled={isProcessing || parsedTransactions.length === 0}
                    className="text-white bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
                    icon={Download}
                  >
                    {isProcessing ? 'Processing...' : 'Download YNAB4 CSV'}
                  </StyledButton>
                </div>
              </>
            )}
            {parsedTransactions.length === 0 && !selectedFile && !isProcessing && (
                 <div className="mt-6 p-4 text-center text-slate-500">
                    <p>Please select a bank statement file to begin.</p>
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
