
import React, { useState, useEffect, useRef } from 'react';

interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface Bounds {
    top: number;
    left: number;
    width: number;
    height: number;
}

interface InteractiveBoundingBoxProps {
    box: Box;
    onBoxChange: (box: Box) => void;
    bounds: Bounds;
}

const HANDLE_SIZE = 8;

export const InteractiveBoundingBox: React.FC<InteractiveBoundingBoxProps> = ({ box, onBoxChange, bounds }) => {
    const [activeDrag, setActiveDrag] = useState<string | null>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const dragStartBox = useRef(box);

    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!activeDrag) return;

            const dx = e.clientX - dragStartPos.current.x;
            const dy = e.clientY - dragStartPos.current.y;
            let newBox = { ...dragStartBox.current };

            if (activeDrag === 'move') {
                // Moving logic
                newBox.x = clamp(dragStartBox.current.x + dx, bounds.left, bounds.left + bounds.width - newBox.width);
                newBox.y = clamp(dragStartBox.current.y + dy, bounds.top, bounds.top + bounds.height - newBox.height);
            } else {
                // Resize logic
                
                // Left Handle
                if (activeDrag.includes('l')) {
                    const maxRightX = dragStartBox.current.x + dragStartBox.current.width - 10; // Keep min 10px width
                    newBox.x = clamp(dragStartBox.current.x + dx, bounds.left, maxRightX);
                    newBox.width = (dragStartBox.current.x + dragStartBox.current.width) - newBox.x;
                }

                // Right Handle
                if (activeDrag.includes('r')) {
                    // FIX: Account for the image's left offset when calculating max width
                    const maxWidth = (bounds.left + bounds.width) - newBox.x;
                    newBox.width = clamp(dragStartBox.current.width + dx, 10, maxWidth);
                }

                // Top Handle
                if (activeDrag.includes('t')) {
                    const maxBottomY = dragStartBox.current.y + dragStartBox.current.height - 10; // Keep min 10px height
                    newBox.y = clamp(dragStartBox.current.y + dy, bounds.top, maxBottomY);
                    newBox.height = (dragStartBox.current.y + dragStartBox.current.height) - newBox.y;
                }

                // Bottom Handle
                if (activeDrag.includes('b')) {
                    // FIX: Account for the image's top offset when calculating max height
                    const maxHeight = (bounds.top + bounds.height) - newBox.y;
                    newBox.height = clamp(dragStartBox.current.height + dy, 10, maxHeight);
                }
            }
            onBoxChange(newBox);
        };

        const handleMouseUp = () => {
            setActiveDrag(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [activeDrag, onBoxChange, bounds]);

    const handleMouseDown = (e: React.MouseEvent, handle: string) => {
        e.stopPropagation();
        setActiveDrag(handle);
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        dragStartBox.current = box;
    };

    const handles = [
        { name: 'tl', cursor: 'nwse-resize' }, { name: 't', cursor: 'ns-resize' }, { name: 'tr', cursor: 'nesw-resize' },
        { name: 'l', cursor: 'ew-resize' }, { name: 'r', cursor: 'ew-resize' },
        { name: 'bl', cursor: 'nesw-resize' }, { name: 'b', cursor: 'ns-resize' }, { name: 'br', cursor: 'nwse-resize' }
    ];

    const getHandleStyle = (name: string): React.CSSProperties => {
        const style: React.CSSProperties = {
            position: 'absolute',
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            backgroundColor: 'white',
            border: '1px solid black',
            zIndex: 10,
        };
        if (name.includes('t')) style.top = -HANDLE_SIZE / 2;
        if (name.includes('b')) style.bottom = -HANDLE_SIZE / 2;
        if (name.includes('l')) style.left = -HANDLE_SIZE / 2;
        if (name.includes('r')) style.right = -HANDLE_SIZE / 2;
        if (name.length === 1 && (name === 't' || name === 'b')) style.left = `calc(50% - ${HANDLE_SIZE / 2}px)`;
        if (name.length === 1 && (name === 'l' || name === 'r')) style.top = `calc(50% - ${HANDLE_SIZE / 2}px)`;
        return style;
    }

    return (
        <div
            ref={boxRef}
            onMouseDown={(e) => handleMouseDown(e, 'move')}
            style={{
                position: 'absolute',
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                border: '2px solid white',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.5), 0 0 10px rgba(0,0,0,0.2)',
                cursor: 'move',
                userSelect: 'none',
                zIndex: 50, 
            }}
        >
            {handles.map(h => (
                <div
                    key={h.name}
                    onMouseDown={(e) => handleMouseDown(e, h.name)}
                    style={{
                        ...getHandleStyle(h.name),
                        cursor: h.cursor
                    }}
                />
            ))}
        </div>
    );
};
