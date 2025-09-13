import React, { useRef } from 'react';
import { useAudioContext } from '../../context/AudioContext';
import { useVoices } from '../../hooks/useVoices';
import { audioService } from '../../services/audioService';
import { IconUpload, IconX, IconMic } from '../../icons';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export const VoiceCloneSection: React.FC = () => {
    const {
        voiceToClone,
        setVoiceToClone,
        clonedVoiceName,
        setClonedVoiceName,
        isCloning,
        setIsCloning,
        cloningError,
        setCloningError,
        cloningSuccess,
        setCloningSuccess,
    } = useAudioContext();

    const { refreshVoices } = useVoices();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setVoiceToClone(file);
            setCloningSuccess(false);
            setCloningError(null);
        }
    };

    const handleRemoveFile = () => {
        setVoiceToClone(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleCloneVoice = async () => {
        if (!voiceToClone || !clonedVoiceName.trim()) {
            setCloningError('Please provide both a voice sample and a name');
            return;
        }

        setIsCloning(true);
        setCloningError(null);
        setCloningSuccess(false);

        try {
            await audioService.cloneVoice(voiceToClone, clonedVoiceName);
            setCloningSuccess(true);
            refreshVoices(); // Refresh the voice list to include the new one
            
            // Reset form after a delay
            setTimeout(() => {
                setVoiceToClone(null);
                setClonedVoiceName('');
                setCloningSuccess(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }, 3000);

        } catch (error) {
            setCloningError('Failed to clone voice. Please try again.');
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
                    <p className="text-gray-400 text-sm">Upload a voice sample to create a custom voice</p>
                </div>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-300">Voice Name</label>
                        <input
                            type="text"
                            className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g., John's Voice"
                            value={clonedVoiceName}
                            onChange={(e) => setClonedVoiceName(e.target.value)}
                            disabled={isCloning}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-300">Voice Sample</label>
                        {!voiceToClone ? (
                            <div onClick={() => fileInputRef.current?.click()} className="relative w-full p-8 border-2 border-dashed border-gray-700 rounded-xl text-center hover:border-blue-500 cursor-pointer">
                                <div className="flex flex-col items-center justify-center space-y-3">
                                    <IconUpload className="w-8 h-8 text-gray-400" />
                                    <div>
                                        <p className="text-sm font-medium text-gray-300">Click to upload voice sample</p>
                                        <p className="text-xs text-gray-500 mt-1">WAV or MP3 (10-30 seconds recommended)</p>
                                    </div>
                                </div>
                                <input ref={fileInputRef} type="file" className="hidden" accept="audio/*" onChange={handleFileSelect} disabled={isCloning} />
                            </div>
                        ) : (
                            <div className="flex items-center justify-between p-4 bg-gray-800/50 border border-gray-700 rounded-xl">
                                <div className="flex items-center space-x-3">
                                    <IconMic className="w-5 h-5 text-blue-400" />
                                    <div>
                                        <p className="text-sm font-medium text-gray-200">{voiceToClone.name}</p>
                                        <p className="text-xs text-gray-500">{(voiceToClone.size / 1024 / 1024).toFixed(2)} MB</p>
                                    </div>
                                </div>
                                <button onClick={handleRemoveFile} className="p-2 hover:bg-gray-700 rounded-lg" disabled={isCloning}>
                                    <IconX className="w-4 h-4 text-gray-400" />
                                </button>
                            </div>
                        )}
                    </div>
                    <Button variant="secondary" size="lg" fullWidth onClick={handleCloneVoice} disabled={!voiceToClone || !clonedVoiceName.trim() || isCloning} isLoading={isCloning}>
                        <IconUpload className="w-5 h-5" />
                        <span className="ml-2">{isCloning ? 'Cloning Voice...' : 'Clone and Upload'}</span>
                    </Button>
                    {cloningSuccess && (
                        <div className="p-4 bg-green-900/20 border border-green-800/50 rounded-xl">
                            <p className="text-sm text-green-400">✓ Voice cloned successfully! Refreshing voice list...</p>
                        </div>
                    )}
                    {cloningError && (
                        <div className="p-4 bg-red-900/20 border border-red-800/50 rounded-xl">
                            <p className="text-sm text-red-400">{cloningError}</p>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
};