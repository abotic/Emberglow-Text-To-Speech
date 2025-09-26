import React from 'react';
import type { Project } from '../../types';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import { Spinner } from '../ui/Spinner';
import { IconRefreshCw, IconDownload, IconX, IconSave, IconFileText } from '../../icons';
import { ChunkItem } from './ChunkItem';

interface Props {
    project: Project;
    onRegenerate: (index: number) => void;
    onStitch: () => void;
    onDownload: () => void;
    onDownloadNormalizedText: () => void;
    onCancel: () => void;
    onNewProject: () => void;
    isProcessing: boolean;
    isCancelling: boolean;
    regeneratingChunks: Set<number>;
}

export const ProjectView: React.FC<Props> = ({
    project,
    onRegenerate,
    onStitch,
    onDownload,
    onDownloadNormalizedText,
    onCancel,
    onNewProject,
    isProcessing,
    isCancelling,
    regeneratingChunks,
}) => {
    const allChunksDone = project.chunks.every((c) => c.status === 'completed');
    const hasProgress = project.progress_percent !== undefined;
    const isProjectActive = ['processing', 'pending', 'cancelling', 'normalizing'].includes(
        project.status || ''
    );

    return (
        <div className="space-y-6">
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                    <div>
                        <h3 className="font-semibold text-white">
                            Project: <span className="text-blue-400">{project.audioName}</span>
                        </h3>
                        <p className="text-xs text-gray-500 font-mono">{project.id}</p>
                        {project.was_normalized && (
                            <p className="text-xs text-green-400 mt-1">Text was optimized for TTS</p>
                        )}
                    </div>
                    {isProjectActive && project.status !== 'normalizing' && (
                        <Button variant="danger" size="sm" onClick={onCancel} isLoading={isCancelling} disabled={isCancelling}>
                            <IconX className="w-4 h-4 mr-2" />
                            Cancel Project
                        </Button>
                    )}
                </div>
                {hasProgress && (
                    <div className="space-y-2">
                        <ProgressBar
                            progress={project.progress_percent || 0}
                            variant={project.status === 'failed' ? 'error' : 'default'}
                        />
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-gray-500">Progress: {project.progress_percent || 0}%</p>
                            <p className="text-xs text-gray-400 capitalize">Status: {project.status}</p>
                        </div>
                    </div>
                )}
            </div>

            {project.status === 'normalizing' ? (
                <div className="flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-gray-700 rounded-xl">
                    <Spinner size="lg" />
                    <h3 className="mt-4 text-lg font-semibold text-white">Preparing Your Script...</h3>
                    <p className="mt-1 text-sm text-gray-400">
                        The AI is optimizing your text for the best pronunciation and flow. This may take a minute for long scripts.
                    </p>
                </div>
            ) : (
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    {project.chunks.map((chunk, index) => (
                        <ChunkItem
                            key={index}
                            chunk={chunk}
                            onRegenerate={() => onRegenerate(index)}
                            isCancelling={isCancelling}
                            isRegenerating={regeneratingChunks.has(index)}
                            allChunksDone={allChunksDone}
                        />
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Button variant="ghost" size="lg" fullWidth onClick={onNewProject} disabled={isProcessing || isCancelling}>
                    <IconRefreshCw className="w-5 h-5 mr-2" />
                    New Project
                </Button>
                <Button
                    variant="ghost"
                    size="lg"
                    fullWidth
                    onClick={onDownloadNormalizedText}
                    disabled={!project.was_normalized || isProcessing || isCancelling}
                >
                    <IconFileText className="w-5 h-5 mr-2" />
                    Script
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