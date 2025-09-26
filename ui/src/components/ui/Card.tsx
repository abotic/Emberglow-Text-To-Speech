import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  gradient?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', gradient = false }) => {
  const base = 'bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-800 shadow-2xl';
  const grad = gradient ? 'bg-gradient-to-br from-gray-900/60 to-gray-800/60' : '';
  return <div className={`${base} ${grad} ${className}`}>{children}</div>;
};