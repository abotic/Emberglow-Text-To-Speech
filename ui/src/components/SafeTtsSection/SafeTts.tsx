import React, { useState, useCallback } from 'react';
import { useAudioContext } from '../../context/AudioContext';
import { useVoices } from '../../hooks/useVoices';
import { audioService } from '../../services/audioService';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { IconPlay, IconRefreshCw, IconDownload, IconX } from '../../icons';

export const SafeTtsSection: React.FC = () => {
    const { text, setText, selectedVoice, setSelectedVoice, temperature, topP } = useAudioContext();
    const { voices, isLoadingVoices } = useVoices();
    const [project, setProject] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startProject = async () => {
        if (!text.trim() || !selectedVoice) {
            setError('Please provide a long script and select a voice to start.');
            return;
        }
        setIsProcessing(true);
        setError(null);
        setProject(null);
        try {
            const { project_id } = await audioService.startProject(text, selectedVoice.id, temperature, topP);
            pollProjectStatus(project_id);
        } catch (err) {
            setError('Failed to start project. Check backend connection.');
            setIsProcessing(false);
        }
    };

    const pollProjectStatus = useCallback(async (projectId) => {
        try {
            const data = await audioService.getProjectStatus(projectId);
            setProject(data);
            const isProjectDone = data.chunks.every(c => c.status === 'completed' || c.status === 'failed');
            if (!isProjectDone) {
                setTimeout(() => pollProjectStatus(projectId), 3000);
            } else {
                setIsProcessing(false);
            }
        } catch (err) {
            setError('Failed to get project status.');
            setIsProcessing(false);
        }
    }, []);

    const handleRegenerate = async (chunkIndex) => {
        if (!project) return;
        try {
            // Optimistically update status in the UI
            const updatedProject = { ...project };
            updatedProject.chunks[chunkIndex].status = 'processing';
            updatedProject.chunks[chunkIndex].audio_filename = undefined;
            setProject(updatedProject);

            await audioService.regenerateChunk(project.id, chunkIndex);
            // Start polling again to get the final status
            setTimeout(() => pollProjectStatus(project.id), 1000);
        } catch (err) {
            setError(`Failed to start regeneration for chunk ${chunkIndex}.`);
             // Revert optimistic update on failure
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
            const audioUrl = audioService.getAudioUrl(final_audio_filename);
            
            const a = document.createElement('a');
            a.href = audioUrl;
            a.download = final_audio_filename;
            document.body.appendChild(a);
a.click();
            document.body.removeChild(a);

        } catch (err) {
            setError('Failed to stitch audio. Ensure all chunks are complete.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Card gradient className="p-8">
            <div className="space-y-6">
                <div>
                    <h2 className="text-2xl font-semibold text-white mb-2">Safe Long-Form Generation (Projects)</h2>
                    <p className="text-gray-400 text-sm">Generate long audio with chunk-by-chunk review and regeneration to ensure perfect quality.</p>
                </div>

                {!project ? (
                    <InitialSetup 
                        onStart={startProject} 
                        isProcessing={isProcessing} 
                        error={error}
                    />
                ) : (
                    <ProjectView 
                        project={project}
                        onRegenerate={handleRegenerate}
                        onStitch={handleStitch}
                        isProcessing={isProcessing}
                    />
                )}
            </div>
        </Card>
    );
};

// --- Sub-Components ---

const InitialSetup = ({ onStart, isProcessing, error }) => {
    const { text, setText, selectedVoice, setSelectedVoice } = useAudioContext();
    const { voices, isLoadingVoices } = useVoices();

    return (
        <div className="space-y-4">
            <textarea
                className="w-full p-4 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500"
                rows={12}
                placeholder="Paste your entire long-form script here..."
                value={text}
                onChange={(e) => setText(e.target.value)}
            />
            <select
                className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-100 focus:ring-2 focus:ring-blue-500"
                value={selectedVoice?.id || ''}
                onChange={(e) => {
                    const voice = voices.find(v => v.id === e.target.value);
                    setSelectedVoice(voice || null);
                }}
                disabled={isLoadingVoices}
            >
                 <option value="">{isLoadingVoices ? 'Loading voices...' : 'Choose a voice...'}</option>
                 {voices.map(v => <option key={v.id} value={v.id}>{v.name}{v.tags?.includes('cloned') ? ' (Cloned)' : ''}</option>)}
            </select>
            <Button variant="primary" size="lg" fullWidth onClick={onStart} isLoading={isProcessing}>
                Start Generation Project
            </Button>
            {error && <p className="text-red-400 text-center">{error}</p>}
        </div>
    );
};

const ProjectView = ({ project, onRegenerate, onStitch, isProcessing }) => {
    const allChunksDone = project.chunks.every(c => c.status === 'completed');

    return (
        <div className="space-y-6">
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <h3 className="font-semibold text-white">Project ID: <span className="font-mono text-sm text-gray-400">{project.id}</span></h3>
            </div>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {project.chunks.map((chunk, index) => (
                    <ChunkItem key={index} chunk={chunk} onRegenerate={() => onRegenerate(index)} />
                ))}
            </div>
            <Button variant="primary" size="lg" fullWidth onClick={onStitch} disabled={!allChunksDone || isProcessing} isLoading={isProcessing && allChunksDone}>
                <IconDownload className="w-5 h-5 mr-2" />
                Stitch & Download Final Audio
            </Button>
        </div>
    );
};

const ChunkItem = ({ chunk, onRegenerate }) => {
    return (
        <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/50">
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500">CHUNK {chunk.index + 1}</p>
                    <p className="mt-2 text-sm text-gray-300 leading-relaxed">{chunk.text}</p>
                </div>
                <div className="w-48 flex-shrink-0 flex flex-col items-center gap-2">
                    {chunk.status === 'completed' && chunk.audio_filename && (
                        <>
                            <audio src={audioService.getAudioUrl(chunk.audio_filename)} controls className="w-full h-10" />
                            <Button size="sm" variant="secondary" onClick={onRegenerate} fullWidth>
                                <IconRefreshCw className="w-4 h-4 mr-2" />
                                Regenerate
                            </Button>
                        </>
                    )}
                    {chunk.status === 'processing' && (
                        <div className="flex items-center gap-2 text-sky-400">
                            <Spinner size="sm" />
                            <span>Processing...</span>
                        </div>
                    )}
                    {chunk.status === 'failed' && (
                         <div className="flex flex-col items-center gap-2 text-red-400">
                            <IconX className="w-4 h-4" />
                            <span className="text-xs text-center">Failed</span>
                             <Button size="sm" variant="danger" onClick={onRegenerate} fullWidth>
                                <IconRefreshCw className="w-4 h-4 mr-2" />
                                Retry
                            </Button>
                        </div>
                    )}
                     {chunk.status === 'pending' && (
                        <div className="flex items-center gap-2 text-gray-500">
                            <Spinner size="sm" />
                            <span>Pending...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};