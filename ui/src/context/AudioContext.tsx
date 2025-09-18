import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Voice } from '../types';

interface AudioContextType {
  // Main TTS state
  mainText: string;
  setMainText: (text: string) => void;
  mainSelectedVoice: Voice | null;
  setMainSelectedVoice: (voice: Voice | null) => void;
  
  // Generation parameters
  temperature: number;
  setTemperature: (temp: number) => void;
  topP: number;
  setTopP: (topP: number) => void;

  // TTS Guide Modal
  showTtsGuide: boolean;
  setShowTtsGuide: (show: boolean) => void;

  // Audio Saving
  showSaveModal: boolean;
  setShowSaveModal: (show: boolean) => void;
  audioToSave: { filename: string; type: 'standard' | 'project' } | null;
  setAudioToSave: (audio: { filename: string; type: 'standard' | 'project' } | null) => void;
  
  // Audio playback
  audioUrl: string | null;
  setAudioUrl: (url: string | null) => void;
  currentTask: any;
  setCurrentTask: (task: any) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Main TTS state
  const [mainText, setMainText] = useState('');
  const [mainSelectedVoice, setMainSelectedVoice] = useState<Voice | null>(null);
  
  // Parameters
  const [temperature, setTemperature] = useState(0.2);
  const [topP, setTopP] = useState(0.95);
  
  // TTS Guide Modal
  const [showTtsGuide, setShowTtsGuide] = useState(false);

  // Audio Saving
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [audioToSave, setAudioToSave] = useState<{ filename: string; type: 'standard' | 'project' } | null>(null);
  
  // Audio playback
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentTask, setCurrentTask] = useState<any>(null);

  return (
    <AudioContext.Provider
      value={{
        mainText, setMainText,
        mainSelectedVoice, setMainSelectedVoice,
        temperature, setTemperature,
        topP, setTopP,
        showTtsGuide, setShowTtsGuide,
        showSaveModal, setShowSaveModal,
        audioToSave, setAudioToSave,
        audioUrl, setAudioUrl,
        currentTask, setCurrentTask,
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