import React from 'react';

interface ProgressBarProps {
  progress: number; // 0-100
  variant?: 'default' | 'error' | 'success';
  className?: string;
  showText?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, variant = 'default', className = '', showText = false }) => {
  const variants = { default: 'bg-blue-500', error: 'bg-red-500', success: 'bg-green-500' } as const;
  const clamped = Math.max(0, Math.min(100, progress));

  return (
    <div className={`w-full bg-gray-700 rounded-full h-2 overflow-hidden ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped)}>
      <div className={`h-full transition-all duration-300 ease-out ${variants[variant]}`} style={{ width: `${clamped}%` }}>
        {showText && (
          <div className="flex items-center justify-center h-full text-xs text-white font-medium">{Math.round(clamped)}%</div>
        )}
      </div>
    </div>
  );
};