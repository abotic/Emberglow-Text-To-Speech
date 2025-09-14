import React from 'react';
import { useAudioContext } from '../../context/AudioContext';
import { useVoices } from '../../hooks/useVoices';
import { audioService } from '../../services/audioService';
import { IconSparkles } from '../../icons';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

// TODO refactor
const ParameterSlider = ({ label, value, onChange, min, max, step, disabled, helpText }) => (
    <div className="space-y-2">
        <div className="flex justify-between items-center">
            <label className="block text-sm font-medium text-gray-300">{label}</label>
            <span className="text-sm font-mono bg-gray-700/50 text-sky-300 px-2 py-0.5 rounded">{value.toFixed(2)}</span>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
        />
        <p className="text-xs text-gray-500">{helpText}</p>
    </div>
);

export const TextGenerationSection: React.FC = () => {
  const {
    text, setText,
    selectedVoice, setSelectedVoice,
    temperature, setTemperature,
    topP, setTopP,
    setAudioUrl,
    isGenerating, setIsGenerating,
    generationError, setGenerationError,
  } = useAudioContext();
  
  const { voices, isLoadingVoices } = useVoices();

  const handleGenerateAudio = async () => {
    if (!text.trim() || !selectedVoice) {
      setGenerationError('Please enter text and select a voice.');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setAudioUrl(null);

    try {
      // Start the one-shot generation task
      const taskId = await audioService.startOneshotGeneration(text, selectedVoice.id, temperature, topP);
      
      // Poll for the result
      const pollStatus = async () => {
        const { status, result_path, error } = await audioService.checkOneshotGenerationStatus(taskId);
        if (status === 'completed' && result_path) {
          setAudioUrl(audioService.getAudioUrl(result_path));
          setIsGenerating(false);
        } else if (status === 'failed') {
          setGenerationError(error || 'An unknown error occurred during generation.');
          setIsGenerating(false);
        } else {
          setTimeout(pollStatus, 2000); // Poll every 2 seconds
        }
      };
      pollStatus();

    } catch (error) {
      setGenerationError('Failed to start audio generation. Please check the backend connection.');
      console.error('Audio generation error:', error);
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
          <h2 className="text-2xl font-semibold text-white mb-2">Standard Text to Speech</h2>
          <p className="text-gray-400 text-sm">Enter text, select a voice, and configure generation parameters.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
                <div className="space-y-2">
                    <label htmlFor="text-input" className="block text-sm font-medium text-gray-300">Enter Your Text</label>
                    <textarea
                        id="text-input"
                        className="w-full p-4 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all duration-200 resize-none backdrop-blur-sm"
                        rows={10}
                        placeholder="Enter or paste your text here..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        disabled={isGenerating}
                    />
                </div>
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">Select Voice</label>
                    <select
                        className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                        value={selectedVoice?.id || ''}
                        onChange={handleVoiceSelect}
                        disabled={isLoadingVoices || isGenerating}
                    >
                        <option value="">{isLoadingVoices ? 'Loading voices...' : 'Choose a voice...'}</option>
                        {voices.filter(v => !v.tags?.includes('cloned')).map((voice) => (
                            <option key={voice.id} value={voice.id}>{voice.name}</option>
                        ))}
                        {voices.some(v => v.tags?.includes('cloned')) && (
                            <optgroup label="Cloned Voices">
                                {voices.filter(v => v.tags?.includes('cloned')).map((voice) => (
                                    <option key={voice.id} value={voice.id}>{voice.name} (Cloned)</option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                </div>
            </div>

            <div className="space-y-6">
                <ParameterSlider 
                    label="Temperature"
                    value={temperature}
                    onChange={setTemperature}
                    min={0.1} max={1.0} step={0.05}
                    disabled={isGenerating}
                    helpText="Controls randomness. Lower is more consistent, higher is more expressive."
                />
                 <ParameterSlider 
                    label="Top-P"
                    value={topP}
                    onChange={setTopP}
                    min={0.1} max={1.0} step={0.05}
                    disabled={isGenerating}
                    helpText="Nucleus sampling. Narrows the pool of tokens the model considers."
                />
            </div>
        </div>

        <div className="pt-2">
            <Button
              variant="primary" size="lg" fullWidth
              onClick={handleGenerateAudio}
              disabled={!text.trim() || !selectedVoice || isGenerating}
              isLoading={isGenerating}
            >
              <IconSparkles className="w-5 h-5" />
              <span className="ml-2">{isGenerating ? 'Generating Audio...' : 'Generate Audio'}</span>
            </Button>
            {generationError && (
              <div className="mt-4 p-3 bg-red-900/20 border border-red-800/50 rounded-xl text-center">
                <p className="text-sm text-red-400">{generationError}</p>
              </div>
            )}
        </div>
      </div>
    </Card>
  );
};
