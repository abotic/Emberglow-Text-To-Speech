import React, { useRef, useState } from 'react';
import { audioService } from '../../services/audioService';
import { IconUpload, IconX, IconMic, IconPlay } from '../../icons';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export const VoiceCloneSection: React.FC = () => {
  const [voiceToClone, setVoiceToClone] = useState<File | null>(null);
  const [clonedVoiceName, setClonedVoiceName] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [cloningError, setCloningError] = useState<string | null>(null);
  const [cloningSuccess, setCloningSuccess] = useState<string | null>(null);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/m4a', 'audio/ogg'];
      if (!validTypes.includes(file.type)) {
        setCloningError('Please upload a valid audio file (WAV, MP3, or M4A)');
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        setCloningError('File size must be less than 10MB');
        return;
      }

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
    setCloningError(null);
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
    
    if (clonedVoiceName.trim().length < 3) {
      setCloningError('Voice name must be at least 3 characters long.');
      return;
    }

    setIsCloning(true);
    setCloningError(null);
    setCloningSuccess(null);
    
    try {
      await audioService.cloneVoice(voiceToClone, clonedVoiceName.trim());
      setCloningSuccess(`Voice "${clonedVoiceName}" saved successfully! It's now available in the voice dropdown.`);
      
      setTimeout(() => {
        handleRemoveFile();
        setClonedVoiceName('');
        setCloningSuccess(null);
      }, 5000);
      
    } catch (error) {
      setCloningError('Failed to save voice. Please try again.');
      console.error('Voice cloning error:', error);
    } finally {
      setIsCloning(false);
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
    <Card gradient className="p-8">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-white mb-2">Voice Cloning</h2>
          <p className="text-gray-400 text-sm">Create a custom voice by uploading a short audio sample (10-30 seconds recommended).</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">Voice Sample</label>
                    {!voiceToClone ? (
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="relative w-full p-8 border-2 border-dashed border-gray-700 rounded-xl text-center hover:border-blue-500 hover:bg-gray-800/30 transition-all duration-300 cursor-pointer group"
                        >
                            <div className="flex flex-col items-center justify-center space-y-3">
                                <div className="p-3 bg-gray-800 rounded-full group-hover:bg-gray-700 transition-colors">
                                  <IconUpload className="w-8 h-8 text-gray-400 group-hover:text-blue-400 transition-colors" />
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
                        className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all duration-200"
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
                  <ul className="space-y-1 list-disc list-inside">
                    <li>Use clear, high-quality audio</li>
                    <li>10-30 seconds is ideal length</li>
                    <li>Single speaker, minimal background noise</li>
                    <li>Natural speaking pace</li>
                  </ul>
                </div>
            </div>
        </div>

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