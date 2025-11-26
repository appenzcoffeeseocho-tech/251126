
import React, { useState, useEffect, useRef } from 'react';
import type { DetectedObject } from '../types';

interface ObjectLayerProps {
  object: DetectedObject;
  level: number;
  selectedObjectId: string | null;
  onSelect: (id: string) => void;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onRename: (id: string, newLabel: string) => void;
}

export const ObjectLayer: React.FC<ObjectLayerProps> = ({ object, level, selectedObjectId, onSelect, isExpanded, onToggleExpand, onRename }) => {
  const isSelected = selectedObjectId === object.id;
  const hasChildren = object.children && object.children.length > 0;
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(object.label);
  const inputRef = useRef<HTMLInputElement>(null);

  // When the object prop changes from the parent, update the local label state
  useEffect(() => {
    setLabel(object.label);
  }, [object.label]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);
  
  const handleRename = () => {
    if (label.trim() && label.trim() !== object.label) {
      onRename(object.id, label.trim());
    } else {
      setLabel(object.label); // Revert if empty or unchanged
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setLabel(object.label);
      setIsEditing(false);
    }
  };

  return (
    <div>
      <div
        onClick={() => onSelect(object.id)}
        onDoubleClick={() => setIsEditing(true)}
        style={{ marginLeft: `${level * 12}px` }}
        className={`
            p-3 mb-2 rounded-xl transition-all duration-200 cursor-pointer border flex items-center gap-3
            ${isSelected 
                ? 'bg-gradient-to-r from-[#3B82F6]/20 to-[#2563EB]/20 border-[#3B82F6] shadow-lg shadow-blue-500/20' 
                : 'bg-[#27272A] border-[#3F3F46] hover:border-[#52525B] hover:bg-[#3F3F46]'
            }
        `}
      >
        {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); onToggleExpand(object.id); }} className={`p-1 rounded hover:bg-white/10 transition-transform ${isExpanded ? 'rotate-90' : 'rotate-0'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isSelected ? '#FAFAFA' : '#A1A1AA'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
        ) : <div className="w-[20px]"></div> /* Spacer */ }
        
        {object.thumbnailUrl && (
            <img src={object.thumbnailUrl} alt={object.label} className="w-8 h-8 rounded-md object-cover flex-shrink-0 bg-[#18181B] border border-[#3F3F46]" />
        )}
        {isEditing ? (
            <input
                ref={inputRef}
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={handleRename}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#18181B] text-white rounded w-full p-1 -m-1 border border-[#3B82F6] focus:outline-none"
            />
        ) : (
            <span className={`truncate flex-1 text-sm font-medium ${isSelected ? 'text-white' : 'text-[#A1A1AA]'}`} title="Double-click to rename">{object.label}</span>
        )}
      </div>
      {isExpanded && hasChildren && (
        <div>
          {object.children.map(child => (
            <ObjectLayer
              key={child.id}
              object={child}
              level={level + 1}
              selectedObjectId={selectedObjectId}
              onSelect={onSelect}
              isExpanded={isExpanded}
              onToggleExpand={onToggleExpand}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  );
};
