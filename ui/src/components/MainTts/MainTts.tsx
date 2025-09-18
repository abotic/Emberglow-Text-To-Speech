import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAudioContext } from '../../context/AudioContext';
import { useVoices } from '../../hooks/useVoices';
import { audioService } from '../../services/audioService';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { ProgressBar } from '../ui/ProgressBar';
import { IconRefreshCw, IconDownload, IconX, IconSave } from '../../icons';

interface Project { id: string; audioName?: string; chunks: Chunk[]; progress_percent?: number; completed_chunks?: number; total_chunks?: number; status?: string; }
interface Chunk { index: number; text: string; status: 'pending' | 'processing' | 'completed' | 'failed'; audio_filename?: string; elapsed_time?: number; error?: string; }

export const MainTts: React.FC = () => {
    const { mainText, setMainText, mainSelectedVoice, setMainSelectedVoice, temperature, setTemperature, topP, setTopP, setShowTtsGuide } = useAudioContext();
    const [project, setProject] = useState<Project | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [audioName, setAudioName] = useState('');
    const [regeneratingChunks, setRegeneratingChunks] = useState<Set<number>>(new Set());
    const { voices, isLoadingVoices } = useVoices();
    const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const activeProjectId = localStorage.getItem('activeProjectId');
        const activeProjectName = localStorage.getItem('activeProjectName');
        if (activeProjectId) {
            console.log("Resuming project:", activeProjectId);
            setAudioName(activeProjectName || '');
            setIsProcessing(true);
            pollProjectStatus(activeProjectId);
        }
    }, []);

    const stopPolling = () => {
        if (pollingTimeoutRef.current) {
            clearTimeout(pollingTimeoutRef.current);
            pollingTimeoutRef.current = null;
        }
    };

    const cleanupSession = () => {
        stopPolling();
        localStorage.removeItem('activeProjectId');
        localStorage.removeItem('activeProjectName');
        setProject(null);
        setAudioName('');
        setRegeneratingChunks(new Set());
    };

    const startProject = async () => {
        if (!mainText.trim() || !mainSelectedVoice || !audioName.trim()) { 
            setError('Please provide text, a voice, and a project name.'); 
            return; 
        }
    
        const oldProjectId = localStorage.getItem('activeProjectId');
        if (oldProjectId) {
            try {
                console.log(`Cleaning up previous project: ${oldProjectId}`);
                await audioService.cleanupProject(oldProjectId);
            } catch (cleanupErr) {
                console.error("Failed to clean up previous project:", cleanupErr);
            }
        }
    
        cleanupSession();
        setIsProcessing(true); 
        setError(null); 
        setProject(null);
    
        try {
            const { project_id } = await audioService.startProject(mainText, mainSelectedVoice.id, temperature, topP);
            localStorage.setItem('activeProjectId', project_id);
            localStorage.setItem('activeProjectName', audioName);
            pollProjectStatus(project_id);
        } catch (err) {
            console.error('Project start error:', err);
            setError('Failed to start project. Please try again.');
            setIsProcessing(false);
        }
    };

    const pollProjectStatus = useCallback(async (projectId: string) => {
        try {
            const data = await audioService.getProjectStatus(projectId);
            const currentProjectName = localStorage.getItem('activeProjectName') || audioName;
            
            // Update project state
            setProject({ ...data, audioName: currentProjectName });
            
            // Update regenerating chunks state based on actual backend status
            setRegeneratingChunks(prevSet => {
                const newSet = new Set<number>();
                data.chunks.forEach((chunk: Chunk, index: number) => {
                    if (chunk.status === 'processing' && prevSet.has(index)) {
                        newSet.add(index);
                    }
                });
                return newSet;
            });
            
            const isDone = ['completed', 'failed', 'review', 'cancelled', 'stitched'].includes(data.status);
            const hasProcessingChunks = data.chunks.some((chunk: Chunk) => chunk.status === 'processing');
            
            if (!isDone || hasProcessingChunks) {
                pollingTimeoutRef.current = setTimeout(() => pollProjectStatus(projectId), 2000);
            } else {
                setIsProcessing(false);
                setIsCancelling(false);
                setRegeneratingChunks(new Set());
                
                if (data.status === 'cancelled') {
                    alert('Project has been cancelled.');
                    cleanupSession();
                }
            }
        } catch (err) {
            console.error('Polling error:', err);
            setError('Could not retrieve project status. It may have been completed or deleted.');
            setIsProcessing(false);
            setRegeneratingChunks(new Set());
            cleanupSession();
        }
    }, [audioName]);

    const handleCancel = async () => {
        if (!project) return;
        if (!confirm('Are you sure you want to cancel this project? The current chunk will finish, then the project will be deleted.')) return;
        setIsCancelling(true); setError(null); stopPolling();
        try {
            await audioService.cancelProject(project.id);
            pollProjectStatus(project.id);
        } catch (err) {
            setError('Failed to send cancellation request.');
            setIsCancelling(false);
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
            alert(`Project completed and saved as "${project.audioName}"!`);
        } catch (err) {
            setError('Failed to stitch audio.');
            console.error("Stitch/Save Error:", err);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownloadFinal = async () => {
        if (!project) return;
        try {
            const { final_audio_filename } = await audioService.stitchAudio(project.id);
            const audioUrl = audioService.getAudioUrl(final_audio_filename);
            const response = await fetch(audioUrl);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `${project.audioName || 'project'}_final.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
        } catch (err) {
            setError('Failed to download audio.');
        }
    };

    const handleRegenerate = async (chunkIndex: number) => {
        if (!project) return;
        
        try {
            setRegeneratingChunks(prev => new Set(prev.add(chunkIndex)));
            setError(null);
            
            await audioService.regenerateChunk(project.id, chunkIndex);
            
            stopPolling();
            
            pollingTimeoutRef.current = setTimeout(() => pollProjectStatus(project.id), 1000);
            
        } catch (err) {
            console.error(`Failed to regenerate chunk ${chunkIndex + 1}:`, err);
            setError(`Failed to regenerate chunk ${chunkIndex + 1}.`);
            
            setRegeneratingChunks(prev => {
                const newSet = new Set(prev);
                newSet.delete(chunkIndex);
                return newSet;
            });
        }
    };

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
                        <Button variant="secondary" size="sm" onClick={() => setShowTtsGuide(true)}>View Guide</Button>
                    </div>
                </div>
                {!project ? (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Project Name *</label>
                                    <input type="text" className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500" placeholder="Enter a name for your project..." value={audioName} onChange={(e) => setAudioName(e.target.value)} disabled={isProcessing} maxLength={100} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Voice</label>
                                    <select className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 focus:ring-2 focus:ring-blue-500" value={mainSelectedVoice?.id || ''} onChange={(e) => { const voice = voices.find(v => v.id === e.target.value); setMainSelectedVoice(voice || null); }} disabled={isLoadingVoices || isProcessing}>
                                        <option value="">{isLoadingVoices ? 'Loading voices...' : 'Choose a voice...'}</option>
                                        {voices.map(v => (<option key={v.id} value={v.id}>{v.name}{v.tags?.includes('cloned') ? ' (Cloned)' : ''}</option>))}
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Temperature: <span className="text-blue-400">{temperature.toFixed(2)}</span></label>
                                    <input type="range" min={0.1} max={1.0} step={0.05} value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} disabled={isProcessing} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                    <p className="text-xs text-gray-500 mt-1">Lower is more consistent, higher is more expressive</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Top-P: <span className="text-blue-400">{topP.toFixed(2)}</span></label>
                                    <input type="range" min={0.1} max={1.0} step={0.05} value={topP} onChange={(e) => setTopP(parseFloat(e.target.value))} disabled={isProcessing} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                    <p className="text-xs text-gray-500 mt-1">Nucleus sampling threshold</p>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Your Script</label>
                            <textarea className="w-full p-4 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500" rows={12} placeholder="Paste your script here..." value={mainText} onChange={(e) => setMainText(e.target.value)} disabled={isProcessing} />
                        </div>
                        <Button variant="primary" size="lg" fullWidth onClick={startProject} isLoading={isProcessing} disabled={!mainText.trim() || !mainSelectedVoice || !audioName.trim()}>{isProcessing ? 'Starting Project...' : 'Generate Audio'}</Button>
                        {error && <p className="text-red-400 text-center text-sm">{error}</p>}
                    </div>
                ) : (
                    <ProjectView 
                        project={project} 
                        onRegenerate={handleRegenerate} 
                        onStitch={handleStitch} 
                        onDownload={handleDownloadFinal} 
                        onCancel={handleCancel} 
                        onNewProject={cleanupSession} 
                        isProcessing={isProcessing} 
                        isCancelling={isCancelling}
                        regeneratingChunks={regeneratingChunks}
                    />
                )}
                {error && <p className="text-red-400 text-center text-sm">{error}</p>}
            </div>
        </Card>
    );
};

const ProjectView: React.FC<{ 
    project: Project; 
    onRegenerate: (index: number) => void; 
    onStitch: () => void; 
    onDownload: () => void; 
    onCancel: () => void; 
    onNewProject: () => void; 
    isProcessing: boolean; 
    isCancelling: boolean;
    regeneratingChunks: Set<number>;
}> = ({ project, onRegenerate, onStitch, onDownload, onCancel, onNewProject, isProcessing, isCancelling, regeneratingChunks }) => {
    const allChunksDone = project.chunks.every(c => c.status === 'completed');
    const hasProgress = project.progress_percent !== undefined;
    const isProjectActive = ['processing', 'pending', 'cancelling'].includes(project.status || '');

    return (
        <div className="space-y-6">
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                    <div>
                        <h3 className="font-semibold text-white">Project: <span className="text-blue-400">{project.audioName}</span></h3>
                        <p className="text-xs text-gray-500 font-mono">{project.id}</p>
                    </div>
                    {isProjectActive && (<Button variant="danger" size="sm" onClick={onCancel} isLoading={isCancelling} disabled={isCancelling}><IconX className="w-4 h-4 mr-2" />Cancel Project</Button>)}
                </div>
                {hasProgress && (
                    <div className="space-y-2">
                        <ProgressBar progress={project.progress_percent || 0} variant={project.status === 'failed' ? 'error' : 'default'} />
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-gray-500">Progress: {project.progress_percent || 0}%</p>
                            <p className="text-xs text-gray-400 capitalize">Status: {project.status}</p>
                        </div>
                    </div>
                )}
            </div>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {project.chunks.map((chunk, index) => (
                    <ChunkItem 
                        key={index} 
                        chunk={chunk} 
                        onRegenerate={() => onRegenerate(index)}
                        isCancelling={isCancelling}
                        isRegenerating={regeneratingChunks.has(index)}
                    />
                ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button variant="ghost" size="lg" fullWidth onClick={onNewProject} disabled={isProcessing || isCancelling}>
                    <IconRefreshCw className="w-5 h-5 mr-2" />
                    New Project
                </Button>
                <Button variant="secondary" size="lg" fullWidth onClick={onDownload} disabled={!allChunksDone || isProcessing || isCancelling}>
                    <IconDownload className="w-5 h-5 mr-2" />
                    Download
                </Button>
                <Button variant="primary" size="lg" fullWidth onClick={onStitch} disabled={!allChunksDone || isProcessing || isCancelling}>
                    <IconSave className="w-5 h-5 mr-2" />
                    Save
                </Button>
            </div>
        </div>
    );
};

const ChunkItem: React.FC<{ 
    chunk: Chunk; 
    onRegenerate: () => void; 
    isCancelling: boolean;
    isRegenerating: boolean;
}> = ({ chunk, onRegenerate, isCancelling, isRegenerating }) => {
    
    const isCancellable = chunk.status === 'processing' || chunk.status === 'pending';
    const showRegeneratingState = isRegenerating && chunk.status === 'processing';

    return (
        <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/50">
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-500 mb-2">CHUNK {chunk.index + 1}</p>
                    <p className="text-sm text-gray-300 leading-relaxed">{chunk.text}</p>
                    {chunk.elapsed_time && (<p className="text-xs text-gray-500 mt-2">Generated in {chunk.elapsed_time.toFixed(1)}s</p>)}
                </div>
                <div className="lg:w-80 flex-shrink-0">
                    {isCancelling && isCancellable ? (
                        <div className="flex items-center justify-center gap-2 text-yellow-400 py-4">
                            <Spinner size="sm" />
                            <span className="text-sm">Cancelling...</span>
                        </div>
                    ) : (
                        <>
                            {chunk.status === 'completed' && chunk.audio_filename && (
                                <div className="space-y-3">
                                    <audio src={audioService.getAudioUrl(chunk.audio_filename)} controls className="w-full h-12 rounded-lg" style={{ minHeight: '48px' }} />
                                    
                                    {chunk.index === 0 ? (
                                        <div className="text-center text-sm text-gray-500 pt-2">(Initial chunk can't be regenerated)</div>
                                    ) : (
                                        <Button variant="secondary" size="sm" fullWidth onClick={onRegenerate} disabled={isRegenerating}>
                                            <IconRefreshCw className={`w-4 h-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
                                            {isRegenerating ? 'Regenerating...' : 'Regenerate'}
                                        </Button>
                                    )}

                                </div>
                            )}
                            {chunk.status === 'processing' && (
                                <div className="flex items-center justify-center gap-2 text-blue-400 py-4">
                                    <Spinner size="sm" />
                                    <span className="text-sm">{showRegeneratingState ? 'Regenerating...' : 'Processing...'}</span>
                                </div>
                            )}
                            {chunk.status === 'failed' && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-center gap-2 text-red-400 py-2"><IconX className="w-4 h-4" /><span className="text-sm">Generation failed</span></div>
                                    
                                    {chunk.index === 0 ? (
                                        <div className="text-center text-sm text-gray-500 pt-1">(Initial chunk can't be retried)</div>
                                    ) : (
                                        <Button variant="danger" size="sm" fullWidth onClick={onRegenerate} disabled={isRegenerating}>
                                            <IconRefreshCw className={`w-4 h-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
                                            {isRegenerating ? 'Retrying...' : 'Retry'}
                                        </Button>
                                    )}
                                </div>
                            )}
                            {chunk.status === 'pending' && (<div className="flex items-center justify-center gap-2 text-gray-500 py-4"><Spinner size="sm" /><span className="text-sm">Waiting...</span></div>)}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};