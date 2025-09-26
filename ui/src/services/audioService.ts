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
  private apiClient = axios.create({ baseURL: API_CONFIG.BASE_URL, timeout: 60000 });
  private longRunningClient = axios.create({ baseURL: API_CONFIG.BASE_URL, timeout: 0 });

  async getActiveProjects(): Promise<{ id: string; name: string; status: string }[]> {
    const { data } = await this.apiClient.get('/active-projects');
    return data;
  }

  async getConfig(): Promise<{ is_openai_enabled: boolean }> {
    const { data } = await this.apiClient.get('/config');
    return data;
  }

  async getAvailableVoices(): Promise<Voice[]> {
    const { data } = await this.apiClient.get<Voice[]>('/voices');
    return data;
  }

  async cloneVoice(voiceSample: File, voiceName: string): Promise<{ id: string; name: string }> {
    const formData = new FormData();
    formData.append('voice_sample', voiceSample);
    formData.append('voice_name', voiceName);
    const { data } = await this.apiClient.post('/clone-voice', formData);
    return data;
  }

  async testVoice(sample: File, text: string, temperature = 0.2): Promise<Blob> {
    const formData = new FormData();
    formData.append('audio', sample);
    formData.append('text', text);
    formData.append('temperature', String(temperature));
    const { data } = await this.apiClient.post('/test-voice', formData, { responseType: 'blob' });
    return data as Blob;
  }

  async deleteVoice(voiceId: string): Promise<void> {
    await this.apiClient.delete(`/voices/${voiceId}`);
  }

  async renameVoice(voiceId: string, newName: string): Promise<void> {
    await this.apiClient.put(`/voices/${voiceId}`, { name: newName });
  }

  async startProject(text: string, voiceId: string, temperature: number, topP: number, autoNormalize = true): Promise<{ project_id: string; was_normalized?: boolean }> {
    const formData = new FormData();
    formData.append('text', text);
    formData.append('voice_id', voiceId);
    formData.append('temperature', String(temperature));
    formData.append('top_p', String(topP));
    formData.append('auto_normalize', String(autoNormalize));
    const { data } = await this.longRunningClient.post('/project', formData);
    return data;
  }

  async getProjectStatus(projectId: string): Promise<any> {
    const { data } = await this.apiClient.get(`/project/${projectId}`);
    return data;
  }

  async regenerateChunk(projectId: string, chunkIndex: number): Promise<any> {
    const { data } = await this.longRunningClient.post(`/project/${projectId}/chunk/${chunkIndex}/regenerate`);
    return data;
  }

  async stitchAudio(projectId: string): Promise<{ final_audio_filename: string }> {
    const { data } = await this.longRunningClient.post(`/project/${projectId}/stitch`);
    return data;
  }

  async cleanupProject(projectId: string): Promise<{ message: string }> {
    const { data } = await this.apiClient.post(`/project/${projectId}/cleanup`);
    return data;
  }

  async cancelProject(projectId: string): Promise<{ message: string }> {
    const { data } = await this.apiClient.post(`/project/${projectId}/cancel`);
    return data;
  }

  async downloadNormalizedText(projectId: string, filename: string): Promise<void> {
    const { data } = await this.apiClient.get(`/project/${projectId}/normalized-text`, { responseType: 'blob' });
    const blob = new Blob([data], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  async saveGeneratedAudio(audioFilename: string, displayName: string, audioType: 'standard' | 'project'): Promise<SavedAudio> {
    const formData = new FormData();
    formData.append('audio_filename', audioFilename);
    formData.append('display_name', displayName);
    formData.append('audio_type', audioType);
    const { data } = await this.apiClient.post('/saved-audio', formData);
    return data;
  }

  async getSavedAudio(): Promise<SavedAudio[]> {
    const { data } = await this.apiClient.get('/saved-audio');
    return data;
  }

  async deleteSavedAudio(savedId: string): Promise<{ message: string }> {
    const { data } = await this.apiClient.delete(`/saved-audio/${savedId}`);
    return data;
  }

  getAudioUrl(filename: string): string {
    return `${API_CONFIG.BASE_URL}/audio/${filename}`;
  }
}

export const audioService = new AudioService();