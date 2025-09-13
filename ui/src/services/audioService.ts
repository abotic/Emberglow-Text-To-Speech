import axios from 'axios';
import { Voice } from '../types';

const API_BASE_URL = 'http://localhost:8000';

class AudioService {
  private apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 300000,
  });

  async getAvailableVoices(): Promise<Voice[]> {
    try {
      const response = await this.apiClient.get<Voice[]>('/voices');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch voices:', error);
      // Return fallback voices if API doesn't have this endpoint yet
      return [
        {
          id: 'alloy',
          name: 'Alloy',
          description: 'Neutral and balanced voice',
          gender: 'neutral',
          tags: ['professional', 'clear'],
        },
        {
          id: 'echo',
          name: 'Echo',
          description: 'Male voice with warmth',
          gender: 'male',
          tags: ['warm', 'friendly'],
        },
        {
          id: 'nova',
          name: 'Nova',
          description: 'Female voice with energy',
          gender: 'female',
          tags: ['energetic', 'bright'],
        },
      ];
    }
  }

  async cloneVoice(voiceSample: File, voiceName: string): Promise<{ id: string; name: string }> {
    const formData = new FormData();
    formData.append('voice_sample', voiceSample);
    formData.append('voice_name', voiceName);

    const response = await this.apiClient.post('/clone-voice', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  }

  async generateSpeech(text: string, voiceId: string): Promise<Blob> {
    const formData = new FormData();
    formData.append('text', text);
    formData.append('voice_id', voiceId);

    const response = await this.apiClient.post('/generate/speech', formData, {
      responseType: 'blob',
    });

    return response.data;
  }

  async checkCloningStatus(taskId: string): Promise<{ status: 'processing' | 'completed' | 'failed'; voiceId?: string }> {
    const response = await this.apiClient.get(`/clone-status/${taskId}`);
    return response.data;
  }

  async checkGenerationStatus(taskId: string): Promise<{ status: 'processing' | 'completed' | 'failed'; audioUrl?: string }> {
    const response = await this.apiClient.get(`/generation-status/${taskId}`);
    return response.data;
  }
}

export const audioService = new AudioService();