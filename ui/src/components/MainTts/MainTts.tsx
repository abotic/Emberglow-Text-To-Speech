import React, { useState, useCallback } from 'react';
import { useAudioContext } from '../../context/AudioContext';
import { useVoices } from '../../hooks/useVoices';
import { audioService } from '../../services/audioService';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { ProgressBar } from '../ui/ProgressBar';
import { IconRefreshCw, IconDownload, IconX, IconInfo, IconSave, IconPlay } from '../../icons';

interface Project {
  id: string;
  audioName?: string;
  chunks: Chunk[];
  progress_percent?: number;
  completed_chunks?: number;
  total_chunks?: number;
  status?: string;
}

interface Chunk {
  index: number;
  text: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  audio_filename?: string;
  elapsed_time?: number;
  error?: string;
}

interface ChunkItemProps {
  chunk: Chunk;
  onRegenerate: () => void;
  projectId: string;
}

export const MainTts: React.FC = () => {
    const { 
        mainText, setMainText, 
        mainSelectedVoice, setMainSelectedVoice,
        temperature, setTemperature, topP, setTopP,
        setShowTtsGuide,
    } = useAudioContext();
    const [project, setProject] = useState<Project | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [audioName, setAudioName] = useState('');
    const { voices, isLoadingVoices } = useVoices();

    const startProject = async () => {
        if (!mainText.trim() || !mainSelectedVoice) {
            setError('Please provide text and select a voice to start.');
            return;
        }
        if (!audioName.trim()) {
            setError('Please enter a name for your audio project.');
            return;
        }
        
        setIsProcessing(true);
        setError(null);
        setProject(null);
        
        try {
            const { project_id } = await audioService.startProject(mainText, mainSelectedVoice.id, temperature, topP);
            const projectData = await audioService.getProjectStatus(project_id);
            projectData.audioName = audioName.trim();
            setProject(projectData);
            pollProjectStatus(project_id);
        } catch (err) {
            console.error('Project start error:', err);
            setError('Starting project... This may take a moment for long texts.');
            setTimeout(() => setError(null), 5000);
        }
    };

    const pollProjectStatus = useCallback(async (projectId: string) => {
        try {
            const data = await audioService.getProjectStatus(projectId);
            setProject(prevProject => ({
                ...data,
                audioName: prevProject?.audioName || audioName
            }));
            
            const isProjectDone = data.chunks.every((c: Chunk) => c.status === 'completed' || c.status === 'failed');
            if (!isProjectDone) {
                setTimeout(() => pollProjectStatus(projectId), 3000);
            } else {
                setIsProcessing(false);
            }
        } catch (err) {
            console.error('Polling error:', err);
            setError('Failed to get project status.');
            setIsProcessing(false);
        }
    }, [audioName]);

    const handleRegenerate = async (chunkIndex: number) => {
        if (!project) return;
        
        try {
            const updatedProject = { ...project };
            updatedProject.chunks[chunkIndex].status = 'processing';
            updatedProject.chunks[chunkIndex].audio_filename = undefined;
            setProject(updatedProject);

            await audioService.regenerateChunk(project.id, chunkIndex);
            setTimeout(() => pollProjectStatus(project.id), 1000);
        } catch (err) {
            setError(`Failed to regenerate chunk ${chunkIndex + 1}.`);
            const revertedProject = { ...project };
            revertedProject.chunks[chunkIndex].status = 'failed';
            setProject(revertedProject);
        }
    };
    
    const handleStitch = async () => {
        if (!project) return;
        setIsProcessing(true);
        
        try {
            const { final_audio_filename } = await audioService.stitchAudio(project.id);
            
            if (project.audioName) {
                await audioService.saveGeneratedAudio(final_audio_filename, project.audioName, 'project');
            }
            
            setMainText('');
            setAudioName('');
            setProject(null);
            
            alert(`Project completed and saved as "${project.audioName}"!`);
            
        } catch (err) {
            setError('Failed to stitch audio. Ensure all chunks are complete.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownloadFinal = async () => {
        if (!project) return;
        
        try {
            const { final_audio_filename } = await audioService.stitchAudio(project.id);
            const audioUrl = audioService.getAudioUrl(final_audio_filename);
            
            const a = document.createElement('a');
            a.href = audioUrl;
            a.download = `${project.audioName || 'project'}_final.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (err) {
            setError('Failed to stitch and download audio.');
        }
    };

    const allChunksDone = project?.chunks.every(c => c.status === 'completed');

    return (
        <Card gradient className="p-6 md:p-8">
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-semibold text-white mb-2">Text to Speech Generation</h2>
                        <p className="text-gray-400 text-sm">Generate long-form audio with chunk-by-chunk review</p>
                    </div>
                </div>

                <div className="p-4 bg-blue-900/20 border border-blue-800/50 rounded-xl">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div>
                            <h4 className="font-semibold text-blue-300 mb-1">📝 Format Your Script</h4>
                            <p className="text-sm text-blue-200">Use our guide to prevent issues with pronunciation and formatting.</p>
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

                {!project ? (
                    <div className="space-y-6">
                        {/* Project Setup */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Project Name *</label>
                                    <input
                                        type="text"
                                        className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500"
                                        placeholder="Enter a name for your project..."
                                        value={audioName}
                                        onChange={(e) => setAudioName(e.target.value)}
                                        disabled={isProcessing}
                                        maxLength={100}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Voice</label>
                                    <select
                                        className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 focus:ring-2 focus:ring-blue-500"
                                        value={mainSelectedVoice?.id || ''}
                                        onChange={(e) => {
                                            const voice = voices.find(v => v.id === e.target.value);
                                            setMainSelectedVoice(voice || null);
                                        }}
                                        disabled={isLoadingVoices || isProcessing}
                                    >
                                        <option value="">{isLoadingVoices ? 'Loading voices...' : 'Choose a voice...'}</option>
                                        {voices.map(v => (
                                            <option key={v.id} value={v.id}>
                                                {v.name}{v.tags?.includes('cloned') ? ' (Cloned)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Temperature: <span className="text-blue-400">{temperature.toFixed(2)}</span>
                                    </label>
                                    <input
                                        type="range"
                                        min={0.1}
                                        max={1.0}
                                        step={0.05}
                                        value={temperature}
                                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                        disabled={isProcessing}
                                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Lower is more consistent, higher is more expressive</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Top-P: <span className="text-blue-400">{topP.toFixed(2)}</span>
                                    </label>
                                    <input
                                        type="range"
                                        min={0.1}
                                        max={1.0}
                                        step={0.05}
                                        value={topP}
                                        onChange={(e) => setTopP(parseFloat(e.target.value))}
                                        disabled={isProcessing}
                                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Nucleus sampling threshold</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Your Script</label>
                            <textarea
                                className="w-full p-4 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500"
                                rows={12}
                                placeholder="Paste your script here..."
                                value={mainText}
                                onChange={(e) => setMainText(e.target.value)}
                                disabled={isProcessing}
                            />
                        </div>
                        
                        <Button 
                            variant="primary" 
                            size="lg" 
                            fullWidth 
                            onClick={startProject} 
                            isLoading={isProcessing}
                            disabled={!mainText.trim() || !mainSelectedVoice || !audioName.trim()}
                        >
                            {isProcessing ? 'Starting Project...' : 'Generate Audio'}
                        </Button>
                        
                        {error && <p className="text-red-400 text-center text-sm">{error}</p>}
                    </div>
                ) : (
                    <ProjectView 
                        project={project}
                        onRegenerate={handleRegenerate}
                        onStitch={handleStitch}
                        onDownload={handleDownloadFinal}
                        isProcessing={isProcessing}
                    />
                )}
            </div>
        </Card>
    );
};

const ProjectView: React.FC<{
    project: Project;
    onRegenerate: (index: number) => void;
    onStitch: () => void;
    onDownload: () => void;
    isProcessing: boolean;
}> = ({ project, onRegenerate, onStitch, onDownload, isProcessing }) => {
    const allChunksDone = project.chunks.every(c => c.status === 'completed');
    const hasProgress = project.progress_percent !== undefined;

    return (
        <div className="space-y-6">
            {/* Project Status */}
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                    <div>
                        <h3 className="font-semibold text-white">
                            Project: <span className="text-blue-400">{project.audioName}</span>
                        </h3>
                        <p className="text-xs text-gray-500 font-mono">{project.id}</p>
                    </div>
                    {hasProgress && (
                        <span className="text-sm text-blue-400">
                            {project.completed_chunks}/{project.total_chunks} chunks
                        </span>
                    )}
                </div>
                {hasProgress && (
                    <div className="space-y-2">
                        <ProgressBar 
                            progress={project.progress_percent || 0} 
                            variant={project.status === 'failed' ? 'error' : 'default'} 
                        />
                        <p className="text-xs text-gray-500">
                            Progress: {project.progress_percent || 0}%
                        </p>
                    </div>
                )}
            </div>
            
            {/* Chunks */}
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {project.chunks.map((chunk, index) => (
                    <ChunkItem 
                        key={index} 
                        chunk={chunk} 
                        onRegenerate={() => onRegenerate(index)}
                        projectId={project.id}
                    />
                ))}
            </div>
            
            {/* Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button 
                    variant="secondary" 
                    size="lg" 
                    fullWidth 
                    onClick={onDownload} 
                    disabled={!allChunksDone || isProcessing} 
                    isLoading={isProcessing && allChunksDone}
                >
                    <IconDownload className="w-5 h-5 mr-2" />
                    Download Final
                </Button>
                <Button 
                    variant="primary" 
                    size="lg" 
                    fullWidth 
                    onClick={onStitch} 
                    disabled={!allChunksDone || isProcessing} 
                    isLoading={isProcessing && allChunksDone}
                >
                    <IconSave className="w-5 h-5 mr-2" />
                    Save Project
                </Button>
            </div>
        </div>
    );
};

const ChunkItem: React.FC<ChunkItemProps> = ({ chunk, onRegenerate, projectId }) => {
    return (
        <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/50">
            <div className="flex flex-col lg:flex-row gap-4">
                {/* Text Content */}
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-500 mb-2">CHUNK {chunk.index + 1}</p>
                    <p className="text-sm text-gray-300 leading-relaxed">{chunk.text}</p>
                    {chunk.elapsed_time && (
                        <p className="text-xs text-gray-500 mt-2">
                            Generated in {chunk.elapsed_time.toFixed(1)}s
                        </p>
                    )}
                </div>

                {/* Audio Controls */}
                <div className="lg:w-80 flex-shrink-0">
                    {chunk.status === 'completed' && chunk.audio_filename && (
                        <div className="space-y-3">
                            <audio 
                                src={audioService.getAudioUrl(chunk.audio_filename)} 
                                controls 
                                className="w-full h-12 rounded-lg"
                                style={{ minHeight: '48px' }}
                            />
                            <Button
                                variant="secondary"
                                size="sm"
                                fullWidth
                                onClick={onRegenerate}
                            >
                                <IconRefreshCw className="w-4 h-4 mr-2" />
                                Regenerate
                            </Button>
                        </div>
                    )}
                    
                    {chunk.status === 'processing' && (
                        <div className="flex items-center justify-center gap-2 text-blue-400 py-4">
                            <Spinner size="sm" />
                            <span className="text-sm">Processing...</span>
                        </div>
                    )}
                    
                    {chunk.status === 'failed' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-center gap-2 text-red-400 py-2">
                                <IconX className="w-4 h-4" />
                                <span className="text-sm">Generation failed</span>
                            </div>
                            <Button
                                variant="danger"
                                size="sm"
                                fullWidth
                                onClick={onRegenerate}
                            >
                                <IconRefreshCw className="w-4 h-4 mr-2" />
                                Retry
                            </Button>
                        </div>
                    )}
                    
                    {chunk.status === 'pending' && (
                        <div className="flex items-center justify-center gap-2 text-gray-500 py-4">
                            <Spinner size="sm" />
                            <span className="text-sm">Waiting...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};