import React, { useState, useCallback } from 'react';
import { useAudioContext } from '../../context/AudioContext';
import { useVoices } from '../../hooks/useVoices';
import { audioService } from '../../services/audioService';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { ProgressBar } from '../ui/ProgressBar';
import { IconRefreshCw, IconDownload, IconX, IconInfo, IconSave } from '../../icons';

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

interface InitialSetupProps {
  onStart: () => void;
  isProcessing: boolean;
  error: string | null;
  audioName: string;
  setAudioName: (name: string) => void;
}

interface ProjectViewProps {
  project: Project;
  onRegenerate: (index: number) => void;
  onStitch: () => void;
  onDownload: () => void;
  isProcessing: boolean;
}

interface ChunkItemProps {
  chunk: Chunk;
  onRegenerate: () => void;
}

export const SafeTtsSection: React.FC = () => {
    const { 
        safeText, setSafeText, 
        safeSelectedVoice, 
        temperature, topP,
        setShowTtsGuide,
    } = useAudioContext();
    const [project, setProject] = useState<Project | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [audioName, setAudioName] = useState('');

    const startProject = async () => {
        if (!safeText.trim() || !safeSelectedVoice) {
            setError('Please provide a long script and select a voice to start.');
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
            const { project_id } = await audioService.startProject(safeText, safeSelectedVoice.id, temperature, topP);
            const projectData = await audioService.getProjectStatus(project_id);
            projectData.audioName = audioName.trim();
            setProject(projectData);
            pollProjectStatus(project_id);
        } catch (err) {
            console.error('Project start error:', err);
            setError('Starting project... This may take a moment for long texts.');
            
            setTimeout(() => {
                setError(null);
            }, 5000);
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
            setError(`Failed to start regeneration for chunk ${chunkIndex}.`);
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
                try {
                    await audioService.saveGeneratedAudio(final_audio_filename, project.audioName, 'project');
                } catch (saveError) {
                    console.error('Failed to save final audio:', saveError);
                }
            }
            
            setSafeText('');
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

    return (
        <Card gradient className="p-8">
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-semibold text-white mb-2">Safe Long-Form Generation (Projects)</h2>
                        <p className="text-gray-400 text-sm">Generate long audio with chunk-by-chunk review and regeneration to ensure perfect quality.</p>
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
                            <h4 className="font-semibold text-blue-300 mb-1">📝 Essential for Long-Form: Format Your Script</h4>
                            <p className="text-sm text-blue-200">Long-form generation is especially sensitive to formatting. Use our guide to prevent issues.</p>
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
                    <InitialSetup 
                        onStart={startProject} 
                        isProcessing={isProcessing} 
                        error={error}
                        audioName={audioName}
                        setAudioName={setAudioName}
                    />
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

const InitialSetup: React.FC<InitialSetupProps> = ({ onStart, isProcessing, error, audioName, setAudioName }) => {
    const { safeText, setSafeText, safeSelectedVoice, setSafeSelectedVoice } = useAudioContext();
    const { voices, isLoadingVoices } = useVoices();

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">Project Name *</label>
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
            
            <textarea
                className="w-full p-4 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500"
                rows={12}
                placeholder="Paste your entire long-form script here..."
                value={safeText}
                onChange={(e) => setSafeText(e.target.value)}
                disabled={isProcessing}
            />
            
            <select
                className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 focus:ring-2 focus:ring-blue-500"
                value={safeSelectedVoice?.id || ''}
                onChange={(e) => {
                    const voice = voices.find(v => v.id === e.target.value);
                    setSafeSelectedVoice(voice || null);
                }}
                disabled={isLoadingVoices || isProcessing}
            >
                 <option value="">{isLoadingVoices ? 'Loading voices...' : 'Choose a voice...'}</option>
                 {voices.map(v => <option key={v.id} value={v.id}>{v.name}{v.tags?.includes('cloned') ? ' (Cloned)' : ''}</option>)}
            </select>
            
            <Button 
                variant="primary" 
                size="lg" 
                fullWidth 
                onClick={onStart} 
                isLoading={isProcessing}
                disabled={!safeText.trim() || !safeSelectedVoice || !audioName.trim()}
            >
                {isProcessing ? 'Starting Project...' : 'Start Generation Project'}
            </Button>
            
            {error && <p className="text-red-400 text-center text-sm">{error}</p>}
        </div>
    );
};

const ProjectView: React.FC<ProjectViewProps> = ({ project, onRegenerate, onStitch, onDownload, isProcessing }) => {
    const allChunksDone = project.chunks.every(c => c.status === 'completed');
    const hasProgress = project.progress_percent !== undefined;

    return (
        <div className="space-y-6">
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="font-semibold text-white">Project: <span className="text-blue-400">{project.audioName}</span></h3>
                        <p className="text-xs text-gray-500 font-mono">{project.id}</p>
                    </div>
                    {hasProgress && (
                        <span className="text-sm text-blue-400">{project.completed_chunks}/{project.total_chunks} chunks</span>
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
            
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {project.chunks.map((chunk, index) => (
                    <ChunkItem key={index} chunk={chunk} onRegenerate={() => onRegenerate(index)} />
                ))}
            </div>
            
            <div className="flex gap-3">
                <Button 
                    variant="secondary" 
                    size="lg" 
                    fullWidth 
                    onClick={onDownload} 
                    disabled={!allChunksDone || isProcessing} 
                    isLoading={isProcessing && allChunksDone}
                >
                    <IconDownload className="w-5 h-5 mr-2" />
                    Download Final Audio
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
                    Finish & Save Project
                </Button>
            </div>
        </div>
    );
};

const ChunkItem: React.FC<ChunkItemProps> = ({ chunk, onRegenerate }) => {
    return (
        <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/50">
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500">CHUNK {chunk.index + 1}</p>
                    <p className="mt-2 text-sm text-gray-300 leading-relaxed">{chunk.text}</p>
                    {chunk.elapsed_time && (
                        <p className="text-xs text-gray-500 mt-2">Generated in {chunk.elapsed_time.toFixed(1)}s</p>
                    )}
                </div>
                <div className="w-48 flex-shrink-0 flex flex-col items-center gap-3">
                    {chunk.status === 'completed' && chunk.audio_filename && (
                        <>
                            <audio src={audioService.getAudioUrl(chunk.audio_filename)} controls className="w-full h-10" />
                            <button
                                onClick={onRegenerate}
                                className="w-full px-2 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md transition-colors flex items-center justify-center gap-1"
                            >
                                <IconRefreshCw className="w-3 h-3" />
                                Regenerate
                            </button>
                        </>
                    )}
                    {chunk.status === 'processing' && (
                        <div className="flex items-center gap-2 text-sky-400">
                            <Spinner size="sm" />
                            <span className="text-xs">Processing...</span>
                        </div>
                    )}
                    {chunk.status === 'failed' && (
                         <div className="flex flex-col items-center gap-2 text-red-400">
                            <IconX className="w-4 h-4" />
                            <span className="text-xs text-center">Failed</span>
                             <button
                                onClick={onRegenerate}
                                className="w-full px-2 py-1.5 text-xs bg-red-700 hover:bg-red-600 text-red-100 rounded-md transition-colors flex items-center justify-center gap-1"
                            >
                                <IconRefreshCw className="w-3 h-3" />
                                Retry
                            </button>
                        </div>
                    )}
                     {chunk.status === 'pending' && (
                        <div className="flex items-center gap-2 text-gray-500">
                            <Spinner size="sm" />
                            <span className="text-xs">Pending...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};