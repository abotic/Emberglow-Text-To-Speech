import axios from 'axios';
import { Voice } from '../types';
import { API_CONFIG } from '../utils/constants';

class AudioService {
  private apiClient = axios.create({
    baseURL: API_CONFIG.BASE_URL,
    timeout: API_CONFIG.TIMEOUT,
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

  async testClonedVoice(voiceSample: File, text: string, temperature: number): Promise<Blob> {
    const formData = new FormData();
    formData.append('voice_sample', voiceSample);
    formData.append('text', text);
    formData.append('temperature', String(temperature));

    const response = await this.apiClient.post('/generate/test-clone', formData, {
      responseType: 'blob',
    });
    return response.data;
  }

  async cloneVoice(voiceSample: File, voiceName: string): Promise<{ id: string; name: string }> {
    const formData = new FormData();
    formData.append('voice_sample', voiceSample);
    formData.append('voice_name', voiceName);
    const response = await this.apiClient.post('/clone-voice', formData);
    return response.data;
  }

  async startOneshotGeneration(text: string, voiceId: string, temperature: number, topP: number): Promise<string> {
    const formData = new FormData();
    formData.append('text', text);
    formData.append('voice_id', voiceId);
    formData.append('temperature', String(temperature));
    formData.append('top_p', String(topP));

    const response = await this.apiClient.post('/generate/speech/oneshot', formData);
    return response.data.task_id;
  }
  
  async checkOneshotGenerationStatus(taskId: string): Promise<{ status: 'processing' | 'completed' | 'failed'; result_path?: string, error?: string }> {
    const response = await this.apiClient.get(`/generation-status/${taskId}`);
    return response.data;
  }


  async startProject(text: string, voiceId: string, temperature: number, topP: number): Promise<{ project_id: string }> {
    const formData = new FormData();
    formData.append('text', text);
    formData.append('voice_id', voiceId);
    formData.append('temperature', String(temperature));
    formData.append('top_p', String(topP));
    const response = await this.apiClient.post('/project', formData);
    return response.data;
  }

  async getProjectStatus(projectId: string): Promise<any> {
    const response = await this.apiClient.get(`/project/${projectId}`);
    return response.data;
  }

  async regenerateChunk(projectId: string, chunkIndex: number): Promise<any> {
    const response = await this.apiClient.post(`/project/${projectId}/chunk/${chunkIndex}/regenerate`);
    return response.data;
  }
  
  async stitchAudio(projectId: string): Promise<{ final_audio_filename: string }> {
    const response = await this.apiClient.post(`/project/${projectId}/stitch`);
    return response.data;
  }
  
  getAudioUrl(filename: string): string {
    return `${API_CONFIG.BASE_URL}/audio/${filename}`;
  }
}

export const audioService = new AudioService();