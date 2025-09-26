import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAudioContext } from '../../context/AudioContext';
import { useVoices } from '../../hooks/useVoices';
import { audioService } from '../../services/audioService';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import type { Project, Chunk } from '../../types';
import { ProjectStateManager } from '../../utils/projectStateManager';
import { useProjectPolling } from '../../hooks/useProjectPolling';
import { ProjectView } from './ProjectView';

export const MainTts: React.FC = () => {
    const {
        mainText,
        setMainText,
        mainSelectedVoice,
        setMainSelectedVoice,
        temperature,
        setTemperature,
        topP,
        setTopP,
        setShowTtsGuide,
    } = useAudioContext();

    const [project, setProject] = useState<Project | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [audioName, setAudioName] = useState('');
    const [regeneratingChunks, setRegeneratingChunks] = useState<Set<number>>(new Set());
    const [autoNormalize, setAutoNormalize] = useState(true);
    const [isCheckingActiveProjects, setIsCheckingActiveProjects] = useState(true);
    const [isNormalizationAvailable, setIsNormalizationAvailable] = useState(true);
    const { voices, isLoadingVoices } = useVoices();

    const wordCount = useMemo(() => {
        return mainText.trim().split(/\s+/).filter(Boolean).length;
    }, [mainText]);

    const quickRepollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchStatus = useCallback((id: string) => audioService.getProjectStatus(id), []);

    const { start: startPolling, stop: stopPolling } = useProjectPolling(fetchStatus, {
        onUpdate: (data) => {
            const currentProjectName = ProjectStateManager.loadProject()?.projectName || audioName;

            setProject({ ...data, audioName: currentProjectName });

            setRegeneratingChunks((prev) => {
                const next = new Set<number>();
                data.chunks.forEach((c: Chunk, idx: number) => {
                    if (c.status === 'processing' && prev.has(idx)) next.add(idx);
                });
                return next;
            });
        },
        onDone: (data) => {
            setIsProcessing(false);
            setIsCancelling(false);
            setRegeneratingChunks(new Set());
            if (data.status === 'cancelled') {
                cleanupSession();
            }
        },
        onError: (err) => {
            console.error('Polling error:', err);
            if (!isCancelling) setError('Could not retrieve project status. It may have been completed or deleted.');
            setIsProcessing(false);
            setRegeneratingChunks(new Set());
            cleanupSession();
        },
        interval: 5000,
    });

    useEffect(() => {
        const checkForActiveProject = async () => {
            try {
                const savedProject = ProjectStateManager.loadProject();
                if (savedProject) {
                    setAudioName(savedProject.projectName);
                    setIsProcessing(true);
                    startPolling(savedProject.projectId);
                    return;
                }

                const activeProjects = await audioService.getActiveProjects();

                if (Array.isArray(activeProjects) && activeProjects.length > 0) {
                    const activeProject = activeProjects[0];
                    const projectName = activeProject.name || 'Recovered Project';

                    const currentUrl = new URL(window.location.href);
                    currentUrl.searchParams.set('project', activeProject.id);
                    currentUrl.searchParams.set('name', encodeURIComponent(projectName));
                    window.location.replace(currentUrl.toString());
                    return;
                }
            } catch (e) {
                console.warn('Error checking for active project:', e);
            } finally {
                setIsCheckingActiveProjects(false);
            }
        };

        checkForActiveProject();

        return () => {
            stopPolling();
            if (quickRepollRef.current) clearTimeout(quickRepollRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await audioService.getConfig();
                setIsNormalizationAvailable(config.is_openai_enabled);
                if (!config.is_openai_enabled) {
                    setAutoNormalize(false);
                }
            } catch {
                setIsNormalizationAvailable(false);
                setAutoNormalize(false);
            }
        };
        fetchConfig();
    }, []);

    const cleanupSession = () => {
        stopPolling();
        ProjectStateManager.clearProject();
        setProject(null);
        setAudioName('');
        setRegeneratingChunks(new Set());
        setError(null);
    };

    const startProject = async () => {
        if (!mainText.trim() || !mainSelectedVoice || !audioName.trim()) {
            setError('Please provide text, a voice, and a project name.');
            return;
        }

        const oldProject = ProjectStateManager.loadProject();
        if (oldProject) {
            try {
                await audioService.cleanupProject(oldProject.projectId);
            } catch (cleanupErr) {
                console.error('Failed to clean up previous project:', cleanupErr);
            }
        }

        cleanupSession();
        setIsProcessing(true);
        setError(null);

        try {
            const response = await audioService.startProject(
                mainText,
                mainSelectedVoice.id,
                temperature,
                topP,
                autoNormalize
            );

            ProjectStateManager.saveProject(response.project_id, audioName);
            startPolling(response.project_id);
        } catch (err) {
            console.error('Project start error:', err);
            setError('Failed to start project. Please try again.');
            setIsProcessing(false);
        }
    };

    const handleCancel = async () => {
        if (!project) return;
        if (!window.confirm('Are you sure you want to cancel this project? The current chunk will finish, then the project will be deleted.'))
            return;

        setIsCancelling(true);
        setError(null);
        stopPolling();

        try {
            await audioService.cancelProject(project.id);
            startPolling(project.id);
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
            console.error('Stitch/Save Error:', err);
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

    const handleDownloadNormalizedText = async () => {
        if (!project?.was_normalized) return;
        try {
            await audioService.downloadNormalizedText(
                project.id,
                `${project.audioName || 'project'}_normalized.txt`
            );
        } catch (err) {
            console.error('Failed to download normalized text:', err);
            setError('Failed to download normalized text.');
        }
    };

    const handleRegenerate = async (chunkIndex: number) => {
        if (!project) return;

        try {
            setRegeneratingChunks((prev) => {
                const next = new Set(prev);
                next.add(chunkIndex);
                return next;
            });
            setError(null);

            await audioService.regenerateChunk(project.id, chunkIndex);

            stopPolling();
            if (quickRepollRef.current) clearTimeout(quickRepollRef.current);
            quickRepollRef.current = setTimeout(() => startPolling(project.id), 1000);
        } catch (err) {
            console.error(`Failed to regenerate chunk ${chunkIndex + 1}:`, err);
            setError(`Failed to regenerate chunk ${chunkIndex + 1}.`);

            setRegeneratingChunks((prev) => {
                const next = new Set(prev);
                next.delete(chunkIndex);
                return next;
            });
        }
    };

    if (isCheckingActiveProjects) {
        return (
            <Card gradient className="p-6 md:p-8">
                <div className="flex items-center justify-center space-y-4 py-12">
                    <Spinner size="lg" />
                    <p className="text-gray-400">Checking for active projects...</p>
                </div>
            </Card>
        );
    }

    return (
        <Card gradient className="p-6 md:p-8">
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-semibold text-white mb-2">Text to Speech Generation</h2>
                        <p className="text-gray-400 text-sm">Generate long-form audio with chunk-by-chunk review</p>
                    </div>
                </div>

                {!project ? (
                    <div className="space-y-6">
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
                                            const voice = voices.find((v) => v.id === e.target.value);
                                            setMainSelectedVoice(voice || null);
                                        }}
                                        disabled={isLoadingVoices || isProcessing}
                                    >
                                        <option value="">{isLoadingVoices ? 'Loading voices...' : 'Choose a voice...'}</option>
                                        {voices.map((v) => (
                                            <option key={v.id} value={v.id}>
                                                {v.name}
                                                {v.tags?.includes('cloned') ? ' (Cloned)' : ''}
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

                        <div className="space-y-4">
                            <ToggleSwitch
                                checked={autoNormalize}
                                onChange={setAutoNormalize}
                                disabled={isProcessing || !isNormalizationAvailable}
                                label={isNormalizationAvailable ? "Smart Text Optimization (Recommended)" : "Smart Text Optimization (OpenAI API Key not configured)"}
                                description="Automatically fixes pronunciations, numbers, and formatting to prevent gibberish and audio errors."
                            />

                            {!autoNormalize && (
                                <div className="p-4 bg-blue-900/20 border border-blue-800/50 rounded-xl">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                        <div>
                                            <h4 className="font-semibold text-blue-300 mb-1">Manual Script Preparation</h4>
                                            <p className="text-sm text-blue-200">
                                                Since auto-optimization is disabled, use our guide to manually format your script for best results.
                                            </p>
                                        </div>
                                        <Button variant="secondary" size="sm" onClick={() => setShowTtsGuide(true)}>
                                            View Guide
                                        </Button>
                                    </div>
                                </div>
                            )}
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

                        <p className={`text-xs text-right pr-2 ${wordCount > 0 && wordCount < 15 ? 'text-yellow-400' : 'text-gray-500'}`}>
                            {wordCount} words
                        </p>

                        <Button
                            variant="primary"
                            size="lg"
                            fullWidth
                            onClick={startProject}
                            isLoading={isProcessing}
                            disabled={!mainText.trim() || !mainSelectedVoice || !audioName.trim() || wordCount < 15}
                        >
                            {isProcessing ? 'Starting Project...' : (wordCount < 15 ? 'Minimum 15 words required' : 'Generate Audio')}
                        </Button>
                    </div>
                ) : (
                    <ProjectView
                        project={project}
                        onRegenerate={handleRegenerate}
                        onStitch={handleStitch}
                        onDownload={handleDownloadFinal}
                        onDownloadNormalizedText={handleDownloadNormalizedText}
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