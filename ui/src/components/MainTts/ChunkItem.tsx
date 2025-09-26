import React from 'react';
import type { Chunk } from '../../types';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { IconRefreshCw, IconX } from '../../icons';
import { audioService } from '../../services/audioService';

interface Props {
  chunk: Chunk;
  onRegenerate: () => void;
  isCancelling: boolean;
  isRegenerating: boolean;
  allChunksDone: boolean;
}

export const ChunkItem: React.FC<Props> = ({ chunk, onRegenerate, isCancelling, isRegenerating, allChunksDone }) => {
  const isCancellable = chunk.status === 'processing' || chunk.status === 'pending';
  const showRegeneratingState = isRegenerating && chunk.status === 'processing';

  return (
    <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/50">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-500 mb-2">CHUNK {chunk.index + 1}</p>
          <p className="text-sm text-gray-300 leading-relaxed">{chunk.text}</p>
          {typeof chunk.elapsed_time === 'number' && (
            <p className="text-xs text-gray-500 mt-2">Generated in {chunk.elapsed_time.toFixed(1)}s</p>
          )}
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
                  <audio
                    src={audioService.getAudioUrl(chunk.audio_filename)}
                    controls
                    className="w-full h-12 rounded-lg"
                    style={{ minHeight: '48px' }}
                  />

                  {chunk.index === 0 ? (
                    <div className="text-center text-sm text-gray-500 pt-2">(Initial chunk can't be regenerated)</div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      onClick={onRegenerate}
                      disabled={isRegenerating || !allChunksDone}
                    >
                      <IconRefreshCw className={`w-4 h-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
                      {isRegenerating ? 'Regenerating...' : !allChunksDone ? 'Wait for completion...' : 'Regenerate'}
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
                  <div className="flex items-center justify-center gap-2 text-red-400 py-2">
                    <IconX className="w-4 h-4" />
                    <span className="text-sm">Generation failed</span>
                  </div>

                  {chunk.index === 0 ? (
                    <div className="text-center text-sm text-gray-500 pt-1">(Initial chunk can't be retried)</div>
                  ) : (
                    <Button
                      variant="danger"
                      size="sm"
                      fullWidth
                      onClick={onRegenerate}
                      disabled={isRegenerating || !allChunksDone}
                    >
                      <IconRefreshCw className={`w-4 h-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
                      {isRegenerating ? 'Retrying...' : !allChunksDone ? 'Wait for completion...' : 'Retry'}
                    </Button>
                  )}
                </div>
              )}

              {chunk.status === 'pending' && (
                <div className="flex items-center justify-center gap-2 text-gray-500 py-4">
                  <Spinner size="sm" />
                  <span className="text-sm">Waiting...</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
