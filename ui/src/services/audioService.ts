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
    timeout: 60000,
  });

  private longRunningClient = axios.create({
    baseURL: API_CONFIG.BASE_URL,
    timeout: 300000,
  });

  async getAvailableVoices(): Promise<Voice[]> {
    const response = await this.apiClient.get<Voice[]>('/voices');
    return response.data;
  }

  async cloneVoice(voiceSample: File, voiceName: string): Promise<{ id: string; name: string; }> {
    const formData = new FormData();
    formData.append('voice_sample', voiceSample);
    formData.append('voice_name', voiceName);
    const response = await this.apiClient.post('/clone-voice', formData);
    return response.data;
  }

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

  async cleanupProject(projectId: string): Promise<{ message: string }> {
    const response = await this.apiClient.post(`/project/${projectId}/cleanup`);
    return response.data;
  }

  async cancelProject(projectId: string): Promise<{ message: string }> {
    const response = await this.apiClient.post(`/project/${projectId}/cancel`);
    return response.data;
  }
  
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