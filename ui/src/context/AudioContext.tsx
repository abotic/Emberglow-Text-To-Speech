import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Voice } from '../types';

interface AudioContextType {
  // Text generation state
  text: string;
  setText: (text: string) => void;
  selectedVoice: Voice | null;
  setSelectedVoice: (voice: Voice | null) => void;
  temperature: number;
  setTemperature: (temp: number) => void;
  topP: number;
  setTopP: (topP: number) => void;
  
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
  cloningSuccess: string | null;
  setCloningSuccess: (success: string | null) => void;
  isTestingVoice: boolean;
  setIsTestingVoice: (testing: boolean) => void;
  testAudioUrl: string | null;
  setTestAudioUrl: (url: string | null) => void;

  // Global voice list refresh trigger
  refreshVoices: () => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [temperature, setTemperature] = useState(0.3);
  const [topP, setTopP] = useState(0.95);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  
  const [voiceToClone, setVoiceToClone] = useState<File | null>(null);
  const [clonedVoiceName, setClonedVoiceName] = useState('');
  const [isCloning, setIsCloning] = useState(false); // For saving
  const [isTestingVoice, setIsTestingVoice] = useState(false); // For testing
  const [cloningError, setCloningError] = useState<string | null>(null);
  const [cloningSuccess, setCloningSuccess] = useState<string | null>(null);
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null);
  
  // This state is used as a simple event bus to trigger a refresh in the useVoices hook
  const [voiceListVersion, setVoiceListVersion] = useState(0);
  const refreshVoices = () => setVoiceListVersion(v => v + 1);

  return (
    <AudioContext.Provider
      value={{
        text, setText,
        selectedVoice, setSelectedVoice,
        temperature, setTemperature,
        topP, setTopP,
        audioUrl, setAudioUrl,
        isGenerating, setIsGenerating,
        generationError, setGenerationError,
        voiceToClone, setVoiceToClone,
        clonedVoiceName, setClonedVoiceName,
        isCloning, setIsCloning,
        cloningError, setCloningError,
        cloningSuccess, setCloningSuccess,
        isTestingVoice, setIsTestingVoice,
        testAudioUrl, setTestAudioUrl,
        refreshVoices,
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
