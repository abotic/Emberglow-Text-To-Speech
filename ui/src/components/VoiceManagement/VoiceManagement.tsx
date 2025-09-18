import React, { useState, useEffect, useRef } from 'react';
import { audioService } from '../../services/audioService';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { IconUpload, IconX, IconMic, IconPlay, IconEdit2, IconTrash, IconCheck } from '../../icons';
import { Voice } from '../../types';

interface VoiceItemProps {
  voice: Voice & { created_at?: string };
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
}

const VoiceItem: React.FC<VoiceItemProps> = ({ voice, onDelete, onRename }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(voice.name);

  const handleSave = () => {
    if (editName.trim() && editName.trim() !== voice.name) {
      onRename(voice.id, editName.trim());
    }
    setIsEditing(false);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown date';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-xl hover:bg-gray-800/50 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="flex-1 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-sm text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') {
                    setEditName(voice.name);
                    setIsEditing(false);
                  }
                }}
              />
              <button
                onClick={handleSave}
                className="p-1 hover:bg-gray-700 rounded transition-colors"
              >
                <IconCheck className="w-4 h-4 text-green-400" />
              </button>
              <button
                onClick={() => {
                  setEditName(voice.name);
                  setIsEditing(false);
                }}
                className="p-1 hover:bg-gray-700 rounded transition-colors"
              >
                <IconX className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          ) : (
            <div>
              <h3 className="font-medium text-gray-200 truncate">{voice.name}</h3>
              <p className="text-xs text-gray-500 mt-1">{formatDate(voice.created_at)}</p>
            </div>
          )}
        </div>
        {!isEditing && (
          <div className="flex gap-1">
            <button
              onClick={() => setIsEditing(true)}
              className="p-1.5 hover:bg-gray-700 rounded transition-colors"
              title="Rename voice"
            >
              <IconEdit2 className="w-4 h-4 text-gray-400" />
            </button>
            <button
              onClick={() => onDelete(voice.id)}
              className="p-1.5 hover:bg-gray-700 rounded transition-colors"
              title="Delete voice"
            >
              <IconTrash className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const VoiceManagement: React.FC = () => {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [voiceToClone, setVoiceToClone] = useState<File | null>(null);
  const [clonedVoiceName, setClonedVoiceName] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadVoices = async () => {
    try {
      setIsLoading(true);
      const fetchedVoices = await audioService.getAvailableVoices();
      setVoices(fetchedVoices.filter(v => v.tags?.includes('cloned')));
    } catch (err) {
      setError('Failed to load voices');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadVoices();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/m4a', 'audio/ogg'];
      if (!validTypes.includes(file.type)) {
        setError('Please upload a valid audio file (WAV, MP3, or M4A)');
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }

      setVoiceToClone(file);
      setSuccess(null);
      setError(null);
      setTestAudioUrl(null);
    }
  };

  const handleRemoveFile = () => {
    setVoiceToClone(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTestAudioUrl(null);
    setError(null);
  };

  const handleTestVoice = async () => {
    if (!voiceToClone) {
      setError('Please upload a voice sample to test.');
      return;
    }
    
    setIsTestingVoice(true);
    setError(null);
    setTestAudioUrl(null);
    
    try {
      const formData = new FormData();
      formData.append('audio', voiceToClone);
      formData.append('text', "This is a test of my cloned voice. How does it sound?");
      formData.append('temperature', '0.2');
      
      const response = await fetch('/api/test-voice', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Failed to test voice');
      }
      
      const audioBlob = await response.blob();
      const url = URL.createObjectURL(audioBlob);
      setTestAudioUrl(url);
      
    } catch (error) {
      setError('Failed to test voice. Please try again.');
    } finally {
      setIsTestingVoice(false);
    }
  };

  const handleSaveVoice = async () => {
    if (!voiceToClone || !clonedVoiceName.trim()) {
      setError('Please provide a voice sample and a name to save.');
      return;
    }
    
    if (clonedVoiceName.trim().length < 3) {
      setError('Voice name must be at least 3 characters long.');
      return;
    }

    setIsCloning(true);
    setError(null);
    setSuccess(null);
    
    try {
      await audioService.cloneVoice(voiceToClone, clonedVoiceName.trim());
      setSuccess(`Voice "${clonedVoiceName}" saved successfully!`);
      loadVoices();
      
      handleRemoveFile();
      setClonedVoiceName('');
      
      setTimeout(() => setSuccess(null), 5000);
      
    } catch (error) {
      setError('Failed to save voice. Please try again.');
    } finally {
      setIsCloning(false);
    }
  };

  const handleDelete = async (voiceId: string) => {
    if (!confirm('Are you sure you want to delete this voice?')) {
      return;
    }

    try {
      const response = await fetch(`/api/voices/${voiceId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete voice');
      }
      
      loadVoices();
    } catch (err) {
      setError('Failed to delete voice');
    }
  };

  const handleRename = async (voiceId: string, newName: string) => {
    try {
      const response = await fetch(`/api/voices/${voiceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newName }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to rename voice');
      }
      
      loadVoices();
    } catch (err) {
      setError('Failed to rename voice');
    }
  };

  React.useEffect(() => {
    return () => {
      if (testAudioUrl) {
        URL.revokeObjectURL(testAudioUrl);
      }
    };
  }, [testAudioUrl]);

  return (
    <div className="space-y-8">
      <Card gradient className="p-6 md:p-8">
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-white mb-2">Clone New Voice</h2>
            <p className="text-gray-400 text-sm">Upload a 10-30 second audio sample to create a custom voice</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">Voice Sample</label>
                {!voiceToClone ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="relative w-full p-8 border-2 border-dashed border-gray-600 rounded-xl text-center hover:border-blue-500 hover:bg-gray-800/30 transition-all cursor-pointer group"
                  >
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="p-3 bg-gray-800 rounded-full group-hover:bg-gray-700">
                        <IconUpload className="w-8 h-8 text-gray-400 group-hover:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-300">Click to upload or drag & drop</p>
                        <p className="text-xs text-gray-500 mt-1">WAV, MP3, or M4A (max 10MB)</p>
                      </div>
                    </div>
                    <input 
                      ref={fileInputRef} 
                      type="file" 
                      className="hidden" 
                      accept="audio/*" 
                      onChange={handleFileSelect} 
                      disabled={isCloning || isTestingVoice} 
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-4 bg-gray-800/50 border border-gray-700 rounded-xl">
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <div className="p-2 bg-blue-900/50 rounded-lg flex-shrink-0">
                        <IconMic className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="truncate">
                        <p className="text-sm font-medium text-gray-200 truncate">{voiceToClone.name}</p>
                        <p className="text-xs text-gray-500">{Math.round(voiceToClone.size / 1024)}KB</p>
                      </div>
                    </div>
                    <button 
                      onClick={handleRemoveFile} 
                      className="p-2 hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
                      disabled={isCloning || isTestingVoice}
                    >
                      <IconX className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                )}
              </div>

              <Button 
                variant="secondary" 
                fullWidth 
                onClick={handleTestVoice} 
                disabled={!voiceToClone || isTestingVoice || isCloning} 
                isLoading={isTestingVoice}
              >
                <IconPlay className="w-5 h-5" />
                <span>{isTestingVoice ? 'Testing Voice...' : 'Test Voice'}</span>
              </Button>
              
              {testAudioUrl && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">Test Result:</label>
                  <audio controls src={testAudioUrl} className="w-full" />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">Voice Name</label>
                <input
                  type="text"
                  className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter a name for your voice..."
                  value={clonedVoiceName}
                  onChange={(e) => setClonedVoiceName(e.target.value)}
                  disabled={isCloning || isTestingVoice}
                  maxLength={50}
                />
                <p className="text-xs text-gray-500">Choose a unique name (3-50 characters)</p>
              </div>
              
              <Button 
                variant="primary" 
                fullWidth 
                onClick={handleSaveVoice} 
                disabled={!voiceToClone || !clonedVoiceName.trim() || clonedVoiceName.trim().length < 3 || isCloning || isTestingVoice} 
                isLoading={isCloning}
              >
                <IconUpload className="w-5 h-5" />
                <span>{isCloning ? 'Saving Voice...' : 'Save Voice'}</span>
              </Button>

              <div className="p-3 bg-blue-900/20 border border-blue-800/50 rounded-xl text-xs text-blue-200">
                <h4 className="font-semibold mb-1">Tips for best results:</h4>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>Use clear, high-quality audio</li>
                  <li>10-30 seconds is ideal</li>
                  <li>Single speaker, minimal background noise</li>
                </ul>
              </div>
            </div>
          </div>

          {success && (
            <div className="p-3 bg-green-900/20 border border-green-800/50 rounded-xl">
              <p className="text-sm text-green-400">✓ {success}</p>
            </div>
          )}
          {error && (
            <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-xl">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>
      </Card>

      <Card gradient className="p-6 md:p-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white mb-2">My Voices</h2>
              <p className="text-gray-400 text-sm">Manage your cloned voices</p>
            </div>
            <Button variant="ghost" size="sm" onClick={loadVoices}>
              Refresh
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : voices.length === 0 ? (
            <div className="text-center py-12">
              <IconMic className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-400 mb-2">No voices yet</h3>
              <p className="text-sm text-gray-500">Clone a voice above to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {voices.map((voice) => (
                <VoiceItem
                  key={voice.id}
                  voice={voice as Voice & { created_at?: string }}
                  onDelete={handleDelete}
                  onRename={handleRename}
                />
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};