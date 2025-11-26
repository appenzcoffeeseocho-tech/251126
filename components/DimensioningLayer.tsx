import React, { useState, useEffect, useRef } from 'react';

interface Dimension {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    offset: number;
    label: string;
}

interface DimensioningLayerProps {
    width: number;
    height: number;
    isActive: boolean;
    currentTool: 'draw';
    onDimensionsChange?: (dimensions: Dimension[]) => void;
    zoom?: number;
}

type DrawingState = 'idle' | 'first_point' | 'second_point' | 'offset_point' | 'awaiting_label';

export const DimensioningLayer: React.FC<DimensioningLayerProps> = ({ 
    width, 
    height, 
    isActive, 
    currentTool,
    onDimensionsChange,
    zoom = 1
}) => {
    const [dimensions, setDimensions] = useState<Dimension[]>([]);
    const [drawingState, setDrawingState] = useState<DrawingState>('idle');
    const [firstPoint, setFirstPoint] = useState<{x: number, y: number} | null>(null);
    const [secondPoint, setSecondPoint] = useState<{x: number, y: number} | null>(null);
    const [offsetPoint, setOffsetPoint] = useState<{x: number, y: number} | null>(null);
    const [labelInput, setLabelInput] = useState('');
    const [isShiftPressed, setIsShiftPressed] = useState(false);
    const [dimensionHistory, setDimensionHistory] = useState<Dimension[][]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Shift') setIsShiftPressed(true);
            if (e.key === 'Escape') {
                setDrawingState('idle');
                setFirstPoint(null);
                setSecondPoint(null);
                setOffsetPoint(null);
            }
            // Ctrl+Z: 실행취소
            if (e.ctrlKey && e.key === 'z' && dimensionHistory.length > 0) {
                const prev = dimensionHistory[dimensionHistory.length - 1];
                setDimensions(prev);
                setDimensionHistory(dimensionHistory.slice(0, -1));
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Shift') setIsShiftPressed(false);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [dimensionHistory]);

    useEffect(() => {
        onDimensionsChange?.(dimensions);
    }, [dimensions, onDimensionsChange]);

    const getScaledCoordinates = (e: React.MouseEvent<SVGSVGElement>): {x: number, y: number} => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const svg = svgRef.current;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgPt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
        return {
            x: Math.max(0, Math.min(width, svgPt.x)),
            y: Math.max(0, Math.min(height, svgPt.y))
        };
    };

    const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!isActive || currentTool !== 'draw') return;

        const point = getScaledCoordinates(e);
        
        if (drawingState === 'idle') {
            // 1번 클릭: 시작점
            setFirstPoint(point);
            setSecondPoint(null);
            setOffsetPoint(null);
            setDrawingState('first_point');
        } else if (drawingState === 'second_point') {
            // 2번 클릭: 끝점 확정
            setDrawingState('offset_point');
        } else if (drawingState === 'offset_point') {
            // 3번 클릭: 오프셋 확정, 텍스트 입력창
            setDrawingState('awaiting_label');
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    };

    const handleCanvasMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!isActive || currentTool !== 'draw') return;
        
        const current = getScaledCoordinates(e);
        
        if (drawingState === 'first_point' && firstPoint) {
            let finalPoint = current;
            if (isShiftPressed) {
                const dx = Math.abs(current.x - firstPoint.x);
                const dy = Math.abs(current.y - firstPoint.y);
                if (dx > dy) {
                    finalPoint = { x: current.x, y: firstPoint.y };
                } else {
                    finalPoint = { x: firstPoint.x, y: current.y };
                }
            }
            
            setSecondPoint(finalPoint);
        } else if (drawingState === 'offset_point' && firstPoint && secondPoint) {
            // 오프셋 미리보기
            setOffsetPoint(current);
        }
    };

    const calculateOffset = (fp: {x: number, y: number}, sp: {x: number, y: number}, op: {x: number, y: number}): number => {
        const dx = sp.x - fp.x;
        const dy = sp.y - fp.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return 50;
        
        const normalX = -dy / len;
        const normalY = dx / len;
        
        const midX = (fp.x + sp.x) / 2;
        const midY = (fp.y + sp.y) / 2;
        
        const toOffset = {
            x: op.x - midX,
            y: op.y - midY
        };
        
        return toOffset.x * normalX + toOffset.y * normalY;
    };

    const handleLabelSubmit = () => {
        if (!firstPoint || !secondPoint || !offsetPoint || !labelInput.trim()) return;
        
        const offset = calculateOffset(firstPoint, secondPoint, offsetPoint);
        
        const newDim: Dimension = {
            id: `dim-${Date.now()}`,
            x1: firstPoint.x,
            y1: firstPoint.y,
            x2: secondPoint.x,
            y2: secondPoint.y,
            offset: offset,
            label: labelInput
        };
        
        setDimensionHistory([...dimensionHistory, dimensions]);
        setDimensions([...dimensions, newDim]);
        setLabelInput('');
        setFirstPoint(null);
        setSecondPoint(null);
        setOffsetPoint(null);
        setDrawingState('idle');
    };

    return (
        <>
            <svg
                ref={svgRef}
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    pointerEvents: isActive ? 'auto' : 'none',
                    cursor: currentTool === 'draw' ? 'crosshair' : 'default'
                }}
                onClick={handleCanvasClick}
                onMouseMove={handleCanvasMouseMove}
            >
                <defs>
                    {/* 1974x1711 캔버스에 맞춘 적절한 크기 */}
                    <marker id="arrowStart" markerWidth="12" markerHeight="12" refX="0" refY="6" orient="auto">
                        <polygon points="12 0, 0 6, 12 12" fill="black" />
                    </marker>
                    <marker id="arrowEnd" markerWidth="12" markerHeight="12" refX="12" refY="6" orient="auto">
                        <polygon points="0 0, 12 6, 0 12" fill="black" />
                    </marker>
                    <marker id="arrowPreview" markerWidth="12" markerHeight="12" refX="12" refY="6" orient="auto">
                        <polygon points="0 0, 12 6, 0 12" fill="#EF4444" />
                    </marker>
                    <marker id="arrowPreviewStart" markerWidth="12" markerHeight="12" refX="0" refY="6" orient="auto">
                        <polygon points="12 0, 0 6, 12 12" fill="#EF4444" />
                    </marker>
                </defs>

                {/* 완성된 치수선 */}
                {dimensions.map((dim) => {
                    const dx = dim.x2 - dim.x1;
                    const dy = dim.y2 - dim.y1;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    if (len === 0) return null;

                    const normalX = -dy / len;
                    const normalY = dx / len;
                    const dimX1 = dim.x1 + normalX * dim.offset;
                    const dimY1 = dim.y1 + normalY * dim.offset;
                    const dimX2 = dim.x2 + normalX * dim.offset;
                    const dimY2 = dim.y2 + normalY * dim.offset;

                    const extDirection = dim.offset >= 0 ? 1 : -1;
                    const extLen = 20;
                    const ext1X2 = dim.x1 + normalX * (Math.abs(dim.offset) + extLen) * extDirection;
                    const ext1Y2 = dim.y1 + normalY * (Math.abs(dim.offset) + extLen) * extDirection;
                    const ext2X2 = dim.x2 + normalX * (Math.abs(dim.offset) + extLen) * extDirection;
                    const ext2Y2 = dim.y2 + normalY * (Math.abs(dim.offset) + extLen) * extDirection;

                    const textX = (dimX1 + dimX2) / 2;
                    const textY = (dimY1 + dimY2) / 2;

                    return (
                        <g key={dim.id}>
                            {/* 양 끝 막대기 (연장선) */}
                            <line x1={dim.x1} y1={dim.y1} x2={ext1X2} y2={ext1Y2} stroke="black" strokeWidth="3" />
                            <line x1={dim.x2} y1={dim.y2} x2={ext2X2} y2={ext2Y2} stroke="black" strokeWidth="3" />
                            
                            {/* 치수선 (양쪽 화살표) */}
                            <line x1={dimX1} y1={dimY1} x2={dimX2} y2={dimY2} 
                                  stroke="black" strokeWidth="3" 
                                  markerStart="url(#arrowStart)" markerEnd="url(#arrowEnd)" />
                            
                            {/* 텍스트 배경 (테두리 없음) */}
                            <rect
                                x={textX - dim.label.length * 12}
                                y={textY - 20}
                                width={dim.label.length * 24}
                                height={40}
                                fill="white"
                            />
                            {/* 텍스트 (적절한 크기) */}
                            <text x={textX} y={textY + 10} fill="black" fontSize="32" fontWeight="bold" textAnchor="middle">
                                {dim.label}
                            </text>
                        </g>
                    );
                })}

                {/* 미리보기 1: 시작점 → 끝점 (빨간색, 양쪽 화살표) */}
                {(drawingState === 'first_point' || drawingState === 'second_point' || drawingState === 'offset_point' || drawingState === 'awaiting_label') && firstPoint && secondPoint && (
                    <line 
                        x1={firstPoint.x} y1={firstPoint.y} 
                        x2={secondPoint.x} y2={secondPoint.y} 
                        stroke="#EF4444" strokeWidth="3" 
                        markerStart="url(#arrowPreviewStart)"
                        markerEnd="url(#arrowPreview)" 
                        strokeDasharray="8,4" 
                    />
                )}

                {/* 미리보기 2: 오프셋 치수선 (빨간색) */}
                {(drawingState === 'offset_point' || drawingState === 'awaiting_label') && firstPoint && secondPoint && offsetPoint && (() => {
                    const offset = calculateOffset(firstPoint, secondPoint, offsetPoint);
                    const dx = secondPoint.x - firstPoint.x;
                    const dy = secondPoint.y - firstPoint.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    if (len === 0) return null;
                    
                    const normalX = -dy / len;
                    const normalY = dx / len;
                    const dimX1 = firstPoint.x + normalX * offset;
                    const dimY1 = firstPoint.y + normalY * offset;
                    const dimX2 = secondPoint.x + normalX * offset;
                    const dimY2 = secondPoint.y + normalY * offset;
                    
                    const extDirection = offset >= 0 ? 1 : -1;
                    const extLen = 20;
                    const ext1X2 = firstPoint.x + normalX * (Math.abs(offset) + extLen) * extDirection;
                    const ext1Y2 = firstPoint.y + normalY * (Math.abs(offset) + extLen) * extDirection;
                    const ext2X2 = secondPoint.x + normalX * (Math.abs(offset) + extLen) * extDirection;
                    const ext2Y2 = secondPoint.y + normalY * (Math.abs(offset) + extLen) * extDirection;
                    
                    return (
                        <g>
                            <line x1={firstPoint.x} y1={firstPoint.y} x2={ext1X2} y2={ext1Y2} stroke="#EF4444" strokeWidth="3" strokeDasharray="8,4" />
                            <line x1={secondPoint.x} y1={secondPoint.y} x2={ext2X2} y2={ext2Y2} stroke="#EF4444" strokeWidth="3" strokeDasharray="8,4" />
                            <line x1={dimX1} y1={dimY1} x2={dimX2} y2={dimY2} 
                                  stroke="#EF4444" strokeWidth="3" 
                                  markerStart="url(#arrowPreviewStart)" markerEnd="url(#arrowPreview)" 
                                  strokeDasharray="8,4" />
                        </g>
                    );
                })()}
            </svg>

            {/* 입력창 */}
            {drawingState === 'awaiting_label' && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-gradient-to-br from-gray-900 to-black p-12 rounded-3xl 
                                  border border-white/20 shadow-2xl w-[900px]">
                        <h3 className="text-white text-2xl font-semibold mb-6 tracking-wide">치수 입력</h3>
                        <input
                            ref={inputRef}
                            type="text"
                            value={labelInput}
                            onChange={(e) => setLabelInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleLabelSubmit();
                                if (e.key === 'Escape') {
                                    setDrawingState('idle');
                                    setFirstPoint(null);
                                    setSecondPoint(null);
                                    setOffsetPoint(null);
                                }
                            }}
                            placeholder="예: 50mm"
                            className="w-full p-6 border-2 border-white/20 rounded-2xl mb-6 text-2xl
                                     bg-white/5 text-white placeholder-gray-500
                                     focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/20
                                     transition-all duration-300"
                        />
                        <div className="flex gap-4">
                            <button onClick={handleLabelSubmit} 
                                    className="flex-1 px-8 py-4 bg-blue-500/90 hover:bg-blue-500 text-white 
                                             rounded-2xl text-xl font-bold
                                             shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50
                                             transition-all duration-300 hover:scale-105">
                                확인
                            </button>
                            <button onClick={() => {
                                        setDrawingState('idle');
                                        setFirstPoint(null);
                                        setSecondPoint(null);
                                        setOffsetPoint(null);
                                    }} 
                                    className="flex-1 px-8 py-4 bg-white/10 hover:bg-white/20 text-white 
                                             rounded-2xl text-xl font-bold border border-white/20
                                             transition-all duration-300 hover:scale-105">
                                취소
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
