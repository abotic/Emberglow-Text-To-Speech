import React from 'react';

interface ProgressBarProps {
  progress: number; // 0-100
  variant?: 'default' | 'error' | 'success';
  className?: string;
  showText?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ 
  progress, 
  variant = 'default', 
  className = '', 
  showText = false 
}) => {
  const variants = {
    default: 'bg-blue-500',
    error: 'bg-red-500',
    success: 'bg-green-500',
  };

  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className={`w-full bg-gray-700 rounded-full h-2 overflow-hidden ${className}`}>
      <div
        className={`h-full transition-all duration-300 ease-out ${variants[variant]}`}
        style={{ width: `${clampedProgress}%` }}
      >
        {showText && (
          <div className="flex items-center justify-center h-full text-xs text-white font-medium">
            {Math.round(clampedProgress)}%
          </div>
        )}
      </div>
    </div>
  );
};