
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';

interface CanvasSketchLayerProps {
    width: number;
    height: number;
    isActive: boolean;
    tool: 'pen' | 'line' | 'rect' | 'eraser' | 'arrow';
    color: string;
    lineWidth: number;
}

export interface CanvasSketchLayerRef {
    getSketchDataUrl: () => string;
    clear: () => void;
    undo: () => void;
    hasHistory: boolean;
}

export const CanvasSketchLayer = forwardRef<CanvasSketchLayerRef, CanvasSketchLayerProps>(({ width, height, isActive, tool, color, lineWidth }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
    
    // For Shapes (Line/Rect/Arrow) preview
    const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
    const [snapshot, setSnapshot] = useState<ImageData | null>(null);

    // For Undo
    const [history, setHistory] = useState<ImageData[]>([]);

    useImperativeHandle(ref, () => ({
        getSketchDataUrl: () => {
            if (!canvasRef.current) return '';
            return canvasRef.current.toDataURL('image/png').split(',')[1];
        },
        clear: () => {
            if (ctx && canvasRef.current) {
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                setHistory([]);
            }
        },
        undo: () => {
            if (!ctx || history.length === 0 || !canvasRef.current) return;
            const previousState = history[history.length - 1];
            setHistory(prev => prev.slice(0, -1));
            ctx.putImageData(previousState, 0, 0);
        },
        hasHistory: history.length > 0
    }));

    useEffect(() => {
        if (canvasRef.current) {
            const context = canvasRef.current.getContext('2d', { willReadFrequently: true });
            if (context) {
                context.lineCap = 'round';
                context.lineJoin = 'round';
                setCtx(context);
            }
        }
    }, []);

    // Update context properties when props change
    useEffect(() => {
        if (ctx) {
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.fillStyle = color; 
        }
    }, [color, lineWidth, ctx]);

    const saveState = () => {
        if (!ctx || !canvasRef.current) return;
        if (history.length > 19) { // Limit history stack
             setHistory(prev => [...prev.slice(1), ctx.getImageData(0, 0, canvasRef.current!.width, canvasRef.current!.height)]);
        } else {
             setHistory(prev => [...prev, ctx.getImageData(0, 0, canvasRef.current!.width, canvasRef.current!.height)]);
        }
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isActive || !ctx || !canvasRef.current) return;
        // e.preventDefault(); // Removed to allow potential scrolling if needed, but handled by css touch-action: none usually
        
        setIsDrawing(true);
        const pos = getPos(e);
        
        // Save current state before starting new stroke/shape for Undo
        saveState();

        setStartPos(pos);
        
        if (['line', 'rect', 'arrow'].includes(tool)) {
            // Save snapshot for live preview
            setSnapshot(ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height));
        }

        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing || !isActive || !ctx || !canvasRef.current) return;
        // e.preventDefault();
        const pos = getPos(e);

        if (tool === 'pen') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        } else if (tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = lineWidth * 5; // Make eraser larger
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over'; // Reset
            ctx.lineWidth = lineWidth; // Reset
        } else if (['line', 'rect', 'arrow'].includes(tool)) {
            if (!snapshot || !startPos) return;
            // Restore canvas to snapshot state to clear previous preview frame
            ctx.putImageData(snapshot, 0, 0);
            
            ctx.beginPath();
            if (tool === 'line') {
                ctx.moveTo(startPos.x, startPos.y);
                ctx.lineTo(pos.x, pos.y);
                ctx.stroke();
            } else if (tool === 'rect') {
                const w = pos.x - startPos.x;
                const h = pos.y - startPos.y;
                ctx.strokeRect(startPos.x, startPos.y, w, h);
            } else if (tool === 'arrow') {
                // Line
                ctx.moveTo(startPos.x, startPos.y);
                ctx.lineTo(pos.x, pos.y);
                ctx.stroke();
                
                // Arrow Head
                const headLen = Math.max(15, lineWidth * 3);
                const angle = Math.atan2(pos.y - startPos.y, pos.x - startPos.x);
                
                ctx.beginPath();
                // Draw arrowhead as a filled triangle
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(pos.x - headLen * Math.cos(angle - Math.PI / 6), pos.y - headLen * Math.sin(angle - Math.PI / 6));
                ctx.lineTo(pos.x - headLen * Math.cos(angle + Math.PI / 6), pos.y - headLen * Math.sin(angle + Math.PI / 6));
                ctx.closePath();
                ctx.fill();
            }
        }
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
        setSnapshot(null);
        setStartPos(null);
        if (ctx) {
             ctx.closePath();
             ctx.globalCompositeOperation = 'source-over';
        }
    };

    const getPos = (e: React.MouseEvent | React.TouchEvent) => {
        if (!canvasRef.current) return { x: 0, y: 0 };
        const rect = canvasRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        const scaleX = canvasRef.current.width / rect.width;
        const scaleY = canvasRef.current.height / rect.height;
        
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    return (
        <div className={`absolute inset-0 z-30 ${isActive ? 'pointer-events-auto' : 'pointer-events-none'}`}>
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                className="w-full h-full touch-none cursor-crosshair"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
            />
        </div>
    );
});
