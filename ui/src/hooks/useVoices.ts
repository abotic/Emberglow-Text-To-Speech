import { useState, useEffect } from 'react';
import { Voice } from '../types';
import { audioService } from '../services/audioService';

export const useVoices = () => {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [voicesError, setVoicesError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVoices = async () => {
      try {
        setIsLoadingVoices(true);
        const fetchedVoices = await audioService.getAvailableVoices();
        setVoices(fetchedVoices);
      } catch (error) {
        setVoicesError('Failed to load voices');
        console.error('Error fetching voices:', error);
      } finally {
        setIsLoadingVoices(false);
      }
    };

    fetchVoices();
  }, []);

  return { voices, isLoadingVoices, voicesError };
};