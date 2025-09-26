import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Voice } from '../types';

interface AudioToSave {
  filename: string;
  type: 'standard' | 'project';
}

interface AudioContextType {
  mainText: string;
  setMainText: (text: string) => void;
  mainSelectedVoice: Voice | null;
  setMainSelectedVoice: (voice: Voice | null) => void;
  temperature: number;
  setTemperature: (temp: number) => void;
  topP: number;
  setTopP: (topP: number) => void;
  showTtsGuide: boolean;
  setShowTtsGuide: (show: boolean) => void;
  showSaveModal: boolean;
  setShowSaveModal: (show: boolean) => void;
  audioToSave: AudioToSave | null;
  setAudioToSave: (audio: AudioToSave | null) => void;
  audioUrl: string | null;
  setAudioUrl: (url: string | null) => void;
  currentTask: any; // intentionally any to avoid downstream breakage
  setCurrentTask: (task: any) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [mainText, setMainText] = useState('');
  const [mainSelectedVoice, setMainSelectedVoice] = useState<Voice | null>(null);
  const [temperature, setTemperature] = useState(0.2);
  const [topP, setTopP] = useState(0.95);
  const [showTtsGuide, setShowTtsGuide] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [audioToSave, setAudioToSave] = useState<AudioToSave | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentTask, setCurrentTask] = useState<any>(null);

  return (
    <AudioContext.Provider
      value={{
        mainText,
        setMainText,
        mainSelectedVoice,
        setMainSelectedVoice,
        temperature,
        setTemperature,
        topP,
        setTopP,
        showTtsGuide,
        setShowTtsGuide,
        showSaveModal,
        setShowSaveModal,
        audioToSave,
        setAudioToSave,
        audioUrl,
        setAudioUrl,
        currentTask,
        setCurrentTask,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};

export const useAudioContext = () => {
  const context = useContext(AudioContext);
  if (context === undefined) throw new Error('useAudioContext must be used within an AudioProvider');
  return context;
};