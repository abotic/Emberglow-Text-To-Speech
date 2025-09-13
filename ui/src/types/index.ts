export interface Voice {
    id: string;
    name: string;
    description?: string;
    previewUrl?: string;
    language?: string;
    gender?: 'male' | 'female' | 'neutral';
    tags?: string[];
  }
  
  export interface AudioGenerationRequest {
    text: string;
    voiceId?: string;
    voiceSample?: File;
    speed?: number;
    pitch?: number;
  }
  
  export interface AudioGenerationResponse {
    audioUrl: string;
    duration?: number;
    id: string;
  }
  
  export interface AppState {
    text: string;
    selectedVoice: Voice | null;
    voiceSample: File | null;
  }