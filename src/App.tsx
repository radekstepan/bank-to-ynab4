import React, { useState, useEffect } from 'react';
import { AlertTriangle, ChevronDown, Check, UploadCloud, Download } from 'lucide-react';
import { YNABFormatter } from './utils/ynabFormatter'; // Ensure YNABFormatter is imported
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

  const [swapPayeesMemos, setSwapPayeesMemos] = useState(false);


  // const totalTransactions = parsedTransactions.length; // Not currently used

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
  }, [availableBankOptions, selectedAccount]); // availableBankOptions is stable unless bankConfigs changes (which it doesn't at runtime)


  const processAndSetTransactions = async (
    fileToParse: File, 
    accountToUse: string, 
    uiDateHint: string, 
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
        const transactions = await YNABFormatter.parseFile(fileToParse, accountToUse, uiDateHint);

        if (transactions.length === 0) {
            setParsedTransactions([]);
            setStatusMessage({
                type: 'warning',
                text: `No transactions found in ${fileToParse.name} with current settings. Check file, bank selection, input date format, or bank configuration (skipRows, field names).`
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

    const transactionsToImport = parsedTransactions;

    try {
      const ynabConvertOptions: ConvertToYNABOptions = {
        importMemos: true, 
        swapPayeesMemos: swapPayeesMemos,
        outputDateFormat: outputDateFormat
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
    setSelectedFile(null);
    setSelectedFileName('');
    setParsedTransactions([]);
    setStatusMessage(null);
    setIsProcessing(false);
    setSwapPayeesMemos(false); 
  };

  // Removed formatDateForDisplay, will use YNABFormatter.formatDateForOutput directly in JSX

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

            {selectedFile && (
              <>
                <div className={`mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 items-start ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
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
                    <label htmlFor="outputDateFormatSelect" className="block text-sm font-medium text-slate-700 mb-1">Date Format (for parsing & output):</label>
                    <div className="relative">
                      <select
                        id="outputDateFormatSelect"
                        value={outputDateFormat} 
                        onChange={(e) => { 
                            const newDateFormat = e.target.value;
                            setOutputDateFormat(newDateFormat); 
                            if (selectedFile && selectedAccount) {
                                processAndSetTransactions(selectedFile, selectedAccount, newDateFormat, true);
                            }
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
                     <p className="text-xs text-slate-500 mt-1">Used for YNAB output CSV and as a hint for parsing input file dates if bank-specific format is not precise.</p>
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="swapPayeeMemo" className="flex items-center text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        id="swapPayeeMemo"
                        checked={swapPayeesMemos}
                        onChange={(e) => setSwapPayeesMemos(e.target.checked)}
                        disabled={isProcessing}
                        className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 mr-2"
                      />
                      Use Description as Payee (if no dedicated Payee field)
                    </label>
                    <p className="text-xs text-slate-500 mt-1">
                      If bank config has a 'Payee Field' (e.g., AMEX 'Merchant'), that field's value is used for Payee.
                      This swap option applies if no such dedicated Payee field is configured for the selected bank.
                    </p>
                  </div>
                </div>

                {parsedTransactions.length > 0 && !isProcessing && (
                  <div className="mt-6">
                    <h2 className="text-xl font-semibold text-slate-700 mb-1">Import Preview</h2>
                    <p className="text-xs text-slate-600 mb-2">
                      Preview based on selected options. Date format matches output selection.
                    </p>
                    <div className="border border-slate-400 rounded-md overflow-hidden">
                      <div className="max-h-60 overflow-y-auto">
                        <table className="min-w-full divide-y divide-slate-300">
                          <thead className="bg-slate-600 sticky top-0">
                            <tr>
                              {['Date', 'Payee', 'Memo', 'Amount'].map((header) => (
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
                            {parsedTransactions.map((tx, index) => {
                                let previewPayee: React.ReactNode = tx.payee || "";
                                let previewMemo: React.ReactNode = tx.description;

                                if (!tx.payee && swapPayeesMemos) {
                                    previewPayee = tx.description;
                                    previewMemo = ""; 
                                } else if (tx.payee) { 
                                    previewMemo = tx.description;
                                }


                                if (previewPayee === "") {
                                    previewPayee = <span className="italic text-slate-500">(Blank)</span>;
                                }
                                if (previewMemo === "") {
                                     previewMemo = <span className="italic text-slate-500">(Blank)</span>;
                                }


                                return (
                                    <tr key={index} className="hover:bg-slate-50">
                                    <td className="px-4 py-2.5 whitespace-nowrap text-sm text-slate-600">
                                      {YNABFormatter.formatDateForOutput(tx.date, outputDateFormat)}
                                    </td>
                                    <td className="px-4 py-2.5 whitespace-nowrap text-sm text-slate-800 font-medium">{previewPayee}</td>
                                    <td className="px-4 py-2.5 whitespace-nowrap text-sm text-slate-800">{previewMemo}</td>
                                    <td className={`px-4 py-2.5 whitespace-nowrap text-sm text-right ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    </tr>
                                );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className={`mt-8 pt-6 border-t border-slate-300 flex justify-end space-x-3 ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
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
            {!selectedFile && !isProcessing && (
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
