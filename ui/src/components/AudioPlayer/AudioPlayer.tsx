import React, { useEffect, useRef } from 'react';
import { useAudioContext } from '../../context/AudioContext';
import { Card } from '../ui/Card';

export const AudioPlayer: React.FC = () => {
  const { audioUrl } = useAudioContext();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.play().catch(console.error);
    }
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  if (!audioUrl) {
    return null;
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-200">Generated Audio</h3>
          <a
            href={audioUrl}
            download="generated-audio.wav"
            className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-gray-300"
          >
            Download
          </a>
        </div>
        <audio
          ref={audioRef}
          controls
          src={audioUrl}
          className="w-full"
          style={{ height: '54px' }}
        />
      </div>
    </Card>
  );
};