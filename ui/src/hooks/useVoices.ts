import { useState, useEffect, useRef } from 'react';
import { Voice } from '../types';
import { audioService } from '../services/audioService';
import { useAudioContext } from '../context/AudioContext';

export const useVoices = () => {
  const { refreshVoices: voiceListVersion } = useAudioContext();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  
  // Debouncing state
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const DEBOUNCE_DELAY = 500; // 500ms debounce
  const MIN_FETCH_INTERVAL = 2000; // Minimum 2 seconds between fetches

  useEffect(() => {
    const fetchVoices = async () => {
      const now = Date.now();
      
      // Check if we've fetched recently
      if (now - lastFetchTimeRef.current < MIN_FETCH_INTERVAL) {
        return;
      }

      try {
        setIsLoadingVoices(true);
        setVoicesError(null);
        
        const fetchedVoices = await audioService.getAvailableVoices();
        
        // Sort voices: default voices first, then cloned voices alphabetically
        const sortedVoices = fetchedVoices.sort((a, b) => {
          const aIsCloned = a.tags?.includes('cloned') || false;
          const bIsCloned = b.tags?.includes('cloned') || false;
          
          // Default voices first
          if (!aIsCloned && bIsCloned) return -1;
          if (aIsCloned && !bIsCloned) return 1;
          
          // Within same category, sort alphabetically
          return a.name.localeCompare(b.name);
        });
        
        setVoices(sortedVoices);
        lastFetchTimeRef.current = now;
        
      } catch (error) {
        setVoicesError('Failed to load voices');
        console.error('Error fetching voices:', error);
        
        // Set fallback voice if fetch fails
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

    // Clear any existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set debounced fetch
    debounceTimeoutRef.current = setTimeout(() => {
      fetchVoices();
    }, DEBOUNCE_DELAY);

    // Cleanup timeout on unmount
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [voiceListVersion]); // Re-run when voice list version changes

  return { 
    voices, 
    isLoadingVoices, 
    voicesError,
    // Helper function to manually refresh voices (bypasses debouncing)
    forceRefresh: () => {
      lastFetchTimeRef.current = 0; // Reset the last fetch time
      // Trigger a refresh by incrementing the version
      // This will cause the effect to run immediately
      setIsLoadingVoices(true);
      audioService.getAvailableVoices()
        .then(fetchedVoices => {
          const sortedVoices = fetchedVoices.sort((a, b) => {
            const aIsCloned = a.tags?.includes('cloned') || false;
            const bIsCloned = b.tags?.includes('cloned') || false;
            
            if (!aIsCloned && bIsCloned) return -1;
            if (aIsCloned && !bIsCloned) return 1;
            
            return a.name.localeCompare(b.name);
          });
          
          setVoices(sortedVoices);
          setVoicesError(null);
        })
        .catch(error => {
          setVoicesError('Failed to load voices');
          console.error('Error fetching voices:', error);
        })
        .finally(() => {
          setIsLoadingVoices(false);
        });
    }
  };
};