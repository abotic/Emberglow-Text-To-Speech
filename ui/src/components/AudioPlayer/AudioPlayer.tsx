import React, { useEffect, useRef } from 'react';
import { useAudioContext } from '../../context/AudioContext';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { IconDownload, IconSave } from '../../icons';

export const AudioPlayer: React.FC = () => {
  const { 
    audioUrl, 
    currentTask,
    setShowSaveModal,
    setAudioToSave
  } = useAudioContext();
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

  const handleDownload = () => {
    if (!audioUrl || !currentTask?.result_path) return;
    
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = currentTask.result_path;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSave = () => {
    if (!currentTask?.result_path) return;
    
    setAudioToSave({ 
      filename: currentTask.result_path, 
      type: 'standard' 
    });
    setShowSaveModal(true);
  };

  if (!audioUrl) {
    return null;
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-200">Generated Audio</h3>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              className="flex items-center gap-2"
              disabled={!currentTask?.result_path}
            >
              <IconSave className="w-4 h-4" />
              Save
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownload}
              className="flex items-center gap-2"
            >
              <IconDownload className="w-4 h-4" />
              Download
            </Button>
          </div>
        </div>
        <audio
          ref={audioRef}
          controls
          src={audioUrl}
          className="w-full"
          style={{ height: '54px' }}
        />
        {currentTask?.elapsed_time && (
          <p className="text-xs text-gray-500 text-center">
            Generated in {Math.round(currentTask.elapsed_time)}s
          </p>
        )}
      </div>
    </Card>
  );
};