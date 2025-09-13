import { useState, useEffect, useCallback } from 'react';
import { Voice } from '../types';
import { audioService } from '../services/audioService';

export const useVoices = () => {
    const [voices, setVoices] = useState<Voice[]>([]);
    const [isLoadingVoices, setIsLoadingVoices] = useState(true);
    const [voicesError, setVoicesError] = useState<string | null>(null);

    const fetchVoices = useCallback(async () => {
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
    }, []);

    useEffect(() => {
        fetchVoices();
    }, [fetchVoices]);

    // Expose a function to manually refresh the voice list
    return { voices, isLoadingVoices, voicesError, refreshVoices: fetchVoices };
};
