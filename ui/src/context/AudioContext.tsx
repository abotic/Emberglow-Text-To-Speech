import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Voice } from '../types';

interface AudioContextType {
  // Standard TTS state (separate from Safe TTS)
  standardText: string;
  setStandardText: (text: string) => void;
  standardSelectedVoice: Voice | null;
  setStandardSelectedVoice: (voice: Voice | null) => void;
  
  // Safe TTS state (separate from Standard TTS)
  safeText: string;
  setSafeText: (text: string) => void;
  safeSelectedVoice: Voice | null;
  setSafeSelectedVoice: (voice: Voice | null) => void;
  
  // Shared generation parameters
  temperature: number;
  setTemperature: (temp: number) => void;
  topP: number;
  setTopP: (topP: number) => void;
  
  // Standard TTS generation state
  audioUrl: string | null;
  setAudioUrl: (url: string | null) => void;
  isGenerating: boolean;
  setIsGenerating: (loading: boolean) => void;
  generationError: string | null;
  setGenerationError: (error: string | null) => void;
  currentTask: any;
  setCurrentTask: (task: any) => void;
  
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

  // TTS Guide Modal
  showTtsGuide: boolean;
  setShowTtsGuide: (show: boolean) => void;

  // Audio Saving
  showSaveModal: boolean;
  setShowSaveModal: (show: boolean) => void;
  audioToSave: { filename: string; type: 'standard' | 'project' } | null;
  setAudioToSave: (audio: { filename: string; type: 'standard' | 'project' } | null) => void;

  // Global voice list refresh trigger
  refreshVoices: () => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Standard TTS state
  const [standardText, setStandardText] = useState('');
  const [standardSelectedVoice, setStandardSelectedVoice] = useState<Voice | null>(null);
  
  // Safe TTS state
  const [safeText, setSafeText] = useState('');
  const [safeSelectedVoice, setSafeSelectedVoice] = useState<Voice | null>(null);
  
  // Shared parameters
  const [temperature, setTemperature] = useState(0.3);
  const [topP, setTopP] = useState(0.95);
  
  // Standard generation state
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [currentTask, setCurrentTask] = useState<any>(null);
  
  // Voice cloning state
  const [voiceToClone, setVoiceToClone] = useState<File | null>(null);
  const [clonedVoiceName, setClonedVoiceName] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [cloningError, setCloningError] = useState<string | null>(null);
  const [cloningSuccess, setCloningSuccess] = useState<string | null>(null);
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null);
  
  // TTS Guide Modal
  const [showTtsGuide, setShowTtsGuide] = useState(false);

  // Audio Saving
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [audioToSave, setAudioToSave] = useState<{ filename: string; type: 'standard' | 'project' } | null>(null);
  
  // Voice refresh trigger (using a simple callback instead of state)
  // TODO I don't like this, find a better way before going to production
  const refreshVoices = () => {
  };

  return (
    <AudioContext.Provider
      value={{
        standardText, setStandardText,
        standardSelectedVoice, setStandardSelectedVoice,
        safeText, setSafeText,
        safeSelectedVoice, setSafeSelectedVoice,
        temperature, setTemperature,
        topP, setTopP,
        audioUrl, setAudioUrl,
        isGenerating, setIsGenerating,
        generationError, setGenerationError,
        currentTask, setCurrentTask,
        voiceToClone, setVoiceToClone,
        clonedVoiceName, setClonedVoiceName,
        isCloning, setIsCloning,
        cloningError, setCloningError,
        cloningSuccess, setCloningSuccess,
        isTestingVoice, setIsTestingVoice,
        testAudioUrl, setTestAudioUrl,
        showTtsGuide, setShowTtsGuide,
        showSaveModal, setShowSaveModal,
        audioToSave, setAudioToSave,
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