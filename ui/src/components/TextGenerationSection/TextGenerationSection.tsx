import React, { useCallback, useState } from 'react';
import { useAudioContext } from '../../context/AudioContext';
import { useVoices } from '../../hooks/useVoices';
import { audioService } from '../../services/audioService';
import { IconSparkles, IconInfo, IconDownload } from '../../icons';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/ProgressBar';

interface ParameterSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  helpText: string;
}

const ParameterSlider: React.FC<ParameterSliderProps> = ({ 
  label, value, onChange, min, max, step, disabled, helpText 
}) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center">
      <label className="block text-sm font-medium text-gray-300">{label}</label>
      <span className="text-sm font-mono bg-gray-700/50 text-sky-300 px-2 py-0.5 rounded">
        {value.toFixed(2)}
      </span>
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
    standardText, setStandardText,
    standardSelectedVoice, setStandardSelectedVoice,
    temperature, setTemperature,
    topP, setTopP,
    setAudioUrl,
    isGenerating, setIsGenerating,
    generationError, setGenerationError,
    currentTask, setCurrentTask,
    setShowTtsGuide,
  } = useAudioContext();
  
  const { voices, isLoadingVoices } = useVoices();
  const [audioName, setAudioName] = useState<string>('');

  const pollTaskStatus = useCallback(async (taskId: string, audioName: string) => {
    try {
      const task = await audioService.checkOneshotGenerationStatus(taskId);
      setCurrentTask(task);

      if (task.status === 'completed' && task.result_path) {
        try {
          await audioService.saveGeneratedAudio(task.result_path, audioName, 'standard');
        } catch (saveError) {
          console.error('Failed to save audio:', saveError);
        }
        
        setAudioUrl(audioService.getAudioUrl(task.result_path));
        setIsGenerating(false);
        setCurrentTask(null);
        setAudioName('');
      } else if (task.status === 'failed') {
        setGenerationError(task.error || 'An unknown error occurred during generation.');
        setIsGenerating(false);
        setCurrentTask(null);
      } else if (task.status === 'processing') {
        setTimeout(() => pollTaskStatus(taskId, audioName), 2000);
      }
    } catch (error) {
      setGenerationError('Failed to check generation status.');
      setIsGenerating(false);
      setCurrentTask(null);
    }
  }, [setAudioUrl, setIsGenerating, setGenerationError, setCurrentTask]);

  const handleGenerateAudio = async () => {
    if (!standardText.trim() || !standardSelectedVoice) {
      setGenerationError('Please enter text and select a voice.');
      return;
    }

    if (!audioName.trim()) {
      setGenerationError('Please enter a name for your audio.');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setAudioUrl(null);
    setCurrentTask(null);

    try {
      const taskId = await audioService.startOneshotGeneration(
        standardText, 
        standardSelectedVoice.id, 
        temperature, 
        topP
      );
      
      pollTaskStatus(taskId, audioName.trim());
    } catch (error) {
      setGenerationError('Failed to start audio generation. Please check the backend connection.');
      console.error('Audio generation error:', error);
      setIsGenerating(false);
    }
  };

  const handleVoiceSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const voice = voices.find(v => v.id === e.target.value);
    setStandardSelectedVoice(voice || null);
  };

  const handleDownload = () => {
    if (!currentTask?.result_path) return;
    
    const audioUrl = audioService.getAudioUrl(currentTask.result_path);
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `${audioName || currentTask.result_path}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const getProgressText = (): string => {
    if (!currentTask) return '';
    
    if (currentTask.total_chunks && currentTask.total_chunks > 0) {
      return `Processing chunk ${currentTask.current_chunk}/${currentTask.total_chunks}`;
    }
    
    if (currentTask.status === 'processing') {
      return 'Processing...';
    }
    
    return '';
  };

  return (
    <Card gradient className="p-8">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white mb-2">Standard Text to Speech</h2>
            <p className="text-gray-400 text-sm">Enter text, select a voice, name your audio, and generate.</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTtsGuide(true)}
            className="flex items-center gap-2"
          >
            <IconInfo className="w-4 h-4" />
            TTS Guide
          </Button>
        </div>

        <div className="p-4 bg-blue-900/20 border border-blue-800/50 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-blue-300 mb-1">📝 Important: Format Your Script</h4>
              <p className="text-sm text-blue-200">Use our TTS Writing Guide to avoid loops, gibberish, and pronunciation issues.</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowTtsGuide(true)}
            >
              View Guide
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
                <div className="space-y-2">
                    <label htmlFor="audio-name-input" className="block text-sm font-medium text-gray-300">Audio Name *</label>
                    <input
                        id="audio-name-input"
                        type="text"
                        className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all duration-200"
                        placeholder="Enter a name for your audio..."
                        value={audioName}
                        onChange={(e) => setAudioName(e.target.value)}
                        disabled={isGenerating}
                        maxLength={100}
                    />
                </div>
                
                <div className="space-y-2">
                    <label htmlFor="standard-text-input" className="block text-sm font-medium text-gray-300">Enter Your Text</label>
                    <textarea
                        id="standard-text-input"
                        className="w-full p-4 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all duration-200 resize-none backdrop-blur-sm"
                        rows={8}
                        placeholder="Enter or paste your text here..."
                        value={standardText}
                        onChange={(e) => setStandardText(e.target.value)}
                        disabled={isGenerating}
                    />
                </div>
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">Select Voice</label>
                    <select
                        className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                        value={standardSelectedVoice?.id || ''}
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

        {isGenerating && currentTask && (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">{getProgressText()}</span>
              {currentTask.progress_percent !== undefined && (
                <span className="text-blue-400">{currentTask.progress_percent}%</span>
              )}
            </div>
            <ProgressBar 
              progress={currentTask.progress_percent || 0} 
              variant={currentTask.status === 'failed' ? 'error' : 'default'} 
            />
            {currentTask.elapsed_time && (
              <p className="text-xs text-gray-500">
                Elapsed: {Math.round(currentTask.elapsed_time)}s
              </p>
            )}
          </div>
        )}

        <div className="pt-2 space-y-4">
            <Button
              variant="primary" size="lg" fullWidth
              onClick={handleGenerateAudio}
              disabled={!standardText.trim() || !standardSelectedVoice || !audioName.trim() || isGenerating}
              isLoading={isGenerating}
            >
              <IconSparkles className="w-5 h-5" />
              <span className="ml-2">{isGenerating ? 'Generating & Saving Audio...' : 'Generate & Save Audio'}</span>
            </Button>
            
            {currentTask?.result_path && (
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  size="md"
                  fullWidth
                  onClick={handleDownload}
                >
                  <IconDownload className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            )}
            
            {generationError && (
              <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-xl text-center">
                <p className="text-sm text-red-400">{generationError}</p>
              </div>
            )}
        </div>
      </div>
    </Card>
  );
};