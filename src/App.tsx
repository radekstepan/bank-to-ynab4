import React, { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, ChevronDown, Check, UploadCloud, FileText, Download } from 'lucide-react';
import { YNABFormatter, NormalizedTransaction, YNABTransaction, bankConfigs, YNAB_CSV_HEADER } from './utils/ynabFormatter';

// Helper component for a styled button (adapted from old app, can be customized)
const StyledButton: React.FC<{
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  className?: string;
  icon?: React.ElementType;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}> = ({ onClick, children, className = '', icon: Icon, disabled = false, type = "button" }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center justify-center px-6 py-2.5 border text-sm font-medium rounded-md shadow-sm transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 ${
      disabled ? 'bg-slate-400 text-slate-700 cursor-not-allowed' : className
    } ${className.includes('bg-') ? '' : 'hover:bg-slate-50'}`}
  >
    {Icon && <Icon size={18} className="mr-2" />}
    {children}
  </button>
);

// Main App Component
export default function App() {
  const [parsedTransactions, setParsedTransactions] = useState<NormalizedTransaction[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  
  // UI State from the new design
  const [selectedAccount, setSelectedAccount] = useState<string>(Object.keys(bankConfigs)[0] || 'eqbank'); // Default to first bank config
  const [includeBeforeStartDate, setIncludeBeforeStartDate] = useState(true);
  const [dateFormat, setDateFormat] = useState('Day/Month/Year'); // Input hint or display format
  const [importMemos, setImportMemos] = useState(true);
  const [swapPayeesMemos, setSwapPayeesMemos] = useState(true);

  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{type: 'info' | 'success' | 'error', text: string} | null>(null);

  // Example count from screenshot - in a real app, this would be dynamic
  const transactionsBeforeStartDateCount = parsedTransactions.filter(tx => {
    // This is a placeholder. Real logic would compare tx.date with account's start date.
    // For now, let's assume first 10% of transactions are "before start date" for demo if more than 5 transactions
    if (parsedTransactions.length > 5) {
        const tenPercentIndex = Math.floor(parsedTransactions.length * 0.1);
        return parsedTransactions.indexOf(tx) < tenPercentIndex;
    }
    return false;
  }).length;

  const totalTransactions = parsedTransactions.length;

  const availableBankOptions = Object.keys(bankConfigs).map(key => ({
    value: key,
    label: bankConfigs[key].label || key.charAt(0).toUpperCase() + key.slice(1) // Use label from config or generate one
  }));
  
  // Effect to update selectedAccount if bankConfigs changes and current selection is invalid
    useEffect(() => {
    if (availableBankOptions.length > 0 && !availableBankOptions.find(opt => opt.value === selectedAccount)) {
      setSelectedAccount(availableBankOptions[0].value);
    }
  }, [availableBankOptions, selectedAccount]);


  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.csv') || file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) {
        setSelectedFile(file);
        setSelectedFileName(file.name);
        setStatusMessage({type: 'info', text: `Processing ${file.name}...`});
        setIsProcessing(true);
        try {
          // Use the 'dateFormat' state as a hint for parsing
          // Assuming 'dateFormat' maps to YNABFormatter's expected inputFormat hints
          let formatHint = '';
          if (dateFormat === 'Day/Month/Year') formatHint = 'DD/MM/YYYY';
          else if (dateFormat === 'Month/Day/Year') formatHint = 'MM/DD/YYYY';
          else if (dateFormat === 'Year/Month/Day') formatHint = 'YYYY/MM/DD'; // Or YYYY-MM-DD

          const transactions = await YNABFormatter.parseFile(file, selectedAccount, formatHint);
          setParsedTransactions(transactions);
          setStatusMessage({type: 'success', text: `${transactions.length} transactions loaded from ${file.name}. Ready for import preview.`});
        } catch (error: any) {
          console.error("Error parsing file:", error);
          setParsedTransactions([]);
          setStatusMessage({ type: 'error', text: `Error parsing file: ${error.message}. Try selecting the correct bank or date format.` });
        } finally {
          setIsProcessing(false);
        }
      } else {
        setSelectedFile(null);
        setSelectedFileName('');
        setParsedTransactions([]);
        setStatusMessage({ type: 'error', text: 'Unsupported file type. Please upload CSV, XLS, or XLSX.' });
      }
    }
    event.target.value = ''; // Reset file input
  };

  const handleImport = () => {
    if (parsedTransactions.length === 0) {
      setStatusMessage({ type: 'error', text: 'No transactions to import. Please load a file first.' });
      alert('No transactions to import. Please load a file first.');
      return;
    }
    setIsProcessing(true);
    setStatusMessage({ type: 'info', text: 'Preparing YNAB CSV file...' });

    console.log('Importing transactions with settings:', {
      selectedAccount,
      includeBeforeStartDate, // This flag would be used to filter parsedTransactions if implemented
      dateFormat, // This was used for parsing, might be logged for context
      importMemos,
      swapPayeesMemos,
      transactionsCount: parsedTransactions.length,
    });

    // Placeholder for filtering transactions based on 'includeBeforeStartDate'
    // For now, we use all parsedTransactions.
    let transactionsToImport = parsedTransactions;
    if (!includeBeforeStartDate) {
        // This is a simplified filter. A real implementation needs account start date.
        // transactionsToImport = parsedTransactions.filter(tx => !isBeforeStartDate(tx.date, accountStartDate));
        console.log("Filtering out transactions before start date (placeholder logic).")
    }


    try {
      const ynabTransactions = YNABFormatter.convertToYNABTransactions(transactionsToImport, {
        importMemos,
        swapPayeesMemos,
      });
      const ynabCsvString = YNABFormatter.generateYNABCSVString(ynabTransactions);

      const blob = new Blob([ynabCsvString], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const originalFileNameWithoutExt = selectedFileName.substring(0, selectedFileName.lastIndexOf('.')) || selectedFileName || "export";
      link.setAttribute('href', URL.createObjectURL(blob));
      link.setAttribute('download', `${originalFileNameWithoutExt}_YNAB_${selectedAccount}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      setStatusMessage({ type: 'success', text: 'Transactions successfully converted and download started!' });
      // alert('Transactions imported (see console for details and file download)!');
    } catch (error: any) {
        console.error("Error during import process:", error);
        setStatusMessage({ type: 'error', text: `Error during import: ${error.message}` });
        // alert(`Error during import: ${error.message}`);
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
    // Add any other cancellation logic (e.g., clear form, close modal if this were a modal)
    alert('Import process cancelled and form reset.');
  };

  // Function to format date for display in the table based on YYYY-MM-DD input
  const formatDateForDisplay = (isoDate: string): string => {
    try {
        const [year, month, day] = isoDate.split('-').map(Number);
        if (!year || !month || !day) return isoDate; // Return original if not YYYY-MM-DD

        const d = new Date(year, month - 1, day);
        if (isNaN(d.getTime())) return isoDate;


        const displayDay = String(d.getDate()).padStart(2, '0');
        const displayMonth = String(d.getMonth() + 1).padStart(2, '0');
        const displayYear = String(d.getFullYear()); // Or .slice(-2) for 'YY'

        switch (dateFormat) {
            case 'Day/Month/Year':
                return `${displayDay}/${displayMonth}/${displayYear}`;
            case 'Month/Day/Year':
                return `${displayMonth}/${displayDay}/${displayYear}`;
            case 'Year/Month/Day':
                return `${displayYear}/${displayMonth}/${displayDay}`;
            default:
                return isoDate; // Fallback
        }
    } catch (e) {
        return isoDate; // Fallback if any error
    }
  };


  return (
    <div className="min-h-screen bg-slate-800 py-6 flex flex-col justify-center sm:py-12 font-sans">
      <div className="relative py-3 sm:max-w-xl md:max-w-2xl lg:max-w-3xl mx-auto w-full">
        <div className="relative px-6 py-8 bg-slate-200 shadow-lg sm:rounded-lg sm:px-10">
          <div className="max-w-full mx-auto">
            <h1 className="text-2xl font-semibold text-slate-700">Import Transactions</h1>
            
            { /* File Upload Section - Added */}
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
                            className="hidden" // Hide default input
                            onChange={handleFileChange}
                            accept=".csv,.xls,.xlsx"
                            disabled={isProcessing}
                        />
                        <label
                            htmlFor="file-upload-input"
                            className={`w-full p-2.5 text-slate-700 bg-white border border-slate-400 rounded-md shadow-sm outline-none appearance-none focus:border-blue-500 cursor-pointer ${isProcessing ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                        >
                            {selectedFileName || "Click to select a file..."}
                        </label>
                         <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                           <UploadCloud className="h-5 w-5 text-slate-400" aria-hidden="true" />
                         </div>
                    </div>
                </div>
                {selectedFileName && (
                    <p className="mt-1 text-xs text-slate-600">Selected: {selectedFileName}</p>
                )}
            </div>

            {statusMessage && (
                 <div className={`mt-4 p-3 rounded-md flex items-start text-sm ${
                    statusMessage.type === 'success' ? 'bg-green-100 border-l-4 border-green-500 text-green-800' :
                    statusMessage.type === 'error' ? 'bg-red-100 border-l-4 border-red-500 text-red-800' :
                    'bg-blue-100 border-l-4 border-blue-500 text-blue-800'
                 }`}>
                    {statusMessage.type === 'success' && <Check className="h-5 w-5 mr-2 flex-shrink-0" />}
                    {statusMessage.type !== 'success' && <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />}
                    <span>{statusMessage.text}</span>
                 </div>
            )}

            {parsedTransactions.length > 0 && !isProcessing && (
              <>
                <p className="mt-4 text-sm text-slate-600">
                  {totalTransactions} transactions loaded from file. Importing into:
                </p>
                
                <div className="mt-2 relative">
                  <select
                    value={selectedAccount}
                    onChange={(e) => {
                        setSelectedAccount(e.target.value);
                        // Optionally re-parse file if bank changes and file already selected
                        if (selectedFile) {
                            // Simulate re-click on file input to trigger re-parse with new bank
                            // This is a bit hacky, direct re-parse call would be cleaner
                            const fileInput = document.getElementById('file-upload-input') as HTMLInputElement;
                            if (fileInput) {
                                // To re-trigger onChange, we'd need to clear and re-set the file or handle it more directly
                                // For now, user might need to reselect file if bank changes post-selection for re-parse
                                // Or, add a "Reparse with new settings" button
                                console.log("Bank changed. For new bank settings to apply to current file, re-select the file or implement re-parse.")
                                // For simplicity, we are not auto-reparsing here. User should be aware.
                                // To make it auto-reparse: call a function similar to handleFileChange's core logic.
                            }
                        }
                    }}
                    disabled={isProcessing}
                    className="w-full p-2.5 text-slate-700 bg-white border border-slate-400 rounded-md shadow-sm outline-none appearance-none focus:border-blue-500"
                  >
                    {availableBankOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-5 h-5 text-slate-500 absolute top-1/2 right-3 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Warning Message Section (Conditional based on transactionsBeforeStartDateCount) */}
                {transactionsBeforeStartDateCount > 0 && (
                    <div className="mt-4 p-3 bg-yellow-100 border-l-4 border-yellow-500 rounded-md flex items-start">
                    <AlertTriangle className="h-6 w-6 text-yellow-600 mr-3 flex-shrink-0" />
                    <div className="text-sm text-yellow-800">
                        <p>This file has {transactionsBeforeStartDateCount} transactions that might be dated before this account's start date. Importing them could modify the account's starting balance.</p>
                    </div>
                    </div>
                )}

                {transactionsBeforeStartDateCount > 0 && (
                    <div className="mt-3 flex items-center">
                    <label htmlFor="includeBeforeDate" className="flex items-center cursor-pointer text-sm text-slate-700">
                        <input
                        type="checkbox"
                        id="includeBeforeDate"
                        checked={includeBeforeStartDate}
                        onChange={(e) => setIncludeBeforeStartDate(e.target.checked)}
                        disabled={isProcessing}
                        className="form-checkbox h-4 w-4 text-blue-600 border-slate-400 rounded focus:ring-blue-500 transition duration-150 ease-in-out"
                        />
                        <span className="ml-2">
                        Include transactions dated before account start date ({transactionsBeforeStartDateCount})
                        </span>
                    </label>
                    </div>
                )}

                <div className="mt-6">
                  <h2 className="text-xl font-semibold text-slate-700 mb-1">Import Preview</h2>
                  <div className="border border-slate-400 rounded-md overflow-hidden">
                    <div className="max-h-60 overflow-y-auto">
                      <table className="min-w-full divide-y divide-slate-300">
                        <thead className="bg-slate-600 sticky top-0">
                          <tr>
                            {['Date', /* 'Check#', */ 'Description/Payee', 'Memo (potential)', 'Amount'].map((header) => (
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
                            // Preview logic based on current settings
                            let previewPayee = swapPayeesMemos && importMemos ? tx.description : "";
                            let previewMemo = !swapPayeesMemos && importMemos ? tx.description : "";
                            if (!importMemos) { // If not importing memos, neither field gets description
                                previewPayee = ""; previewMemo = "";
                            }


                            return (
                                <tr key={index} className="hover:bg-slate-50">
                                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-slate-600">{formatDateForDisplay(tx.date)}</td>
                                {/* <td className="px-4 py-2.5 whitespace-nowrap text-sm text-slate-600">{tx.checkNum}</td> // CheckNum not in NormalizedTransaction */}
                                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-slate-800 font-medium">
                                    { swapPayeesMemos && importMemos ? tx.description : (<em>original payee if available</em>) }
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-slate-600">
                                    { !swapPayeesMemos && importMemos ? tx.description : (swapPayeesMemos && importMemos ? "" : <em>original memo if available</em>) }
                                </td>
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
                
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <div>
                    <label htmlFor="dateFormat" className="block text-sm font-medium text-slate-700 mb-1">Source Date Format (Hint):</label>
                    <div className="relative">
                      <select
                        id="dateFormat"
                        value={dateFormat}
                        onChange={(e) => {
                            setDateFormat(e.target.value);
                            // Consider re-parsing if file selected and date format hint changes.
                            if (selectedFile) {
                                console.warn("Date format hint changed. Re-select file to apply or implement auto-reparse.");
                                // To auto-reparse, call parsing logic here.
                            }
                        }}
                        disabled={isProcessing}
                        className="w-full p-2.5 text-slate-700 bg-white border border-slate-400 rounded-md shadow-sm outline-none appearance-none focus:border-blue-500"
                      >
                        <option>Day/Month/Year</option>
                        <option>Month/Day/Year</option>
                        <option>Year/Month/Day</option>
                      </select>
                      <ChevronDown className="w-5 h-5 text-slate-500 absolute top-1/2 right-3 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Used to help parse dates from your file.</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Field Mapping:</label>
                    <div className="space-y-2 mt-2">
                        <label htmlFor="importMemos" className="flex items-center cursor-pointer text-sm text-slate-700">
                        <input
                            type="checkbox"
                            id="importMemos"
                            checked={importMemos}
                            onChange={(e) => setImportMemos(e.target.checked)}
                            disabled={isProcessing}
                            className="form-checkbox h-4 w-4 text-blue-600 border-slate-400 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2">Use description field for Payee/Memo</span>
                        </label>
                        <label htmlFor="swapPayeesMemos" className="flex items-center cursor-pointer text-sm text-slate-700">
                        <input
                            type="checkbox"
                            id="swapPayeesMemos"
                            checked={swapPayeesMemos}
                            onChange={(e) => setSwapPayeesMemos(e.target.checked)}
                            disabled={isProcessing || !importMemos} // Disable if not importing memos at all
                            className="form-checkbox h-4 w-4 text-blue-600 border-slate-400 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2">Put description into Payee (otherwise Memo)</span>
                        </label>
                    </div>
                     <p className="mt-1 text-xs text-slate-500">Controls how bank's 'description' maps to YNAB's 'Payee' and 'Memo'.</p>
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
                    {isProcessing ? 'Processing...' : 'Download YNAB CSV'}
                  </StyledButton>
                </div>
              </>
            )}
            {parsedTransactions.length === 0 && !isProcessing && !statusMessage && (
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
