import React, { useState } from 'react';
import { useAudioContext } from '../../context/AudioContext';
import { audioService } from '../../services/audioService';
import { IconX, IconSave } from '../../icons';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export const AudioSaveModal: React.FC = () => {
  const { showSaveModal, setShowSaveModal, audioToSave, setAudioToSave } = useAudioContext();
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!showSaveModal || !audioToSave) return null;

  const handleSave = async () => {
    if (!displayName.trim()) {
      setError('Please enter a name for your audio');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await audioService.saveGeneratedAudio(
        audioToSave.filename,
        displayName.trim(),
        audioToSave.type
      );
      
      // Close modal and reset
      setShowSaveModal(false);
      setAudioToSave(null);
      setDisplayName('');
      
    } catch (err) {
      setError('Failed to save audio. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setShowSaveModal(false);
    setAudioToSave(null);
    setDisplayName('');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <Card className="w-full max-w-md">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">Save Audio</h2>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              disabled={isSaving}
            >
              <IconX className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="audio-name" className="block text-sm font-medium text-gray-300 mb-2">
                Audio Name
              </label>
              <input
                id="audio-name"
                type="text"
                className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none"
                placeholder="Enter a name for your audio..."
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isSaving}
                maxLength={100}
              />
            </div>

            <div className="text-xs text-gray-500 p-3 bg-gray-800/30 rounded-lg">
              <p><strong>Type:</strong> {audioToSave.type === 'standard' ? 'Standard TTS' : 'Project Audio'}</p>
              <p><strong>Source:</strong> {audioToSave.filename}</p>
            </div>

            {error && (
              <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-xl">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="ghost"
                fullWidth
                onClick={handleClose}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={handleSave}
                isLoading={isSaving}
                disabled={!displayName.trim()}
              >
                <IconSave className="w-4 h-4 mr-2" />
                Save Audio
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};