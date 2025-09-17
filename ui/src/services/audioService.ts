import axios from 'axios';
import { Voice } from '../types';
import { API_CONFIG } from '../utils/constants';

export interface SavedAudio {
  id: string;
  filename: string;
  display_name: string;
  audio_type: 'standard' | 'project';
  created_at: string;
  source_filename: string;
}

class AudioService {
  private apiClient = axios.create({
    baseURL: API_CONFIG.BASE_URL,
    timeout: API_CONFIG.TIMEOUT,
  });

  // Special client for long-running operations
  private longRunningClient = axios.create({
    baseURL: API_CONFIG.BASE_URL,
    timeout: 300000, // 5 minutes for project creation
  });

  async getAvailableVoices(): Promise<Voice[]> {
    try {
      const response = await this.apiClient.get<Voice[]>('/voices');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch voices from API, returning fallback list.', error);
      return [
        { id: 'smart_voice', name: 'Smart Voice (Auto)', description: 'Model selects a suitable voice', tags: ['professional'] },
      ];
    }
  }

  async testClonedVoice(voiceSample: File, text: string, temperature: number): Promise<ArrayBuffer> {
    const formData = new FormData();
    formData.append('voice_sample', voiceSample);
    formData.append('text', text);
    formData.append('temperature', String(temperature));

    const response = await this.apiClient.post('/generate/test-clone', formData, {
      responseType: 'arraybuffer',
      timeout: 120000, // 2 minutes for voice testing
    });
    return response.data;
  }

  async cloneVoice(voiceSample: File, voiceName: string): Promise<{ id: string; name: string; created_at?: string }> {
    const formData = new FormData();
    formData.append('voice_sample', voiceSample);
    formData.append('voice_name', voiceName);
    const response = await this.apiClient.post('/clone-voice', formData);
    return response.data;
  }

  async updateVoice(voiceId: string, voiceName: string): Promise<Voice> {
    const formData = new FormData();
    formData.append('voice_name', voiceName);
    const response = await this.apiClient.put(`/voice/${voiceId}`, formData);
    return response.data;
  }

  async deleteVoice(voiceId: string): Promise<{ message: string }> {
    const response = await this.apiClient.delete(`/voice/${voiceId}`);
    return response.data;
  }

  // Project-based generation
  async startProject(text: string, voiceId: string, temperature: number, topP: number): Promise<{ project_id: string }> {
    const formData = new FormData();
    formData.append('text', text);
    formData.append('voice_id', voiceId);
    formData.append('temperature', String(temperature));
    formData.append('top_p', String(topP));
    
    const response = await this.longRunningClient.post('/project', formData);
    return response.data;
  }

  async getProjectStatus(projectId: string): Promise<any> {
    const response = await this.apiClient.get(`/project/${projectId}`);
    return response.data;
  }

  async regenerateChunk(projectId: string, chunkIndex: number): Promise<any> {
    const response = await this.longRunningClient.post(`/project/${projectId}/chunk/${chunkIndex}/regenerate`);
    return response.data;
  }
  
  async stitchAudio(projectId: string): Promise<{ final_audio_filename: string }> {
    const response = await this.longRunningClient.post(`/project/${projectId}/stitch`);
    return response.data;
  }

  // Saved audio management
  async saveGeneratedAudio(audioFilename: string, displayName: string, audioType: 'standard' | 'project'): Promise<SavedAudio> {
    const formData = new FormData();
    formData.append('audio_filename', audioFilename);
    formData.append('display_name', displayName);
    formData.append('audio_type', audioType);

    const response = await this.apiClient.post('/saved-audio', formData);
    return response.data;
  }

  async getSavedAudio(): Promise<SavedAudio[]> {
    const response = await this.apiClient.get('/saved-audio');
    return response.data;
  }

  async deleteSavedAudio(savedId: string): Promise<{ message: string }> {
    const response = await this.apiClient.delete(`/saved-audio/${savedId}`);
    return response.data;
  }
  
  getAudioUrl(filename: string): string {
    return `${API_CONFIG.BASE_URL}/audio/${filename}`;
  }
}

export const audioService = new AudioService();