import { useState, useEffect, useRef } from 'react';
import { Voice } from '../types';
import { audioService } from '../services/audioService';

export const useVoices = () => {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const DEBOUNCE_DELAY = 500;
  const MIN_FETCH_INTERVAL = 2000;

  useEffect(() => {
    const fetchVoices = async () => {
      const now = Date.now();
      
      if (now - lastFetchTimeRef.current < MIN_FETCH_INTERVAL) {
        return;
      }

      try {
        setIsLoadingVoices(true);
        setVoicesError(null);
        
        const fetchedVoices = await audioService.getAvailableVoices();
        
        const sortedVoices = fetchedVoices.sort((a, b) => {
          const aIsCloned = a.tags?.includes('cloned') || false;
          const bIsCloned = b.tags?.includes('cloned') || false;
          
          if (!aIsCloned && bIsCloned) return -1;
          if (aIsCloned && !bIsCloned) return 1;
          
          return a.name.localeCompare(b.name);
        });
        
        setVoices(sortedVoices);
        lastFetchTimeRef.current = now;
        
      } catch (error) {
        setVoicesError('Failed to load voices');
        console.error('Error fetching voices:', error);
        
        setVoices([
          { 
            id: 'smart_voice', 
            name: 'Smart Voice (Auto)', 
            description: 'Model selects a suitable voice', 
            tags: ['professional'] 
          }
        ]);
      } finally {
        setIsLoadingVoices(false);
      }
    };

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      fetchVoices();
    }, DEBOUNCE_DELAY);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [refreshTrigger]);

  const forceRefresh = () => {
    lastFetchTimeRef.current = 0;
    setRefreshTrigger(prev => prev + 1);
  };

  return { 
    voices, 
    isLoadingVoices, 
    voicesError,
    forceRefresh
  };
};