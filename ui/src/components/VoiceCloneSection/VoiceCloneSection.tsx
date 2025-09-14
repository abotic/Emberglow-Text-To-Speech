import React, { useRef } from 'react';
import { useAudioContext } from '../../context/AudioContext';
import { audioService } from '../../services/audioService';
import { IconUpload, IconX, IconMic, IconPlay } from '../../icons';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export const VoiceCloneSection: React.FC = () => {
  const {
    voiceToClone, setVoiceToClone,
    clonedVoiceName, setClonedVoiceName,
    isCloning, setIsCloning,
    cloningError, setCloningError,
    cloningSuccess, setCloningSuccess,
    isTestingVoice, setIsTestingVoice,
    testAudioUrl, setTestAudioUrl,
    refreshVoices,
  } = useAudioContext();
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVoiceToClone(file);
      setCloningSuccess(null);
      setCloningError(null);
      setTestAudioUrl(null);
    }
  };

  const handleRemoveFile = () => {
    setVoiceToClone(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTestAudioUrl(null);
  };

  const handleTestVoice = async () => {
    if (!voiceToClone) {
      setCloningError('Please upload a voice sample to test.');
      return;
    }
    setIsTestingVoice(true);
    setCloningError(null);
    setTestAudioUrl(null);
    try {
      // Using a default temperature for testing
      const audioBlob = await audioService.testClonedVoice(voiceToClone, "This is a test of my cloned voice.", 0.3);
      const url = URL.createObjectURL(audioBlob);
      setTestAudioUrl(url);
    } catch (error) {
      setCloningError('Failed to test voice. Please try again.');
      console.error('Voice test error:', error);
    } finally {
      setIsTestingVoice(false);
    }
  };

  const handleSaveVoice = async () => {
    if (!voiceToClone || !clonedVoiceName.trim()) {
      setCloningError('Please provide a voice sample and a name to save.');
      return;
    }
    setIsCloning(true);
    setCloningError(null);
    setCloningSuccess(null);
    try {
      await audioService.cloneVoice(voiceToClone, clonedVoiceName);
      setCloningSuccess(`Voice "${clonedVoiceName}" saved! It is now available in the dropdown.`);
      refreshVoices(); // Trigger a refresh of the voice list
      setTimeout(() => {
        handleRemoveFile();
        setClonedVoiceName('');
        setCloningSuccess(null);
      }, 3000);
    } catch (error) {
      setCloningError('Failed to save voice. Please try again.');
      console.error('Voice cloning error:', error);
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <Card gradient className="p-8">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-white mb-2">Voice Cloning</h2>
          <p className="text-gray-400 text-sm">Create a custom voice by uploading a short audio sample.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            {/* Left Column: Upload & Test */}
            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">Voice Sample (10-30s recommended)</label>
                    {!voiceToClone ? (
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="relative w-full p-8 border-2 border-dashed border-gray-700 rounded-xl text-center hover:border-blue-500 hover:bg-gray-800/30 transition-all duration-300 cursor-pointer group"
                        >
                            <div className="flex flex-col items-center justify-center space-y-3">
                                <div className="p-3 bg-gray-800 rounded-full group-hover:bg-gray-700 transition-colors"><IconUpload className="w-8 h-8 text-gray-400 group-hover:text-blue-400 transition-colors" /></div>
                                <div>
                                    <p className="text-sm font-medium text-gray-300">Click to upload or drag & drop</p>
                                    <p className="text-xs text-gray-500 mt-1">WAV, MP3, or M4A (max 10MB)</p>
                                </div>
                            </div>
                            <input ref={fileInputRef} type="file" className="hidden" accept="audio/*" onChange={handleFileSelect} disabled={isCloning || isTestingVoice} />
                        </div>
                    ) : (
                        <div className="flex items-center justify-between p-4 bg-gray-800/50 border border-gray-700 rounded-xl">
                            <div className="flex items-center space-x-3 overflow-hidden">
                                <div className="p-2 bg-blue-900/50 rounded-lg flex-shrink-0"><IconMic className="w-5 h-5 text-blue-400" /></div>
                                <div className="truncate"><p className="text-sm font-medium text-gray-200 truncate">{voiceToClone.name}</p></div>
                            </div>
                            <button onClick={handleRemoveFile} className="p-2 hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0" disabled={isCloning || isTestingVoice}><IconX className="w-4 h-4 text-gray-400" /></button>
                        </div>
                    )}
                </div>

                <Button variant="secondary" fullWidth onClick={handleTestVoice} disabled={!voiceToClone || isTestingVoice || isCloning} isLoading={isTestingVoice}>
                    <IconPlay className="w-5 h-5" />
                    <span>{isTestingVoice ? 'Testing...' : 'Test Voice'}</span>
                </Button>
                
                {testAudioUrl && <audio controls src={testAudioUrl} className="w-full" />}
            </div>

            {/* Right Column: Name & Save */}
            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">Save Voice to Library</label>
                    <input
                        type="text"
                        className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all duration-200"
                        placeholder="Enter a name for your voice..."
                        value={clonedVoiceName}
                        onChange={(e) => setClonedVoiceName(e.target.value)}
                        disabled={isCloning || isTestingVoice}
                    />
                </div>
                <Button variant="primary" fullWidth onClick={handleSaveVoice} disabled={!voiceToClone || !clonedVoiceName.trim() || isCloning || isTestingVoice} isLoading={isCloning}>
                    <IconUpload className="w-5 h-5" />
                    <span>{isCloning ? 'Saving...' : 'Save Voice'}</span>
                </Button>
            </div>
        </div>

        {/* Status Messages */}
        <div className="pt-2 space-y-2">
            {cloningSuccess && (
                <div className="p-3 bg-green-900/20 border border-green-800/50 rounded-xl text-center">
                    <p className="text-sm text-green-400">✓ {cloningSuccess}</p>
                </div>
            )}
            {cloningError && (
                <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-xl text-center">
                    <p className="text-sm text-red-400">{cloningError}</p>
                </div>
            )}
        </div>
      </div>
    </Card>
  );
};
