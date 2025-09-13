import React from 'react';
import { useAudioContext } from '../../context/AudioContext';
import { useVoices } from '../../hooks/useVoices';
import { audioService } from '../../services/audioService';
import { IconSparkles } from '../../icons';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export const TextGenerationSection: React.FC = () => {
  const {
    text,
    setText,
    selectedVoice,
    setSelectedVoice,
    setAudioUrl,
    isGenerating,
    setIsGenerating,
    generationError,
    setGenerationError,
  } = useAudioContext();
  
  const { voices, isLoadingVoices } = useVoices();

  const handleGenerateAudio = async () => {
    if (!text.trim() || !selectedVoice) {
      setGenerationError('Please enter text and select a voice');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setAudioUrl(null);

    try {
      const audioBlob = await audioService.generateSpeech(text, selectedVoice.id);
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
    } catch (error) {
      setGenerationError('Failed to generate audio. Please try again.');
      console.error('Audio generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVoiceSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const voice = voices.find(v => v.id === e.target.value);
    setSelectedVoice(voice || null);
  };

  return (
    <Card gradient className="p-8">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-white mb-2">Text to Speech Generation</h2>
          <p className="text-gray-400 text-sm">Enter your text and select a voice to generate professional audio</p>
        </div>

        <div className="space-y-4">
          {/* Text Input */}
          <div className="space-y-2">
            <label htmlFor="text-input" className="block text-sm font-medium text-gray-300">
              Enter Your Text
            </label>
            <div className="relative">
              <textarea
                id="text-input"
                className="w-full p-4 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all duration-200 resize-none backdrop-blur-sm"
                rows={10}
                placeholder="Enter or paste your text here. Supports long-form content for audiobooks, articles, and more..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={isGenerating}
              />
              <div className="absolute bottom-2 right-2 text-xs text-gray-500">
                {text.length} characters
              </div>
            </div>
          </div>

          {/* Voice Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Select Voice</label>
            <div className="flex gap-2">
              <select
                className="flex-1 p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                value={selectedVoice?.id || ''}
                onChange={handleVoiceSelect}
                disabled={isLoadingVoices || isGenerating}
              >
                <option value="">Choose a voice...</option>
                <optgroup label="Standard Voices">
                  {voices.filter(v => !v.tags?.includes('cloned')).map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name} - {voice.description}
                    </option>
                  ))}
                </optgroup>
                {voices.some(v => v.tags?.includes('cloned')) && (
                  <optgroup label="Cloned Voices">
                    {voices.filter(v => v.tags?.includes('cloned')).map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name} (Cloned)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* Generate Button */}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleGenerateAudio}
            disabled={!text.trim() || !selectedVoice || isGenerating}
            isLoading={isGenerating}
          >
            <IconSparkles className="w-5 h-5" />
            <span className="ml-2">{isGenerating ? 'Generating Audio...' : 'Generate Audio'}</span>
          </Button>

          {/* Status Messages */}
          {isGenerating && (
            <div className="p-4 bg-blue-900/20 border border-blue-800/50 rounded-xl">
              <p className="text-sm text-blue-300">
                Generating audio... This may take several minutes to hours for long texts.
              </p>
            </div>
          )}

          {generationError && (
            <div className="p-4 bg-red-900/20 border border-red-800/50 rounded-xl">
              <p className="text-sm text-red-400">{generationError}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};