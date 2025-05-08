import React, { useState, useCallback } from 'react';
import { UploadCloud, FileText, Download, AlertCircle, CheckCircle, ChevronDown } from 'lucide-react';
import { YNABFormatter } from './utils/ynabFormatter'; // Import the class and header

// Helper component for a styled button
const StyledButton: React.FC<{
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  icon?: React.ElementType;
  disabled?: boolean;
}> = ({ onClick, children, className = '', icon: Icon, disabled = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center justify-center px-6 py-3 rounded-lg shadow-md font-semibold text-white transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-opacity-50 ${
      disabled ? 'bg-gray-400 cursor-not-allowed' : className
    } hover:shadow-lg transform hover:-translate-y-0.5`}
  >
    {Icon && <Icon size={20} className="mr-2" />}
    {children}
  </button>
);

// Helper component for a styled select dropdown
const StyledSelect: React.FC<{
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  id?: string;
}> = ({ value, onChange, options, placeholder, id }) => (
  <div className="relative w-full">
    <select
      id={id}
      value={value}
      onChange={onChange}
      className="w-full px-4 py-3 pr-10 bg-white border border-gray-300 rounded-lg shadow-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-700"
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map(option => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none">
      <ChevronDown size={20} className="text-gray-400" />
    </div>
  </div>
);

interface ConversionStatus {
  type: 'success' | 'error' | 'info';
  message: string;
}

// Main App Component
const App = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [bank, setBank] = useState('eqbank'); // Default to EQ Bank
  const [isConverting, setIsConverting] = useState(false);
  const [conversionStatus, setConversionStatus] = useState<ConversionStatus | null>(null);
  const [convertedData, setConvertedData] = useState<string | null>(null);

  const bankOptions = [
    { value: 'eqbank', label: 'EQ Bank (CSV/XLSX)' },
    // Add other banks here. Ensure 'value' matches a key in ynabFormatter.ts bankConfigs
    // { value: 'td', label: 'TD Bank' },
    // { value: 'rbc', label: 'RBC Royal Bank' },
  ];

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.csv') || file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) {
        setSelectedFile(file);
        setSelectedFileName(file.name);
        setConversionStatus(null);
        setConvertedData(null);
      } else {
        setSelectedFile(null);
        setSelectedFileName('');
        setConversionStatus({ type: 'error', message: 'Unsupported file type. Please upload CSV, XLS, or XLSX.' });
      }
    }
    event.target.value = ''; // Reset file input
  };

  const handleBankChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setBank(event.target.value);
    setConversionStatus(null);
    setConvertedData(null);
  };

  const processFile = useCallback(async () => {
    if (!selectedFile) {
      setConversionStatus({ type: 'error', message: 'Please select a file first.' });
      return;
    }

    setIsConverting(true);
    setConversionStatus({ type: 'info', message: `Processing ${selectedFileName} for ${bankOptions.find(b => b.value === bank)?.label}...` });
    setConvertedData(null);

    try {
      // Use YNABFormatter to parse and convert
      const normalizedTransactions = await YNABFormatter.parseFile(selectedFile, bank);
      if (normalizedTransactions.length === 0) {
        setConversionStatus({ type: 'error', message: 'No transactions found or file format is incorrect for the selected bank. Please check the file or bank selection.' });
        setIsConverting(false);
        return;
      }
      const ynabTransactions = YNABFormatter.convertToYNABTransactions(normalizedTransactions);
      const ynabCsvString = YNABFormatter.generateYNABCSVString(ynabTransactions);
      
      setConvertedData(ynabCsvString);
      setConversionStatus({ type: 'success', message: 'File converted successfully to YNAB4 format!' });

    } catch (error: any) {
      console.error("Error processing file:", error);
      setConversionStatus({ type: 'error', message: `Error processing file: ${error.message}. Check console for details.` });
    }

    setIsConverting(false);
  }, [selectedFile, bank, selectedFileName, bankOptions]);


  const handleDownload = () => {
    if (!convertedData) {
      setConversionStatus({ type: 'error', message: 'No converted data available to download.' });
      return;
    }

    const blob = new Blob([convertedData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      const originalFileNameWithoutExt = selectedFileName.substring(0, selectedFileName.lastIndexOf('.')) || selectedFileName;
      link.setAttribute('href', url);
      link.setAttribute('download', `${originalFileNameWithoutExt}_YNAB.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setConversionStatus({ type: 'info', message: 'Download started.' });
    } else {
       setConversionStatus({ type: 'error', message: 'Download not supported by your browser.' });
    }
  };

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files?.[0];
    if (file) {
       if (file.name.endsWith('.csv') || file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) {
        setSelectedFile(file);
        setSelectedFileName(file.name);
        setConversionStatus(null);
        setConvertedData(null);
      } else {
        setSelectedFile(null);
        setSelectedFileName('');
        setConversionStatus({ type: 'error', message: 'Unsupported file type. Please drag & drop CSV, XLS, or XLSX.' });
      }
    }
  }, []);


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-gray-700 flex flex-col items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 md:p-12 rounded-xl shadow-2xl w-full max-w-2xl transform transition-all duration-500 ease-in-out">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800">Bank File to YNAB4 Converter</h1>
          <p className="text-gray-600 mt-2">Convert your bank statements (XLS, CSV) into YNAB4-ready CSV files.</p>
        </header>

        <main>
          <section className="mb-8">
            <label htmlFor="bank-select" className="block text-lg font-semibold text-gray-700 mb-2">
              1. Select Bank / Institution
            </label>
            <StyledSelect
              id="bank-select"
              value={bank}
              onChange={handleBankChange}
              options={bankOptions}
              placeholder="Choose your bank"
            />
          </section>

          <section className="mb-8">
            <label htmlFor="file-upload" className="block text-lg font-semibold text-gray-700 mb-2">
              2. Upload Statement File
            </label>
            <div
              className="mt-2 flex justify-center px-6 pt-10 pb-12 border-2 border-gray-300 border-dashed rounded-lg hover:border-indigo-500 transition-colors duration-300 bg-gray-50"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <div className="space-y-2 text-center">
                <UploadCloud size={48} className="mx-auto text-gray-400" />
                <div className="flex text-sm text-gray-600">
                  <label
                    htmlFor="file-upload-input"
                    className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500 p-1"
                  >
                    <span>Upload a file</span>
                    <input id="file-upload-input" name="file-upload-input" type="file" className="sr-only" onChange={handleFileChange} accept=".csv,.xls,.xlsx" />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">CSV, XLS, XLSX up to 10MB</p>
                {selectedFileName && (
                  <div className="mt-3 text-sm text-green-700 bg-green-100 border border-green-300 rounded-md p-2 inline-flex items-center">
                    <FileText size={16} className="mr-2" />
                    Selected: {selectedFileName}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="mb-8 text-center">
             <StyledButton
              onClick={processFile}
              disabled={isConverting || !selectedFile}
              className="bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500 w-full md:w-auto"
            >
              {isConverting ? 'Converting...' : 'Convert to YNAB4 Format'}
            </StyledButton>
          </section>

          {conversionStatus && (
            <section className={`p-4 mb-6 rounded-lg text-sm flex items-center shadow ${
              conversionStatus.type === 'success' ? 'bg-green-100 text-green-800 border border-green-300' :
              conversionStatus.type === 'error' ? 'bg-red-100 text-red-800 border border-red-300' :
              'bg-blue-100 text-blue-800 border border-blue-300'
            }`}>
              {conversionStatus.type === 'success' && <CheckCircle size={20} className="mr-3 flex-shrink-0" />}
              {conversionStatus.type === 'error' && <AlertCircle size={20} className="mr-3 flex-shrink-0" />}
              {conversionStatus.type === 'info' && <AlertCircle size={20} className="mr-3 flex-shrink-0" />}
              <p>{conversionStatus.message}</p>
            </section>
          )}

          {convertedData && conversionStatus?.type === 'success' && (
            <section className="text-center">
              <StyledButton
                onClick={handleDownload}
                className="bg-green-600 hover:bg-green-700 focus:ring-green-500 w-full md:w-auto"
                icon={Download}
              >
                Download YNAB4 CSV
              </StyledButton>
            </section>
          )}
        </main>

        <footer className="mt-12 text-center text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} Bank to YNAB4 Converter. For personal use.</p>
          <p className="mt-1">
            YNAB&reg; is a registered trademark of You Need A Budget LLC. This tool is not affiliated with YNAB.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;
