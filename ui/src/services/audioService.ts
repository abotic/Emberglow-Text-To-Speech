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
            console.error('Failed to fetch voices from API, returning fallback.', error);
            // Return a default voice if the API call fails
            return [{
                id: 'smart_voice',
                name: 'Smart Voice (Auto)',
                description: 'Model selects a suitable voice',
                tags: ['professional', 'clear']
            }];
        }
    }

    async cloneVoice(voiceSample: File, voiceName: string): Promise<{ id: string; name: string }> {
        const formData = new FormData();
        formData.append('voice_sample', voiceSample);
        formData.append('voice_name', voiceName);

        // This endpoint is now synchronous and returns immediately
        const response = await this.apiClient.post('/clone-voice', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });

        return response.data;
    }

    async startSpeechGeneration(text: string, voiceId: string): Promise<string> {
        const formData = new FormData();
        formData.append('text', text);
        formData.append('voice_id', voiceId);

        const response = await this.apiClient.post('/generate/speech', formData);
        return response.data.task_id;
    }

    async checkGenerationStatus(taskId: string): Promise<{ status: 'processing' | 'completed' | 'failed'; result_path?: string; error?: string }> {
        const response = await this.apiClient.get(`/generation-status/${taskId}`);
        return response.data;
    }

    getAudioUrl(filename: string): string {
        return `${API_CONFIG.BASE_URL}/audio/${filename}`;
    }
}

export const audioService = new AudioService();