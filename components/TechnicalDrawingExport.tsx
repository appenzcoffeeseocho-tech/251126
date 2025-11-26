import React, { useRef, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';

interface Dimension {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    offset: number;
    label: string;
}

interface TechnicalDrawingExportProps {
    isometricImage: string;
    frontView: string;
    sideView: string;
    dimensions: Dimension[];
    metadata: {
        title: string;
        date: string;
        notes: string;
    };
    onClose: () => void;
    onMetadataChange: (metadata: {title: string, date: string, notes: string}) => void;
    imageHistory?: any[];
    onHistoryClick?: (item: any) => void;
    onModeChange?: (mode: string) => void;
}

export const TechnicalDrawingExport: React.FC<TechnicalDrawingExportProps> = ({
    isometricImage,
    frontView,
    sideView,
    dimensions,
    metadata,
    onClose,
    onMetadataChange,
    imageHistory = [],
    onHistoryClick,
    onModeChange
}) => {
    const templateRef = useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [fitToScreen, setFitToScreen] = useState(true);
    const [tempMetadata, setTempMetadata] = useState(metadata);

    const modeButtons = [
        { key: 'upload', label: '이미지업로드' },
        { key: 'object', label: '객체편집' },
        { key: 'sketch', label: '스케치' },
        { key: 'blueprint', label: '도면작업' },
        { key: 'final', label: '최종도면', active: true }
    ];

    useEffect(() => {
        if (fitToScreen && templateRef.current) {
            const container = templateRef.current.parentElement;
            if (!container) return;
            
            const containerWidth = container.clientWidth - 100;
            const containerHeight = container.clientHeight - 100;
            
            const scaleX = containerWidth / 595.3;
            const scaleY = containerHeight / 841.9;
            const autoZoom = Math.min(scaleX, scaleY, 1);
            
            setZoom(autoZoom);
        }
    }, [fitToScreen]);

    const handleExport = async () => {
        if (!templateRef.current) return;
        
        setIsExporting(true);
        try {
            const canvas = await html2canvas(templateRef.current, {
                scale: 3,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true
            });
            
            canvas.toBlob((blob) => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.download = `${tempMetadata.title.replace(/\s+/g, '_')}_${Date.now()}.png`;
                    link.href = url;
                    link.click();
                    URL.revokeObjectURL(url);
                }
            }, 'image/png', 1.0);
        } catch (error) {
            console.error('Export failed:', error);
            alert('내보내기 실패');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden">
            {/* 상단: 모드 버튼 */}
            <div className="flex items-center gap-3 px-8 h-14 bg-black/40 backdrop-blur-md border-b border-white/10">
                {modeButtons.map((btn) => (
                    <button
                        key={btn.key}
                        onClick={() => {
                            if (btn.key !== 'final') {
                                onModeChange?.(btn.key.toUpperCase());
                            }
                        }}
                        className={`
                            px-6 py-2.5 rounded-xl font-medium text-sm tracking-wide
                            transition-all duration-300 ease-out
                            ${btn.active
                                ? 'bg-blue-500/90 text-white shadow-lg shadow-blue-500/30 scale-105' 
                                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white hover:scale-102'
                            }
                        `}
                    >
                        {btn.label}
                    </button>
                ))}
            </div>

            {/* 메인 영역 */}
            <div className="flex flex-1 overflow-hidden">
                {/* 좌측: 히스토리 */}
                <div className="w-28 bg-black/60 backdrop-blur-xl overflow-y-auto border-r border-white/10 p-2">
                    <h4 className="text-white font-semibold mb-3 text-xs uppercase tracking-wider opacity-60">
                        히스토리
                    </h4>
                    {imageHistory && imageHistory.length > 0 ? (
                        <div className="flex flex-col gap-2">
                            {[...imageHistory].reverse().map((item, idx) => (
                                <div
                                    key={item.id || `history-${idx}`}
                                    onClick={() => onHistoryClick?.(item)}
                                    className="group cursor-pointer rounded-lg overflow-hidden
                                               bg-white/5 hover:bg-white/10 transition-all duration-300
                                               border border-white/10 hover:border-white/20
                                               hover:scale-105"
                                >
                                    <img 
                                        src={item.imageUrl} 
                                        alt={item.title || `이미지 ${imageHistory.length - idx}`}
                                        className="w-full h-auto"
                                    />
                                    <div className="p-1">
                                        <span className="block text-[10px] text-gray-400 group-hover:text-white 
                                                       truncate transition-colors">
                                            {item.title || `이미지 ${imageHistory.length - idx}`}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-500 text-xs text-center mt-4">히스토리 없음</p>
                    )}
                </div>

                {/* 중앙: 도면 미리보기 */}
                <div className="flex-1 overflow-auto p-8 flex justify-center items-start bg-gradient-to-br from-black via-[#0A0A0B] to-black">
                    <div
                        ref={templateRef}
                        style={{
                            width: '595.3px',
                            height: '841.9px',
                            backgroundColor: 'white',
                            position: 'relative',
                            transform: `scale(${zoom})`,
                            transformOrigin: 'top center',
                            transition: 'transform 0.3s ease',
                            boxShadow: '0 20px 60px rgba(59, 130, 246, 0.3), 0 0 100px rgba(0, 0, 0, 0.8)',
                            borderRadius: '8px',
                            overflow: 'hidden'
                        }}
                    >
                        <svg viewBox="0 0 595.3 841.9" style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
                            {/* 배경 */}
                            <rect x="0.2" y="0" fill="#FFFFFF" width="594.9" height="841.9"/>
                            
                            {/* 텍스트 영역 배경 */}
                            <rect x="135.1" y="21.3" opacity="0.23" fill="#FFFFFF" width="37.5" height="45.3"/>
                            <rect x="172.5" y="66.7" opacity="0.23" fill="#FFFFFF" width="407.4" height="45.2"/>
                            <rect x="135.1" y="66.7" opacity="0.23" fill="#FFFFFF" width="37.5" height="45.3"/>
                            <rect x="15.1" y="13.6" opacity="0.23" fill="#FFFFFF" width="105.9" height="105.9"/>
                            
                            {/* 메인 테두리 */}
                            <rect x="15.4" y="120.7" fill="none" stroke="#000000" strokeWidth="2" width="564.5" height="705.7"/>
                            
                            {/* 구분선 */}
                            <line x1="389" y1="32.7" x2="389" y2="55.2" stroke="#000000" strokeWidth="0.25"/>
                            <line x1="580.1" y1="66.6" x2="134.9" y2="66.6" stroke="#000000" strokeWidth="0.25"/>
                            <line x1="28.7" y1="600.4" x2="566.5" y2="600.4" stroke="#000000" strokeWidth="0.25"/>
                            <line x1="297.6" y1="800.5" x2="297.6" y2="627.2" stroke="#000000" strokeWidth="0.25" strokeMiterlimit="10"/>
                            
                            <rect x="406.2" y="21.3" opacity="0.23" fill="#FFFFFF" width="37.5" height="45.3"/>
                            <rect x="443.7" y="21.3" opacity="0.23" fill="#FFFFFF" width="136.2" height="45.2"/>
                            <rect x="172.5" y="21.3" opacity="0.23" fill="#FFFFFF" width="216.5" height="45.2"/>

                            {/* 레이블 텍스트 */}
                            <text x="150" y="44" fontSize="12" fontWeight="bold" fill="#040000">TITLE</text>
                            <text x="150" y="89" fontSize="12" fontWeight="bold" fill="#040000">NOTE</text>
                            <text x="420" y="44" fontSize="12" fontWeight="bold" fill="#040000">DATE</text>

                            {/* APPENZ 로고 */}
                            <g transform="translate(15.1, 13.6)">
                                <g>
                                    <path fill="#040000" d="M38.9,58.3c0-0.1,0.1-0.2,0.2-0.3c0.1-0.1,0.2-0.1,0.3-0.1l2.2,0c0.1,0,0.2,0,0.3,0.1 c0.1,0.1,0.2,0.2,0.2,0.3l4.7,11.4c0,0.1,0,0.2,0,0.3c-0.1,0.1-0.2,0.2-0.3,0.2l-2.7,0c-0.1,0-0.2,0-0.3-0.1 c-0.1-0.1-0.2-0.2-0.2-0.3l-0.4-1c-0.1-0.1-0.1-0.2-0.2-0.3c-0.1-0.1-0.2-0.1-0.3-0.1l-3.4,0c-0.1,0-0.2,0-0.3,0.1 c-0.1,0.1-0.2,0.2-0.2,0.3l-0.4,1c0,0.1-0.1,0.2-0.2,0.3c-0.1,0.1-0.2,0.1-0.3,0.1l-2.7,0c-0.1,0-0.1,0-0.2,0 c-0.1,0-0.1-0.1-0.1-0.1c0,0-0.1-0.1-0.1-0.2c0-0.1,0-0.1,0-0.2L38.9,58.3z M39.9,65.7l1.4,0c0.1,0,0.2,0,0.2-0.1 c0-0.1,0-0.2,0-0.3c-0.1-0.3-0.2-0.6-0.4-1c-0.1-0.4-0.3-0.7-0.4-1.1c0-0.1-0.1-0.2-0.1-0.2c-0.1,0-0.1,0.1-0.1,0.2l-0.8,2 c0,0.1,0,0.2,0,0.3C39.7,65.6,39.7,65.7,39.9,65.7z"/>
                                    <path fill="#040000" d="M52.5,67l-1.4,0c-0.1,0-0.2,0-0.3,0.1c-0.1,0.1-0.1,0.2-0.1,0.3l0,2.5c0,0.1,0,0.2-0.1,0.3 c-0.1,0.1-0.2,0.1-0.3,0.1l-2.4,0c-0.1,0-0.2,0-0.3-0.1c-0.1-0.1-0.1-0.2-0.1-0.3l0-11.5c0-0.1,0-0.2,0.1-0.3 c0.1-0.1,0.2-0.1,0.3-0.1l4.9,0c0.6,0,1.2,0.1,1.7,0.4c0.5,0.2,1,0.6,1.4,1c0.4,0.4,0.7,0.9,0.9,1.4c0.2,0.5,0.3,1.1,0.3,1.8 c0,0.6-0.1,1.2-0.3,1.8c-0.2,0.5-0.5,1-0.9,1.4c-0.4,0.4-0.9,0.7-1.5,0.9C53.9,66.8,53.2,67,52.5,67z M52.6,61l-1.5,0 c-0.1,0-0.2,0-0.3,0.1c-0.1,0.1-0.1,0.2-0.1,0.3l0,2c0,0.1,0,0.2,0.1,0.3c0.1,0.1,0.2,0.1,0.3,0.1l1.7,0c0.4,0,0.7-0.1,0.9-0.4 c0.2-0.3,0.3-0.6,0.3-0.9c0-0.2,0-0.4-0.1-0.5c-0.1-0.2-0.1-0.3-0.3-0.5c-0.1-0.1-0.3-0.2-0.4-0.3C53,61.1,52.8,61,52.6,61z"/>
                                    <path fill="#040000" d="M62.8,66.9l-1.4,0c-0.1,0-0.2,0-0.3,0.1c-0.1,0.1-0.1,0.2-0.1,0.3l0,2.5c0,0.1,0,0.2-0.1,0.3 c-0.1,0.1-0.2,0.1-0.3,0.1l-2.4,0c-0.1,0-0.2,0-0.3-0.1c-0.1-0.1-0.1-0.2-0.1-0.3l0-11.5c0-0.1,0-0.2,0.1-0.3 C58,58,58.1,58,58.2,58l4.9,0c0.6,0,1.2,0.1,1.7,0.4c0.5,0.2,1,0.6,1.4,1s0.7,0.9,0.9,1.4c0.2,0.5,0.3,1.1,0.3,1.8 c0,0.6-0.1,1.2-0.3,1.8c-0.2,0.5-0.5,1-0.9,1.4c-0.4,0.4-0.9,0.7-1.5,0.9C64.3,66.8,63.6,66.9,62.8,66.9z M62.9,61l-1.5,0 c-0.1,0-0.2,0-0.3,0.1c-0.1,0.1-0.1,0.2-0.1,0.3l0,2c0,0.1,0,0.2,0.1,0.3c0.1,0.1,0.2,0.1,0.3,0.1l1.7,0c0.4,0,0.7-0.1,0.9-0.4 c0.2-0.3,0.3-0.6,0.3-0.9c0-0.2,0-0.4-0.1-0.5c-0.1-0.2-0.1-0.3-0.3-0.5c-0.1-0.1-0.3-0.2-0.4-0.3C63.3,61.1,63.1,61,62.9,61z"/>
                                    <path fill="#040000" d="M71.4,61.4v0.7c0,0.1,0,0.2,0.1,0.3c0.1,0.1,0.2,0.1,0.3,0.1l4.3,0c0.1,0,0.2,0,0.3,0.1 c0.1,0.1,0.1,0.2,0.1,0.3v2.3c0,0.1,0,0.2-0.1,0.3c-0.1,0.1-0.2,0.1-0.3,0.1l-4.3,0c-0.1,0-0.2,0-0.3,0.1 c-0.1,0.1-0.1,0.2-0.1,0.3v0.6c0,0.1,0,0.2,0.1,0.3c0.1,0.1,0.2,0.1,0.3,0.1l5,0c0.1,0,0.2,0,0.3,0.1c0.1,0.1,0.1,0.2,0.1,0.3 l0,2.3c0,0.1,0,0.2-0.1,0.3c-0.1,0.1-0.2,0.1-0.3,0.1l-8.1,0c-0.1,0-0.2,0-0.3-0.1c-0.1-0.1-0.1-0.2-0.1-0.3l0-11.5 c0-0.1,0-0.2,0.1-0.3c0.1-0.1,0.2-0.1,0.3-0.1l8.1,0c0.1,0,0.2,0,0.3,0.1c0.1,0.1,0.1,0.2,0.1,0.3l0,2.3c0,0.1,0,0.2-0.1,0.3 C76.9,61,76.8,61,76.7,61l-5,0c-0.1,0-0.2,0-0.3,0.1C71.4,61.2,71.4,61.3,71.4,61.4z"/>
                                    <path fill="#040000" d="M89,58.3l0,11.5c0,0.1,0,0.2-0.1,0.3c-0.1,0.1-0.2,0.1-0.3,0.1l-2.4,0c-0.1,0-0.2,0-0.3-0.1 c-0.1-0.1-0.2-0.1-0.3-0.2l-4.2-6.2c-0.1-0.1-0.1-0.1-0.2-0.1c-0.1,0-0.1,0.1-0.1,0.2l0,6c0,0.1,0,0.2-0.1,0.3 c-0.1,0.1-0.2,0.1-0.3,0.1l-2.4,0c-0.1,0-0.2,0-0.3-0.1C78.1,70.1,78,70,78,69.8l0-11.5c0-0.1,0-0.2,0.1-0.3 c0.1-0.1,0.2-0.1,0.3-0.1l2.4,0c0.1,0,0.2,0,0.3,0.1c0.1,0.1,0.2,0.1,0.3,0.2l4.2,6.2c0.1,0.1,0.1,0.1,0.2,0.1 c0.1,0,0.1-0.1,0.1-0.2l0-6c0-0.1,0-0.2,0.1-0.3c0.1-0.1,0.2-0.1,0.3-0.1l2.4,0c0.1,0,0.2,0,0.3,0.1C89,58.1,89,58.2,89,58.3z"/>
                                    <path fill="#040000" d="M99.5,70.2l-9,0c-0.1,0-0.2,0-0.3-0.1c-0.1-0.1-0.1-0.2-0.1-0.3l0-1.9c0-0.1,0-0.2,0.1-0.4 c0.1-0.1,0.1-0.2,0.2-0.3l4.9-5.8c0.1-0.1,0.1-0.2,0.1-0.3c0-0.1-0.1-0.2-0.2-0.2l-4.6,0c-0.1,0-0.2,0-0.3-0.1 c-0.1-0.1-0.1-0.2-0.1-0.3l0-2.3c0-0.1,0-0.2,0.1-0.3c0.1-0.1,0.2-0.1,0.3-0.1l9,0c0.1,0,0.2,0,0.3,0.1c0.1,0.1,0.1,0.2,0.1,0.3 l0,1.9c0,0.1,0,0.2-0.1,0.4c0,0.1-0.1,0.2-0.2,0.3l-4.9,5.8c-0.1,0.1-0.1,0.2-0.1,0.3c0,0.1,0.1,0.1,0.2,0.1l4.6,0 c0.1,0,0.2,0,0.3,0.1c0.1,0.1,0.1,0.2,0.1,0.3l0,2.3c0,0.1,0,0.2-0.1,0.3C99.7,70.2,99.6,70.2,99.5,70.2z"/>
                                </g>
                                <polygon fill="none" stroke="#231815" strokeMiterlimit="10" points="27.1,66.6 47.4,102.3 88.1,102.3 108.9,66.6 88.1,30.8 47.9,30.8 "/>
                                <polygon fill="#7F7669" points="36.8,79.6 46.9,97 89,97 99.2,79.6 "/>
                                <polygon fill="#7F7669" points="47.9,98.6 48.6,99.9 87.2,99.9 88.1,98.6 "/>
                                <polygon fill="#7F7669" points="99.2,54.7 89.1,35.9 47,35.9 36.9,54.7 "/>
                                <polygon fill="#7F7669" points="88.1,34.5 87.5,33.2 48.5,33.2 47.5,34.5 "/>
                            </g>

                            {/* 이미지 영역 */}
                            <image href={`data:image/png;base64,${isometricImage}`} x="20.5" y="124.8" width="554.2" height="470.7" preserveAspectRatio="xMidYMid meet" />
                            <image href={`data:image/png;base64,${frontView}`} x="20.8" y="604.7" width="272.2" height="218.3" preserveAspectRatio="xMidYMid meet" />
                            <image href={`data:image/png;base64,${sideView}`} x="302.2" y="604.7" width="272.2" height="218.3" preserveAspectRatio="xMidYMid meet" />

                            {/* 텍스트 오버레이 */}
                            <foreignObject x="172.5" y="21.3" width="216.5" height="45.2">
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px' }}>
                                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827', textAlign: 'center' }}>{tempMetadata.title}</span>
                                </div>
                            </foreignObject>
                            
                            <foreignObject x="443.7" y="21.3" width="136.2" height="45.2">
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#111827', textAlign: 'center' }}>{tempMetadata.date}</span>
                                </div>
                            </foreignObject>
                            
                            <foreignObject x="172.5" y="66.7" width="407.4" height="45.2">
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '10px' }}>
                                    <span style={{ fontSize: '10px', color: '#374151', lineHeight: '1.4' }}>{tempMetadata.notes}</span>
                                </div>
                            </foreignObject>
                        </svg>
                    </div>
                </div>
            </div>

            {/* 하단: Zoom + 텍스트 3개 + 저장 */}
            <div className="flex items-center justify-between px-8 py-4 
                          bg-gradient-to-t from-black via-[#0A0A0B] to-black/80 
                          backdrop-blur-xl border-t border-white/10">
                <div></div>
                
                {/* 중앙: Zoom */}
                <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2 border border-white/10">
                    <button onClick={() => setFitToScreen(true)} 
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${fitToScreen ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white'}`}>
                        Fit
                    </button>
                    <button onClick={() => setZoom(Math.max(0.25, zoom - 0.25))} 
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-all duration-200">
                        -
                    </button>
                    <span className="px-3 py-1.5 text-xs font-medium text-blue-400">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(Math.min(2, zoom + 0.25))} 
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-all duration-200">
                        +
                    </button>
                    <button onClick={() => { setFitToScreen(false); setZoom(1); }} 
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-all duration-200">
                        100%
                    </button>
                </div>
                
                {/* 우측: 텍스트 3개 + 저장 */}
                <div className="flex items-center gap-3">
                    <input
                        type="text"
                        value={tempMetadata.title}
                        onChange={(e) => setTempMetadata({...tempMetadata, title: e.target.value})}
                        onBlur={() => onMetadataChange(tempMetadata)}
                        placeholder="제목"
                        className="px-3 py-2 bg-white/5 text-white rounded-xl w-36 text-sm
                                 border border-white/10 focus:border-blue-500/50
                                 focus:outline-none focus:ring-2 focus:ring-blue-500/20
                                 placeholder-gray-500 transition-all duration-300"
                    />
                    <input
                        type="text"
                        value={tempMetadata.date}
                        onChange={(e) => setTempMetadata({...tempMetadata, date: e.target.value})}
                        onBlur={() => onMetadataChange(tempMetadata)}
                        placeholder="날짜"
                        className="px-3 py-2 bg-white/5 text-white rounded-xl w-36 text-sm
                                 border border-white/10 focus:border-blue-500/50
                                 focus:outline-none focus:ring-2 focus:ring-blue-500/20
                                 placeholder-gray-500 transition-all duration-300"
                    />
                    <input
                        type="text"
                        value={tempMetadata.notes}
                        onChange={(e) => setTempMetadata({...tempMetadata, notes: e.target.value})}
                        onBlur={() => onMetadataChange(tempMetadata)}
                        placeholder="노트"
                        className="px-3 py-2 bg-white/5 text-white rounded-xl w-36 text-sm
                                 border border-white/10 focus:border-blue-500/50
                                 focus:outline-none focus:ring-2 focus:ring-blue-500/20
                                 placeholder-gray-500 transition-all duration-300"
                    />
                    <button onClick={handleExport} disabled={isExporting} 
                            className="px-6 py-2.5 rounded-xl font-medium text-sm
                                     bg-green-500/90 hover:bg-green-500 text-white
                                     shadow-lg shadow-green-500/30 hover:shadow-green-500/50
                                     transition-all duration-300 hover:scale-105
                                     disabled:opacity-50 disabled:cursor-not-allowed">
                        {isExporting ? '저장 중...' : '이미지 저장'}
                    </button>
                </div>
            </div>
        </div>
    );
};