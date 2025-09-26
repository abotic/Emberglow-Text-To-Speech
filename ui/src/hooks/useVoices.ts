import { useEffect, useRef, useState } from 'react';
import { Voice } from '../types';
import { audioService } from '../services/audioService';

export const useVoices = () => {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const debounceTimeoutRef = useRef<number | null>(null);
  const lastFetchTimeRef = useRef<number>(0);

  const DEBOUNCE_DELAY = 500;
  const MIN_FETCH_INTERVAL = 2000;

  useEffect(() => {
    const fetchVoices = async () => {
      const now = Date.now();
      if (now - lastFetchTimeRef.current < MIN_FETCH_INTERVAL) return;

      try {
        setIsLoadingVoices(true);
        setVoicesError(null);
        const fetched = await audioService.getAvailableVoices();

        const sorted = [...fetched].sort((a, b) => {
          const aIsCloned = !!a.tags?.includes('cloned');
          const bIsCloned = !!b.tags?.includes('cloned');
          if (aIsCloned !== bIsCloned) return aIsCloned ? 1 : -1;
          return a.name.localeCompare(b.name);
        });

        setVoices(sorted);
        lastFetchTimeRef.current = now;
      } catch (e) {
        setVoicesError('Failed to load voices');
        setVoices([
          { id: 'smart_voice', name: 'Smart Voice (Auto)', description: 'Model selects a suitable voice', tags: ['professional'] },
        ]);
      } finally {
        setIsLoadingVoices(false);
      }
    };

    if (debounceTimeoutRef.current) window.clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = window.setTimeout(fetchVoices, DEBOUNCE_DELAY);

    return () => {
      if (debounceTimeoutRef.current) window.clearTimeout(debounceTimeoutRef.current);
    };
  }, [refreshTrigger]);

  const forceRefresh = () => {
    lastFetchTimeRef.current = 0;
    setRefreshTrigger((v) => v + 1);
  };

  return { voices, isLoadingVoices, voicesError, forceRefresh };
};