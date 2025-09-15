import React, { useState, useEffect } from 'react';
import { audioService, SavedAudio } from '../../services/audioService';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { IconDownload, IconX, IconMusic } from '../../icons';

export const SavedAudioSection: React.FC = () => {
  const [savedAudio, setSavedAudio] = useState<SavedAudio[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSavedAudio = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const audio = await audioService.getSavedAudio();
      // Sort by creation date, newest first
      setSavedAudio(audio.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } catch (err) {
      setError('Failed to load saved audio');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (savedId: string) => {
    if (!confirm('Are you sure you want to delete this audio?')) {
      return;
    }

    try {
      await audioService.deleteSavedAudio(savedId);
      setSavedAudio(prev => prev.filter(audio => audio.id !== savedId));
    } catch (err) {
      setError('Failed to delete audio');
    }
  };

  const handleDownload = (audio: SavedAudio) => {
    const audioUrl = audioService.getAudioUrl(audio.filename);
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `${audio.display_name}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  useEffect(() => {
    loadSavedAudio();
  }, []);

  if (isLoading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center space-y-4">
          <Spinner size="lg" />
          <p className="text-gray-400">Loading saved audio...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card gradient className="p-8">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white mb-2">Saved Audio</h2>
            <p className="text-gray-400 text-sm">Your collection of saved audio files</p>
          </div>
          <Button variant="ghost" size="sm" onClick={loadSavedAudio}>
            Refresh
          </Button>
        </div>

        {error && (
          <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-xl text-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {savedAudio.length === 0 ? (
          <div className="text-center py-12">
            <div className="mb-4">
              <IconMusic className="w-16 h-16 text-gray-600 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-400 mb-2">No saved audio yet</h3>
            <p className="text-sm text-gray-500">
              Generate some audio and save it to see it appear here
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {savedAudio.map((audio) => (
              <div
                key={audio.id}
                className="p-4 bg-gray-800/50 border border-gray-700 rounded-xl space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-200 truncate" title={audio.display_name}>
                      {audio.display_name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {audio.audio_type === 'standard' ? 'Standard TTS' : 'Project'}
                    </p>
                    <p className="text-xs text-gray-600">
                      {formatDate(audio.created_at)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(audio.id)}
                    className="p-1 hover:bg-gray-700 rounded transition-colors flex-shrink-0"
                    title="Delete audio"
                  >
                    <IconX className="w-4 h-4 text-gray-400" />
                  </button>
                </div>

                <audio
                  controls
                  src={audioService.getAudioUrl(audio.filename)}
                  className="w-full"
                  style={{ height: '40px' }}
                />

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    onClick={() => handleDownload(audio)}
                  >
                    <IconDownload className="w-4 h-4 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {savedAudio.length > 0 && (
          <div className="text-center text-xs text-gray-500 pt-4 border-t border-gray-800">
            {savedAudio.length} saved audio file{savedAudio.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </Card>
  );
};