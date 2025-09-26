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

export type ChunkStatus = 'pending' | 'processing' | 'completed' | 'failed';


export interface Chunk {
  index: number;
  text: string;
  status: ChunkStatus;
  audio_filename?: string;
  elapsed_time?: number;
  error?: string;
}


export type ProjectStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'review'
  | 'cancelled'
  | 'stitched'
  | 'cancelling'
  | 'normalizing';


export interface Project {
  id: string;
  audioName?: string;
  chunks: Chunk[];
  progress_percent?: number;
  completed_chunks?: number;
  total_chunks?: number;
  status?: ProjectStatus;
  was_normalized?: boolean;
}