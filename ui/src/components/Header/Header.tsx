import React from 'react';
import { IconSparkles } from '../../icons';

export const Header: React.FC = () => (
  <div className="text-center mb-8">
    <div className="inline-flex items-center justify-center mb-4">
      <div className="relative">
        <div className="absolute inset-0 blur-xl bg-gradient-to-r from-blue-400 to-indigo-600 opacity-50" />
        <IconSparkles className="w-12 h-12 text-blue-400 relative" />
      </div>
    </div>
    <h1 className="text-5xl sm:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-600 tracking-tight">
      Emberglow TTS
    </h1>
    <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
      Professional text-to-speech generation with advanced voice synthesis and cloning capabilities
    </p>
  </div>
);