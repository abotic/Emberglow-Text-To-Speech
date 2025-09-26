import { useCallback, useEffect, useRef } from 'react';
import type { Project } from '../types';

interface Options {
    onUpdate: (p: Project) => void;
    onDone?: (p: Project) => void;
    onError?: (err: unknown) => void;
    interval?: number;
}

export function useProjectPolling(
    fetchStatus: (projectId: string) => Promise<Project>,
    { onUpdate, onDone, onError, interval = 5000 }: Options
) {
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const stop = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const start = useCallback(
        (projectId: string) => {
            stop();

            const poll = async () => {
                try {
                    const data = await fetchStatus(projectId);
                    onUpdate(data);

                    const isDone = ['completed', 'failed', 'review', 'cancelled', 'stitched'].includes(
                        data.status || ''
                    );
                    const hasProcessingChunks = data.chunks.some((c) => c.status === 'processing');

                    if (!isDone || hasProcessingChunks) {
                        timeoutRef.current = setTimeout(poll, interval);
                    } else {
                        stop();
                        onDone?.(data);
                    }
                } catch (err: any) {
                    const status =
                        err?.response?.status ??
                        err?.status ??
                        err?.code ??
                        undefined;

                    if (status === 503) {
                        timeoutRef.current = setTimeout(poll, Math.min(2000, interval));
                        return;
                    }

                    stop();
                    onError?.(err);
                }
            };

            poll();
        },
        [fetchStatus, interval, onDone, onError, onUpdate, stop]
    );

    useEffect(() => stop, [stop]);

    return { start, stop } as const;
}
