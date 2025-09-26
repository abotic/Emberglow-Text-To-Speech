import { useState } from 'react';
import { IconEdit2, IconTrash, IconX, IconCheck } from '../../icons';
import { Voice } from '../../types';
import { formatDate } from '../../utils/audio';

export interface VoiceItemProps {
  voice: Voice & { created_at?: string };
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
}

export const VoiceItem: React.FC<VoiceItemProps> = ({ voice, onDelete, onRename }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(voice.name);

  const handleSave = () => {
    const name = editName.trim();
    if (name && name !== voice.name) onRename(voice.id, name);
    setIsEditing(false);
  };

  return (
    <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-xl hover:bg-gray-800/50 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="flex-1 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-sm text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') {
                    setEditName(voice.name);
                    setIsEditing(false);
                  }
                }}
              />
              <button onClick={handleSave} className="p-1 hover:bg-gray-700 rounded transition-colors">
                <IconCheck className="w-4 h-4 text-green-400" />
              </button>
              <button
                onClick={() => {
                  setEditName(voice.name);
                  setIsEditing(false);
                }}
                className="p-1 hover:bg-gray-700 rounded transition-colors"
              >
                <IconX className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          ) : (
            <div>
              <h3 className="font-medium text-gray-200 truncate">{voice.name}</h3>
              <p className="text-xs text-gray-500 mt-1">{formatDate(voice.created_at)}</p>
            </div>
          )}
        </div>
        {!isEditing && (
          <div className="flex gap-1">
            <button onClick={() => setIsEditing(true)} className="p-1.5 hover:bg-gray-700 rounded transition-colors" title="Rename voice">
              <IconEdit2 className="w-4 h-4 text-gray-400" />
            </button>
            <button onClick={() => onDelete(voice.id)} className="p-1.5 hover:bg-gray-700 rounded transition-colors" title="Delete voice">
              <IconTrash className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};