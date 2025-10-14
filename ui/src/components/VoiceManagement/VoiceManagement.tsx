import React, { useEffect, useRef, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { IconUpload, IconX, IconMic, IconPlay, IconSquare } from '../../icons';
import { Voice } from '../../types';
import { audioService } from '../../services/audioService';
import { VoiceItem } from './VoiceItem';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { formatTime } from '../../utils/audio';
import { MAX_AUDIO_FILE_SIZE_BYTES, VALID_AUDIO_MIME_TYPES } from '../../utils/audioConstants';

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

  const [inputMode, setInputMode] = useState<'upload' | 'record'>('upload');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { isRecording, recordingTime, recordingUrl, recordedFile, start, stop, reset } = useAudioRecorder();

  const loadVoices = async () => {
    try {
      setIsLoading(true);
      const fetched = await audioService.getAvailableVoices();
      setVoices(fetched.filter((v) => v.tags?.includes('cloned')));
    } catch {
      setError('Failed to load voices');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadVoices(); }, []);

  useEffect(() => () => {
    if (testAudioUrl) URL.revokeObjectURL(testAudioUrl);
  }, [testAudioUrl]);

  useEffect(() => {
    if (recordedFile && !isRecording) {
      setVoiceToClone(recordedFile);
    }
  }, [recordedFile, isRecording]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!VALID_AUDIO_MIME_TYPES.includes(file.type)) {
      setError('Please upload a valid audio file (WAV, MP3, M4A, OGG, WEBM, MP4).');
      return;
    }
    if (file.size > MAX_AUDIO_FILE_SIZE_BYTES) {
      setError('File size must be less than 10MB');
      return;
    }

    setVoiceToClone(file);
    setSuccess(null);
    setError(null);
    setTestAudioUrl(null);
    reset();
  };

  const handleRemoveFile = () => {
    setVoiceToClone(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTestAudioUrl(null);
    setError(null);
    reset();
  };

  const startRecording = async () => {
    try {
      await start();
      setError(null);
    } catch {
      setError('Microphone access denied or unavailable.');
    }
  };

  const stopRecording = () => {
    stop();
  };

  const handleTestVoice = async () => {
    if (!voiceToClone) {
      setError('Please upload or record a voice sample to test.');
      return;
    }

    setIsTestingVoice(true);
    setError(null);
    setTestAudioUrl(null);

    try {
      const blob = await audioService.testVoice(
        voiceToClone,
        'This is a test of my cloned voice. How does it sound?',
        0.2,
      );
      const url = URL.createObjectURL(blob);
      setTestAudioUrl(url);
    } catch {
      setError('Failed to test voice. Please try again.');
    } finally {
      setIsTestingVoice(false);
    }
  };

  const handleSaveVoice = async () => {
    const name = clonedVoiceName.trim();
    if (!voiceToClone || !name) {
      setError('Please provide a voice sample and a name to save.');
      return;
    }
    if (name.length < 3) {
      setError('Voice name must be at least 3 characters long.');
      return;
    }

    setIsCloning(true);
    setError(null);
    setSuccess(null);

    try {
      await audioService.cloneVoice(voiceToClone, name);
      setSuccess(`Voice "${name}" saved successfully!`);
      await loadVoices();
      handleRemoveFile();
      setClonedVoiceName('');
      setTimeout(() => setSuccess(null), 5000);
    } catch {
      setError('Failed to save voice. Please try again.');
    } finally {
      setIsCloning(false);
    }
  };

  const handleDelete = async (voiceId: string) => {
    if (!confirm('Are you sure you want to delete this voice?')) return;
    try {
      await audioService.deleteVoice(voiceId);
      await loadVoices();
    } catch {
      setError('Failed to delete voice');
    }
  };

  const handleRename = async (voiceId: string, newName: string) => {
    try {
      await audioService.renameVoice(voiceId, newName);
      await loadVoices();
    } catch {
      setError('Failed to rename voice');
    }
  };

  return (
    <div className="space-y-8">
      <Card gradient className="p-6 md:p-8">
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-white mb-2">Clone New Voice</h2>
            <p className="text-gray-400 text-sm">Upload or record a 10-30 second audio sample to create a custom voice</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            <div className="space-y-4">
              <div className="flex p-1 bg-gray-800/60 rounded-lg border border-gray-700">
                <button
                  onClick={() => setInputMode('upload')}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    inputMode === 'upload' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                  disabled={isCloning || isTestingVoice || isRecording}
                >
                  <IconUpload className="w-4 h-4 inline mr-2" />
                  Upload File
                </button>
                <button
                  onClick={() => setInputMode('record')}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    inputMode === 'record' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                  disabled={isCloning || isTestingVoice}
                >
                  <IconMic className="w-4 h-4 inline mr-2" />
                  Record Voice
                </button>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  {inputMode === 'upload' ? 'Voice Sample' : 'Record Your Voice'}
                </label>

                {inputMode === 'upload' ? (
                  !voiceToClone ? (
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
                          <p className="text-xs text-gray-500 mt-1">WAV, MP3, M4A, OGG, WEBM, MP4 (max 10MB)</p>
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
                      <button onClick={handleRemoveFile} className="p-2 hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0" disabled={isCloning || isTestingVoice}>
                        <IconX className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    <div className="p-6 border-2 border-dashed border-gray-700 rounded-xl text-center">
                      <div className="flex flex-col items-center space-y-4">
                        <div className={`p-4 rounded-full transition-all ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-gray-800 hover:bg-gray-700'}`}>
                          <IconMic className={`w-8 h-8 ${isRecording ? 'text-white' : 'text-gray-400'}`} />
                        </div>
                        {isRecording && (
                          <div className="text-center">
                            <p className="text-lg font-mono text-red-400">{formatTime(recordingTime)}</p>
                            <p className="text-xs text-gray-500">Recording...</p>
                          </div>
                        )}
                        <div className="flex gap-3">
                          {!isRecording ? (
                            <Button variant="primary" onClick={startRecording} disabled={isCloning || isTestingVoice}>
                              <IconMic className="w-4 h-4 mr-2" />
                              Start Recording
                            </Button>
                          ) : (
                            <Button variant="danger" onClick={stopRecording}>
                              <IconSquare className="w-4 h-4 mr-2" />
                              Stop Recording
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {recordingUrl && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-4 bg-gray-800/50 border border-gray-700 rounded-xl">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-green-900/50 rounded-lg flex-shrink-0">
                              <IconMic className="w-5 h-5 text-green-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-200">Recorded Voice</p>
                              <p className="text-xs text-gray-500">{formatTime(recordingTime)} duration</p>
                            </div>
                          </div>
                          <button onClick={handleRemoveFile} className="p-2 hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0" disabled={isCloning || isTestingVoice}>
                            <IconX className="w-4 h-4 text-gray-400" />
                          </button>
                        </div>
                        <audio controls src={recordingUrl} className="w-full" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {voiceToClone && !isRecording && (
                <Button variant="secondary" fullWidth onClick={handleTestVoice} disabled={isTestingVoice || isCloning} isLoading={isTestingVoice}>
                  <IconPlay className="w-5 h-5" />
                  <span>{isTestingVoice ? 'Testing Voice...' : 'Test Voice'}</span>
                </Button>
              )}

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
                  disabled={isCloning || isTestingVoice || isRecording}
                  maxLength={50}
                />
                <p className="text-xs text-gray-500">Choose a unique name (3-50 characters)</p>
              </div>

              <Button
                variant="primary"
                fullWidth
                onClick={handleSaveVoice}
                disabled={!voiceToClone || !clonedVoiceName.trim() || clonedVoiceName.trim().length < 3 || isCloning || isTestingVoice || isRecording}
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
                  <li>For recording: speak clearly into microphone</li>
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
            <Button variant="ghost" size="sm" onClick={loadVoices}>Refresh</Button>
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
                <VoiceItem key={voice.id} voice={voice as Voice & { created_at?: string }} onDelete={handleDelete} onRename={handleRename} />
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};