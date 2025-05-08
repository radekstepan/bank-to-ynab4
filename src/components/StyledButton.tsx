import React from 'react';

// Helper component for a styled button
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

export default StyledButton;
