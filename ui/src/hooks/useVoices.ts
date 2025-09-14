import { useState, useEffect } from 'react';
import { Voice } from '../types';
import { audioService } from '../services/audioService';
import { useAudioContext } from '../context/AudioContext';

export const useVoices = () => {
  const { refreshVoices: voiceListVersion } = useAudioContext();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [voicesError, setVoicesError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVoices = async () => {
      try {
        setIsLoadingVoices(true);
        const fetchedVoices = await audioService.getAvailableVoices();
        setVoices(fetchedVoices);
        setVoicesError(null);
      } catch (error) {
        setVoicesError('Failed to load voices');
        console.error('Error fetching voices:', error);
      } finally {
        setIsLoadingVoices(false);
      }
    };

    fetchVoices();
  }, [voiceListVersion]); // Re-run this effect whenever refreshVoices is called

  return { voices, isLoadingVoices, voicesError };
};