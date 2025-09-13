import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Voice } from '../types';

interface AudioContextType {
  // Text generation state
  text: string;
  setText: (text: string) => void;
  selectedVoice: Voice | null;
  setSelectedVoice: (voice: Voice | null) => void;
  audioUrl: string | null;
  setAudioUrl: (url: string | null) => void;
  isGenerating: boolean;
  setIsGenerating: (loading: boolean) => void;
  generationError: string | null;
  setGenerationError: (error: string | null) => void;
  
  // Voice cloning state
  voiceToClone: File | null;
  setVoiceToClone: (file: File | null) => void;
  clonedVoiceName: string;
  setClonedVoiceName: (name: string) => void;
  isCloning: boolean;
  setIsCloning: (cloning: boolean) => void;
  cloningError: string | null;
  setCloningError: (error: string | null) => void;
  cloningSuccess: boolean;
  setCloningSuccess: (success: boolean) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Text generation state
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  
  // Voice cloning state
  const [voiceToClone, setVoiceToClone] = useState<File | null>(null);
  const [clonedVoiceName, setClonedVoiceName] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [cloningError, setCloningError] = useState<string | null>(null);
  const [cloningSuccess, setCloningSuccess] = useState(false);

  return (
    <AudioContext.Provider
      value={{
        text,
        setText,
        selectedVoice,
        setSelectedVoice,
        audioUrl,
        setAudioUrl,
        isGenerating,
        setIsGenerating,
        generationError,
        setGenerationError,
        voiceToClone,
        setVoiceToClone,
        clonedVoiceName,
        setClonedVoiceName,
        isCloning,
        setIsCloning,
        cloningError,
        setCloningError,
        cloningSuccess,
        setCloningSuccess,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};

export const useAudioContext = () => {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudioContext must be used within an AudioProvider');
  }
  return context;
};