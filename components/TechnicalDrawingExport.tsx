
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

    // Calculate transform for dimensions to match the isometric image placement within the SVG
    // The dimensions were drawn on a 1974x1711 canvas in EditorView.
    // In this SVG, the image is placed in a rect of 554.2x470.7 at (20.5, 124.8).
    const sourceWidth = 1974;
    const sourceHeight = 1711;
    const targetRect = { x: 20.5, y: 124.8, w: 554.2, h: 470.7 };
    
    // Calculate "meet" aspect ratio logic used by SVG preserveAspectRatio
    const imgScale = Math.min(targetRect.w / sourceWidth, targetRect.h / sourceHeight);
    const scaledWidth = sourceWidth * imgScale;
    const scaledHeight = sourceHeight * imgScale;
    
    // Center the image in the target rect (xMidYMid)
    const offsetX = targetRect.x + (targetRect.w - scaledWidth) / 2;
    const offsetY = targetRect.y + (targetRect.h - scaledHeight) / 2;

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
                        <svg version="1.1" id="레이어_1" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 595.3 841.9" style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} xmlSpace="preserve">
                            <style type="text/css">
                                {`
                                    .st0{fill:#FFFFFF;}
                                    .st1{opacity:0.23;fill:#FFFFFF;enable-background:new;}
                                    .st2{fill:none;stroke:#000000;stroke-width:2;}
                                    .st3{fill:none;stroke:#000000;stroke-width:0.25;}
                                    .st4{fill:none;stroke:#000000;stroke-width:0.5;}
                                    .st5{fill:#040000;}
                                    .st6{fill:none;stroke:#231815;stroke-miterlimit:10;}
                                    .st7{fill:#7F7669;}
                                    .st8{fill:none;stroke:#000000;stroke-width:0.25;stroke-miterlimit:10;}
                                `}
                            </style>
                            <defs>
                                <marker id="exportArrowStart" markerWidth="12" markerHeight="12" refX="0" refY="6" orient="auto">
                                    <polygon points="12 0, 0 6, 12 12" fill="black" />
                                </marker>
                                <marker id="exportArrowEnd" markerWidth="12" markerHeight="12" refX="12" refY="6" orient="auto">
                                    <polygon points="0 0, 12 6, 0 12" fill="black" />
                                </marker>
                            </defs>

                            <rect x="0.2" className="st0" width="594.9" height="841.9"/>
                            <rect x="135.1" y="21.3" className="st1" width="37.5" height="45.3"/>
                            <rect id="TEXT_x5F_NOTE" x="172.5" y="66.7" className="st1" width="407.4" height="45.2"/>
                            <rect x="135.1" y="66.7" className="st1" width="37.5" height="45.3"/>
                            <rect id="LOGO_x5F_SECTION" x="15.1" y="13.6" className="st1" width="105.9" height="105.9"/>
                            <rect x="15.4" y="120.7" className="st2" width="564.5" height="705.7"/>
                            <line className="st3" x1="389" y1="32.7" x2="389" y2="55.2"/>
                            <line className="st3" x1="580.1" y1="66.6" x2="134.9" y2="66.6"/>
                            <rect x="406.2" y="21.3" className="st1" width="37.5" height="45.3"/>
                            <rect id="TEXT_x5F_DATE" x="443.7" y="21.3" className="st1" width="136.2" height="45.2"/>
                            
                            {/* Static Title/Labels (Paths) */}
                            <path d="M135.1,41.3v-1.3h6v1.3h-2.2v6h-1.5v-6H135.1z M143.6,40.1v7.3h-1.5v-7.3H143.6z M144.6,41.3v-1.3h6v1.3h-2.2v6h-1.5v-6 H144.6z M151.6,47.4v-7.3h1.5v6h3.1v1.3H151.6z M157.3,47.4v-7.3h4.9v1.3h-3.4v1.7h3.1v1.3h-3.1v1.7h3.4v1.3H157.3z"/>
                            <path d="M141.5,85.5v7.3h-1.3l-3.2-4.6h-0.1v4.6h-1.5v-7.3h1.4l3.2,4.6h0.1v-4.6H141.5z M149.4,89.1c0,0.8-0.2,1.5-0.5,2 c-0.3,0.6-0.7,1-1.2,1.3c-0.5,0.3-1.1,0.4-1.7,0.4c-0.6,0-1.2-0.1-1.7-0.4c-0.5-0.3-0.9-0.7-1.2-1.3c-0.3-0.6-0.4-1.2-0.4-2 c0-0.8,0.1-1.5,0.4-2s0.7-1,1.2-1.3c0.5-0.3,1.1-0.4,1.7-0.4c0.6,0,1.2,0.1,1.7,0.4c0.5,0.3,0.9,0.7,1.2,1.3 C149.3,87.6,149.4,88.3,149.4,89.1z M147.9,89.1c0-0.5-0.1-1-0.2-1.3c-0.2-0.4-0.4-0.6-0.6-0.8c-0.3-0.2-0.6-0.3-1-0.3 s-0.7,0.1-1,0.3c-0.3,0.2-0.5,0.5-0.6,0.8c-0.2,0.4-0.2,0.8-0.2,1.3c0,0.5,0.1,1,0.2,1.3c0.2,0.4,0.4,0.6,0.6,0.8 c0.3,0.2,0.6,0.3,1,0.3s0.7-0.1,1-0.3c0.3-0.2,0.5-0.5,0.6-0.8C147.8,90.1,147.9,89.6,147.9,89.1z M150,86.7v-1.3h6v1.3h-2.2v6h-1.5 v-6H150z M157,92.8v-7.3h4.9v1.3h-3.4v1.7h3.1v1.3h-3.1v1.7h3.4v1.3H157z"/>
                            <path d="M408.7,47.6h-2.6v-7.3h2.6c0.7,0,1.4,0.1,1.9,0.4c0.5,0.3,0.9,0.7,1.2,1.3c0.3,0.5,0.4,1.2,0.4,2c0,0.8-0.1,1.4-0.4,2 c-0.3,0.5-0.7,1-1.2,1.3C410.1,47.5,409.5,47.6,408.7,47.6z M407.7,46.3h1c0.5,0,0.8-0.1,1.2-0.2c0.3-0.2,0.5-0.4,0.7-0.8 c0.2-0.3,0.2-0.8,0.2-1.3c0-0.5-0.1-1-0.2-1.3c-0.2-0.3-0.4-0.6-0.7-0.8c-0.3-0.2-0.7-0.2-1.2-0.2h-1V46.3z M414.3,47.6h-1.7 l2.5-7.3h2l2.5,7.3H418l-1.8-5.6h-0.1L414.3,47.6z M414.2,44.7h3.9V46h-3.9V44.7z M419.4,41.6v-1.3h6v1.3h-2.2v6h-1.5v-6H419.4z M426.3,47.6v-7.3h4.9v1.3h-3.4v1.7h3.1v1.3h-3.1v1.7h3.4v1.3H426.3z"/>
                            
                            <line className="st4" x1="28.7" y1="600.4" x2="566.5" y2="600.4"/>

                            {/* LOGO - Corrected from 1112.svg */}
                            <g id="LOGO">
                                <g>
                                    <path className="st5" d="M38.9,58.3c0-0.1,0.1-0.2,0.2-0.3c0.1-0.1,0.2-0.1,0.3-0.1l2.2,0c0.1,0,0.2,0,0.3,0.1 c0.1,0.1,0.2,0.2,0.2,0.3l4.7,11.4c0,0.1,0,0.2,0,0.3c-0.1,0.1-0.2,0.2-0.3,0.2l-2.7,0c-0.1,0-0.2,0-0.3-0.1 c-0.1-0.1-0.2-0.2-0.2-0.3l-0.4-1c-0.1-0.1-0.1-0.2-0.2-0.3c-0.1-0.1-0.2-0.1-0.3-0.1l-3.4,0c-0.1,0-0.2,0-0.3,0.1 c-0.1,0.1-0.2,0.2-0.2,0.3l-0.4,1c0,0.1-0.1,0.2-0.2,0.3c-0.1,0.1-0.2,0.1-0.3,0.1l-2.7,0c-0.1,0-0.1,0-0.2,0 c-0.1,0-0.1-0.1-0.1-0.1c0,0-0.1-0.1-0.1-0.2c0-0.1,0-0.1,0-0.2L38.9,58.3z M39.9,65.7l1.4,0c0.1,0,0.2,0,0.2-0.1 c0-0.1,0-0.2,0-0.3c-0.1-0.3-0.2-0.6-0.4-1c-0.1-0.4-0.3-0.7-0.4-1.1c0-0.1-0.1-0.2-0.1-0.2c-0.1,0-0.1,0.1-0.1,0.2l-0.8,2 c0,0.1,0,0.2,0,0.3C39.7,65.6,39.7,65.7,39.9,65.7z"/>
                                    <path className="st5" d="M52.5,67l-1.4,0c-0.1,0-0.2,0-0.3,0.1c-0.1,0.1-0.1,0.2-0.1,0.3l0,2.5c0,0.1,0,0.2-0.1,0.3 c-0.1,0.1-0.2,0.1-0.3,0.1l-2.4,0c-0.1,0-0.2,0-0.3-0.1c-0.1-0.1-0.1-0.2-0.1-0.3l0-11.5c0-0.1,0-0.2,0.1-0.3 c0.1-0.1,0.2-0.1,0.3-0.1l4.9,0c0.6,0,1.2,0.1,1.7,0.4c0.5,0.2,1,0.6,1.4,1c0.4,0.4,0.7,0.9,0.9,1.4c0.2,0.5,0.3,1.1,0.3,1.8 c0,0.6-0.1,1.2-0.3,1.8c-0.2,0.5-0.5,1-0.9,1.4c-0.4,0.4-0.9,0.7-1.5,0.9C53.9,66.8,53.2,67,52.5,67z M52.6,61l-1.5,0 c-0.1,0-0.2,0-0.3,0.1c-0.1,0.1-0.1,0.2-0.1,0.3l0,2c0,0.1,0,0.2,0.1,0.3c0.1,0.1,0.2,0.1,0.3,0.1l1.7,0c0.4,0,0.7-0.1,0.9-0.4 c0.2-0.3,0.3-0.6,0.3-0.9c0-0.2,0-0.4-0.1-0.5c-0.1-0.2-0.1-0.3-0.3-0.5c-0.1-0.1-0.3-0.2-0.4-0.3C53,61.1,52.8,61,52.6,61z"/>
                                    <path className="st5" d="M62.8,66.9l-1.4,0c-0.1,0-0.2,0-0.3,0.1c-0.1,0.1-0.1,0.2-0.1,0.3l0,2.5c0,0.1,0,0.2-0.1,0.3 c-0.1,0.1-0.2,0.1-0.3,0.1l-2.4,0c-0.1,0-0.2,0-0.3-0.1c-0.1-0.1-0.1-0.2-0.1-0.3l0-11.5c0-0.1,0-0.2,0.1-0.3 C58,58,58.1,58,58.2,58l4.9,0c0.6,0,1.2,0.1,1.7,0.4c0.5,0.2,1,0.6,1.4,1s0.7,0.9,0.9,1.4c0.2,0.5,0.3,1.1,0.3,1.8 c0,0.6-0.1,1.2-0.3,1.8c-0.2,0.5-0.5,1-0.9,1.4c-0.4,0.4-0.9,0.7-1.5,0.9C64.3,66.8,63.6,66.9,62.8,66.9z M62.9,61l-1.5,0 c-0.1,0-0.2,0-0.3,0.1c-0.1,0.1-0.1,0.2-0.1,0.3l0,2c0,0.1,0,0.2,0.1,0.3c0.1,0.1,0.2,0.1,0.3,0.1l1.7,0c0.4,0,0.7-0.1,0.9-0.4 c0.2-0.3,0.3-0.6,0.3-0.9c0-0.2,0-0.4-0.1-0.5c-0.1-0.2-0.1-0.3-0.3-0.5c-0.1-0.1-0.3-0.2-0.4-0.3C63.3,61.1,63.1,61,62.9,61z"/>
                                    <path className="st5" d="M71.4,61.4v0.7c0,0.1,0,0.2,0.1,0.3c0.1,0.1,0.2,0.1,0.3,0.1l4.3,0c0.1,0,0.2,0,0.3,0.1 c0.1,0.1,0.1,0.2,0.1,0.3v2.3c0,0.1,0,0.2-0.1,0.3c-0.1,0.1-0.2,0.1-0.3,0.1l-4.3,0c-0.1,0-0.2,0-0.3,0.1 c-0.1,0.1-0.1,0.2-0.1,0.3v0.6c0,0.1,0,0.2,0.1,0.3c0.1,0.1,0.2,0.1,0.3,0.1l5,0c0.1,0,0.2,0,0.3,0.1c0.1,0.1,0.1,0.2,0.1,0.3 l0,2.3c0,0.1,0,0.2-0.1,0.3c-0.1,0.1-0.2,0.1-0.3,0.1l-8.1,0c-0.1,0-0.2,0-0.3-0.1c-0.1-0.1-0.1-0.2-0.1-0.3l0-11.5 c0-0.1,0-0.2,0.1-0.3c0.1-0.1,0.2-0.1,0.3-0.1l8.1,0c0.1,0,0.2,0,0.3,0.1c0.1,0.1,0.1,0.2,0.1,0.3l0,2.3c0,0.1,0,0.2-0.1,0.3 C76.9,61,76.8,61,76.7,61l-5,0c-0.1,0-0.2,0-0.3,0.1C71.4,61.2,71.4,61.3,71.4,61.4z"/>
                                    <path className="st5" d="M89,58.3l0,11.5c0,0.1,0,0.2-0.1,0.3c-0.1,0.1-0.2,0.1-0.3,0.1l-2.4,0c-0.1,0-0.2,0-0.3-0.1 c-0.1-0.1-0.2-0.1-0.3-0.2l-4.2-6.2c-0.1-0.1-0.1-0.1-0.2-0.1c-0.1,0-0.1,0.1-0.1,0.2l0,6c0,0.1,0,0.2-0.1,0.3 c-0.1,0.1-0.2,0.1-0.3,0.1l-2.4,0c-0.1,0-0.2,0-0.3-0.1C78.1,70.1,78,70,78,69.8l0-11.5c0-0.1,0-0.2,0.1-0.3 c0.1-0.1,0.2-0.1,0.3-0.1l2.4,0c0.1,0,0.2,0,0.3,0.1c0.1,0.1,0.2,0.1,0.3,0.2l4.2,6.2c0.1,0.1,0.1,0.1,0.2,0.1 c0.1,0,0.1-0.1,0.1-0.2l0-6c0-0.1,0-0.2,0.1-0.3c0.1-0.1,0.2-0.1,0.3-0.1l2.4,0c0.1,0,0.2,0,0.3,0.1C89,58.1,89,58.2,89,58.3z"/>
                                    <path className="st5" d="M99.5,70.2l-9,0c-0.1,0-0.2,0-0.3-0.1c-0.1,0.1-0.1,0.2-0.1-0.3l0-1.9c0-0.1,0-0.2,0.1-0.4 c0.1-0.1,0.1-0.2,0.2-0.3l4.9-5.8c0.1-0.1,0.1-0.2,0.1-0.3c0-0.1-0.1-0.2-0.2-0.2l-4.6,0c-0.1,0-0.2,0-0.3-0.1 c-0.1-0.1-0.1-0.2-0.1-0.3l0-2.3c0-0.1,0-0.2,0.1-0.3c0.1-0.1,0.2-0.1,0.3-0.1l9,0c0.1,0,0.2,0,0.3,0.1c0.1,0.1,0.1,0.2,0.1,0.3 l0,1.9c0,0.1,0,0.2-0.1,0.4c0,0.1-0.1,0.2-0.2,0.3l-4.9,5.8c-0.1,0.1-0.1,0.2-0.1,0.3c0,0.1,0.1,0.1,0.2,0.1l4.6,0 c0.1,0,0.2,0,0.3,0.1c0.1,0.1,0.1,0.2,0.1,0.3l0,2.3c0,0.1,0,0.2-0.1,0.3C99.7,70.2,99.6,70.2,99.5,70.2z"/>
                                </g>
                                <g>
                                    <path className="st5" d="M38.4,76.1h-0.4l0-3l1.7,0v0.3l-1.4,0l0,1l1.2,0v0.3l-1.2,0L38.4,76.1z"/>
                                    <path className="st5" d="M41.5,75.8c0.1,0,0.2,0,0.3,0s0.2-0.1,0.2-0.1c0.1,0,0.1-0.1,0.2-0.2c0-0.1,0.1-0.1,0.1-0.2c0,0,0-0.1,0-0.2 c0-0.1,0-0.1,0-0.2l0-1.9h0.4l0,1.9c0,0.1,0,0.1,0,0.2s0,0.1,0,0.2c0,0.1-0.1,0.2-0.1,0.3c-0.1,0.1-0.1,0.2-0.2,0.2 c-0.1,0.1-0.2,0.1-0.3,0.2c-0.1,0-0.3,0.1-0.4,0.1c-0.2,0-0.3,0-0.4-0.1c-0.1,0-0.2-0.1-0.3-0.2s-0.2-0.1-0.2-0.2 c-0.1-0.1-0.1-0.2-0.1-0.3c0-0.1,0-0.2,0-0.2c0-0.1,0-0.2,0-0.3l0-1.9h0.4l0,1.9c0,0.1,0,0.1,0,0.2c0,0.1,0,0.1,0,0.2 c0.1,0.1,0.1,0.3,0.3,0.3C41.2,75.8,41.3,75.8,41.5,75.8z"/>
                                    <path className="st5" d="M43.9,74.9l0,1.3h-0.4l0-3h0.7c0.1,0,0.2,0,0.3,0c0.1,0,0.2,0,0.2,0c0.2,0.1,0.4,0.2,0.5,0.3 c0.1,0.1,0.2,0.3,0.2,0.5c0,0.1,0,0.2-0.1,0.3c0,0.1-0.1,0.2-0.2,0.3c-0.1,0.1-0.1,0.1-0.2,0.2s-0.2,0.1-0.3,0.1v0l0.9,1.3h-0.4 l-0.9-1.3H43.9z M43.9,73.4l0,1.1h0.3c0.1,0,0.2,0,0.3,0c0.1,0,0.1,0,0.2,0c0.1,0,0.2-0.1,0.3-0.2c0.1-0.1,0.1-0.2,0.1-0.3 c0-0.1,0-0.2-0.1-0.3c-0.1-0.1-0.1-0.1-0.3-0.2c-0.1,0-0.1,0-0.2,0c-0.1,0-0.2,0-0.3,0H43.9z"/>
                                    <path className="st5" d="M47.7,74.8c0.2,0.3,0.4,0.5,0.5,0.8h0c0-0.3,0-0.6,0-0.9l0-1.6h0.4l0,3h-0.4l-1.1-1.7 c-0.2-0.3-0.4-0.6-0.5-0.8h0c0,0.3,0,0.6,0,1l0,1.5h-0.4l0-3h0.3L47.7,74.8z"/>
                                    <path className="st5" d="M49.5,76.1l0-3h0.4l0,3H49.5z"/>
                                    <path className="st5" d="M51.7,76.1h-0.4l0-2.7h-1v-0.3h2.3v0.3h-1L51.7,76.1z"/>
                                    <path className="st5" d="M54.4,75.8c0.1,0,0.2,0,0.3,0c0.1,0,0.2-0.1,0.2-0.1c0.1,0,0.1-0.1,0.2-0.2c0-0.1,0.1-0.1,0.1-0.2 c0,0,0-0.1,0-0.2c0-0.1,0-0.1,0-0.2l0-1.9h0.4l0,1.9c0,0.1,0,0.1,0,0.2s0,0.1,0,0.2c0,0.1-0.1,0.2-0.1,0.3 c-0.1,0.1-0.1,0.2-0.2,0.2c-0.1,0.1-0.2,0.1-0.3,0.2c-0.1,0-0.3,0.1-0.4,0.1c-0.2,0-0.3,0-0.4-0.1c-0.1,0-0.2-0.1-0.3-0.2 s-0.2-0.1-0.2-0.2c-0.1-0.1-0.1-0.2-0.1-0.3c0-0.1,0-0.2,0-0.2c0-0.1,0-0.2,0-0.3l0-1.9h0.4l0,1.9c0,0.1,0,0.1,0,0.2 c0,0.1,0,0.1,0,0.2c0.1,0.1,0.1,0.3,0.3,0.3C54,75.8,54.2,75.8,54.4,75.8z"/>
                                    <path className="st5" d="M56.7,74.9l0,1.3h-0.4l0-3h0.7c0.1,0,0.2,0,0.3,0c0.1,0,0.2,0,0.2,0c0.2,0.1,0.4,0.2,0.5,0.3 c0.1,0.1,0.2,0.3,0.2,0.5c0,0.1,0,0.2-0.1,0.3c0,0.1-0.1,0.2-0.2,0.3c-0.1,0.1-0.1,0.1-0.2,0.2s-0.2,0.1-0.3,0.1v0l0.9,1.3H58 l-0.9-1.3H56.7z M56.7,73.4l0,1.1H57c0.1,0,0.2,0,0.3,0c0.1,0,0.1,0,0.2,0c0.1,0,0.2-0.1,0.3-0.2s0.1-0.2,0.1-0.3 c0-0.1,0-0.2-0.1-0.3c-0.1-0.1-0.1-0.1-0.3-0.2c-0.1,0-0.1,0-0.2,0c-0.1,0-0.2,0-0.3,0H56.7z"/>
                                    <path className="st5" d="M59.4,75.8h1.5v0.3h-1.8l0-3h1.7v0.3h-1.4l0,1h1.2v0.3h-1.2L59.4,75.8z"/>
                                    <path className="st5" d="M62.7,76.1l0-3h0.4l0,3H62.7z"/>
                                    <path className="st5" d="M65.4,74.8c0.2,0.3,0.4,0.5,0.5,0.8h0c0-0.3,0-0.6,0-0.9l0-1.6h0.4l0,3h-0.4l-1.1-1.7 c-0.2-0.3-0.4-0.6-0.5-0.8h0c0,0.3,0,0.6,0,1l0,1.5H64l0-3h0.3L65.4,74.8z"/>
                                    <path className="st5" d="M68.2,76.1h-0.4l0-2.7h-1v-0.3h2.3v0.3h-1L68.2,76.1z"/>
                                    <path className="st5" d="M70.1,75.8h1.5v0.3h-1.8l0-3h1.7v0.3h-1.4l0,1h1.2v0.3h-1.2V75.8z"/>
                                    <path className="st5" d="M72.7,74.8v1.3h-0.4l0-3H73c0.1,0,0.2,0,0.3,0s0.2,0,0.2,0c0.2,0.1,0.4,0.2,0.5,0.3c0.1,0.1,0.2,0.3,0.2,0.5 c0,0.1,0,0.2-0.1,0.3c0,0.1-0.1,0.2-0.2,0.3c-0.1,0.1-0.1,0.1-0.2,0.2c-0.1,0-0.2,0.1-0.3,0.1v0l0.9,1.3H74l-0.9-1.3H72.7z M72.7,73.4l0,1.1H73c0.1,0,0.2,0,0.3,0c0.1,0,0.1,0,0.2,0c0.1,0,0.2-0.1,0.3-0.2c0.1-0.1,0.1-0.2,0.1-0.3c0-0.1,0-0.2-0.1-0.3 c-0.1-0.1-0.1-0.1-0.3-0.2c-0.1,0-0.1,0-0.2,0c-0.1,0-0.2,0-0.3,0H72.7z"/>
                                    <path className="st5" d="M75,76.1l0-3h0.4l0,3H75z"/>
                                    <path className="st5" d="M78.8,74.6c0,0.2,0,0.4-0.1,0.6c-0.1,0.2-0.2,0.4-0.3,0.5C78.4,75.9,78.2,76,78,76c-0.2,0.1-0.3,0.1-0.6,0.1 c-0.2,0-0.4,0-0.6-0.1c-0.2-0.1-0.3-0.2-0.4-0.3c-0.1-0.1-0.2-0.3-0.3-0.5c-0.1-0.2-0.1-0.4-0.1-0.6c0-0.2,0-0.4,0.1-0.6 c0.1-0.2,0.2-0.4,0.3-0.5c0.1-0.1,0.3-0.2,0.4-0.3c0.2-0.1,0.4-0.1,0.6-0.1c0.2,0,0.4,0,0.6,0.1c0.2,0.1,0.3,0.2,0.4,0.3 s0.2,0.3,0.3,0.5C78.8,74.1,78.8,74.4,78.8,74.6z M78.5,74.6c0-0.2,0-0.4-0.1-0.5c0-0.2-0.1-0.3-0.2-0.4c-0.1-0.1-0.2-0.2-0.3-0.2 c-0.1-0.1-0.3-0.1-0.4-0.1c-0.1,0-0.3,0-0.4,0.1c-0.1,0.1-0.2,0.1-0.3,0.2s-0.2,0.2-0.2,0.4c-0.1,0.2-0.1,0.3-0.1,0.5 c0,0.2,0,0.4,0.1,0.5c0.1,0.2,0.1,0.3,0.2,0.4c0.1,0.1,0.2,0.2,0.3,0.2c0.1,0.1,0.3,0.1,0.4,0.1c0.1,0,0.3,0,0.4-0.1 c0.1-0.1,0.2-0.1,0.3-0.2c0.1-0.1,0.2-0.2,0.2-0.4C78.5,75,78.5,74.8,78.5,74.6z"/>
                                    <path className="st5" d="M79.8,74.8v1.3h-0.4l0-3h0.7c0.1,0,0.2,0,0.3,0c0.1,0,0.2,0,0.2,0c0.2,0.1,0.4,0.2,0.5,0.3 c0.1,0.1,0.2,0.3,0.2,0.5c0,0.1,0,0.2-0.1,0.3c0,0.1-0.1,0.2-0.2,0.3c-0.1,0.1-0.1,0.1-0.2,0.2c-0.1,0-0.2,0.1-0.3,0.1v0l0.9,1.3 h-0.4l-0.9-1.3H79.8z M79.8,73.4l0,1.1h0.3c0.1,0,0.2,0,0.3,0c0.1,0,0.1,0,0.2,0c0.1,0,0.2-0.1,0.3-0.2c0.1-0.1,0.1-0.2,0.1-0.3 c0-0.1,0-0.2-0.1-0.3c-0.1-0.1-0.1-0.1-0.3-0.2c-0.1,0-0.1,0-0.2,0c-0.1,0-0.2,0-0.3,0H79.8z"/>
                                    <path className="st5" d="M85.3,74.6c0,0.2,0,0.3-0.1,0.5c0,0.2-0.1,0.3-0.2,0.4c-0.1,0.1-0.2,0.2-0.3,0.3c-0.1,0.1-0.3,0.2-0.4,0.2 c-0.1,0-0.2,0-0.3,0.1c-0.1,0-0.2,0-0.4,0H83l0-3h0.7c0.1,0,0.3,0,0.4,0c0.1,0,0.2,0,0.3,0.1c0.2,0,0.3,0.1,0.4,0.2 c0.1,0.1,0.2,0.2,0.3,0.3c0.1,0.1,0.1,0.3,0.2,0.4C85.3,74.2,85.3,74.4,85.3,74.6z M85,74.6c0-0.3-0.1-0.5-0.2-0.7 c-0.1-0.2-0.3-0.3-0.5-0.4c-0.1,0-0.2,0-0.3-0.1c-0.1,0-0.2,0-0.4,0h-0.3l0,2.4h0.3c0.1,0,0.3,0,0.4,0s0.2,0,0.3-0.1 c0.2-0.1,0.4-0.2,0.5-0.4S85,74.9,85,74.6z"/>
                                    <path className="st5" d="M86.5,75.8h1.5v0.3h-1.8l0-3h1.7v0.3h-1.4l0,1h1.2v0.3h-1.2V75.8z"/>
                                    <path className="st5" d="M88.9,73.9c0,0.1,0,0.2,0.1,0.2c0,0.1,0.1,0.1,0.1,0.1c0.1,0,0.1,0.1,0.2,0.1c0.1,0,0.2,0,0.2,0.1 c0.1,0,0.2,0.1,0.3,0.1c0.1,0,0.2,0.1,0.3,0.1c0.1,0.1,0.2,0.1,0.2,0.2c0.1,0.1,0.1,0.2,0.1,0.4c0,0.2,0,0.3-0.1,0.4 c-0.1,0.1-0.1,0.2-0.2,0.3c-0.1,0.1-0.2,0.1-0.4,0.2c-0.1,0-0.3,0.1-0.4,0.1c-0.1,0-0.2,0-0.2,0c-0.1,0-0.2,0-0.2,0 c-0.1,0-0.1,0-0.2-0.1s-0.1,0-0.1-0.1v-0.3c0.1,0,0.1,0.1,0.2,0.1c0.1,0,0.1,0,0.2,0.1c0.1,0,0.1,0,0.2,0c0.1,0,0.1,0,0.2,0 c0.1,0,0.2,0,0.3,0c0.1,0,0.2,0,0.2-0.1c0.1,0,0.1-0.1,0.2-0.2c0-0.1,0.1-0.2,0.1-0.3c0-0.1,0-0.2-0.1-0.2c0-0.1-0.1-0.1-0.1-0.1 c-0.1,0-0.1-0.1-0.2-0.1c-0.1,0-0.2,0-0.2-0.1c-0.1,0-0.2-0.1-0.3-0.1c-0.1,0-0.2-0.1-0.3-0.1c-0.1-0.1-0.2-0.1-0.2-0.2 c-0.1-0.1-0.1-0.2-0.1-0.4c0-0.2,0-0.3,0.1-0.4c0.1-0.1,0.1-0.2,0.2-0.3s0.2-0.1,0.3-0.2c0.1,0,0.2-0.1,0.4-0.1c0.2,0,0.3,0,0.4,0 c0.1,0,0.3,0.1,0.4,0.1v0.3c-0.1-0.1-0.2-0.1-0.4-0.1c-0.1,0-0.3-0.1-0.4-0.1c-0.1,0-0.2,0-0.3,0c-0.1,0-0.1,0.1-0.2,0.1 c-0.1,0-0.1,0.1-0.1,0.2C89,73.7,88.9,73.8,88.9,73.9z"/>
                                    <path className="st5" d="M91.2,76.1l0-3h0.4l0,3H91.2z"/>
                                    <path className="st5" d="M94.3,74.9l-0.7,0v-0.3l1,0V76c0,0-0.1,0-0.1,0.1c-0.1,0-0.1,0-0.2,0c-0.1,0-0.2,0-0.2,0c-0.1,0-0.2,0-0.3,0 c-0.2,0-0.5,0-0.7-0.1c-0.2-0.1-0.3-0.2-0.5-0.3s-0.2-0.3-0.3-0.5c-0.1-0.2-0.1-0.4-0.1-0.6c0-0.2,0-0.5,0.1-0.7s0.2-0.4,0.3-0.5 c0.1-0.1,0.3-0.3,0.5-0.3c0.2-0.1,0.4-0.1,0.6-0.1c0.1,0,0.1,0,0.2,0c0.1,0,0.1,0,0.2,0c0.1,0,0.1,0,0.2,0c0,0,0.1,0,0.1,0v0.3 c-0.1,0-0.2-0.1-0.3-0.1c-0.1,0-0.2,0-0.3,0c-0.2,0-0.3,0-0.5,0.1c-0.1,0.1-0.3,0.1-0.4,0.2c-0.1,0.1-0.2,0.2-0.3,0.4 c-0.1,0.2-0.1,0.3-0.1,0.6c0,0.2,0,0.4,0.1,0.5c0.1,0.2,0.1,0.3,0.2,0.4c0.1,0.1,0.2,0.2,0.4,0.2s0.3,0.1,0.5,0.1 c0.1,0,0.2,0,0.2,0c0.1,0,0.2,0,0.2,0V74.9z"/>
                                    <path className="st5" d="M97,74.7c0.2,0.3,0.4,0.5,0.5,0.8h0c0-0.3,0-0.6,0-0.9l0-1.6h0.4l0,3h-0.4l-1.1-1.7c-0.2-0.3-0.4-0.6-0.5-0.8 h0c0,0.3,0,0.6,0,1v1.5h-0.4l0-3h0.3L97,74.7z"/>
                                </g>
                                <polygon className="st6" points="27.1,66.6 47.4,102.3 88.1,102.3 108.9,66.6 88.1,30.8 47.9,30.8"/>
                                <polygon className="st7" points="36.8,79.6 46.9,97 89,97 99.2,79.6"/>
                                <polygon className="st7" points="47.9,98.6 48.6,99.9 87.2,99.9 88.1,98.6"/>
                                <polygon className="st7" points="99.2,54.7 89.1,35.9 47,35.9 36.9,54.7"/>
                                <polygon className="st7" points="88.1,34.5 87.5,33.2 48.5,33.2 47.5,34.5"/>
                            </g>

                            <line className="st8" x1="297.6" y1="800.5" x2="297.6" y2="627.2"/>

                            {/* Images */}
                            <image href={isometricImage} x="20.5" y="124.8" width="554.2" height="470.7" preserveAspectRatio="xMidYMid meet" />
                            <image href={frontView} x="32.4" y="620.7" width="248.4" height="192.2" preserveAspectRatio="xMidYMid meet" />
                            <image href={sideView} x="314.5" y="620.7" width="248.1" height="192.2" preserveAspectRatio="xMidYMid meet" />

                            {/* Dimensions Layer */}
                            <g transform={`translate(${offsetX}, ${offsetY}) scale(${imgScale})`}>
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
                                            {/* Extension lines */}
                                            <line x1={dim.x1} y1={dim.y1} x2={ext1X2} y2={ext1Y2} stroke="black" strokeWidth="3" />
                                            <line x1={dim.x2} y1={dim.y2} x2={ext2X2} y2={ext2Y2} stroke="black" strokeWidth="3" />
                                            
                                            {/* Dimension line */}
                                            <line x1={dimX1} y1={dimY1} x2={dimX2} y2={dimY2} 
                                                  stroke="black" strokeWidth="3" 
                                                  markerStart="url(#exportArrowStart)" markerEnd="url(#exportArrowEnd)" />
                                            
                                            {/* Text Background */}
                                            <rect
                                                x={textX - dim.label.length * 12}
                                                y={textY - 20}
                                                width={dim.label.length * 24}
                                                height={40}
                                                fill="white"
                                            />
                                            {/* Text */}
                                            <text x={textX} y={textY + 10} fill="black" fontSize="32" fontWeight="bold" textAnchor="middle">
                                                {dim.label}
                                            </text>
                                        </g>
                                    );
                                })}
                            </g>

                            {/* TITLE */}
                            <foreignObject x="172.5" y="21.3" width="216.5" height="45.2">
                                <div
                                    style={{
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',      // 박스 수직 중앙
                                    justifyContent: 'flex-start',
                                    paddingLeft: 12,           // 왼쪽 여백
                                    boxSizing: 'border-box',
                                    }}
                                >
                                    <span
                                    style={{
                                        fontSize: 14,
                                        fontWeight: 700,
                                        color: '#000000',
                                        whiteSpace: 'nowrap',
                                    }}
                                    >
                                    {tempMetadata.title}
                                    </span>
                                </div>
                            </foreignObject>

                            {/* DATE */}
                            <foreignObject x="443.7" y="21.3" width="136.2" height="45.2">
                                <div
                                    style={{
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'flex-start',
                                    paddingLeft: 12,
                                    boxSizing: 'border-box',
                                    }}
                                >
                                    <span
                                    style={{
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: '#000000',
                                        whiteSpace: 'nowrap',
                                    }}
                                    >
                                    {tempMetadata.date}
                                    </span>
                                </div>
                            </foreignObject>

                            {/* NOTE */}
                            <foreignObject x="172.5" y="66.7" width="407.4" height="45.2">
                                <div
                                    style={{
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'flex-start',
                                    paddingLeft: 12,
                                    boxSizing: 'border-box',
                                    }}
                                >
                                    <span
                                    style={{
                                        fontSize: 10,
                                        color: '#000000',
                                        // 여러 줄 허용
                                        whiteSpace: 'normal',
                                        lineHeight: 1.4,
                                    }}
                                    >
                                    {tempMetadata.notes}
                                    </span>
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
