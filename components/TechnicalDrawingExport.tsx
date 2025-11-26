
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
            
            const scaleX = containerWidth / 2074;
            const scaleY = containerHeight / 2935;
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
            {/* 🎨 상단: 모드 버튼 */}
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
                {/* 🎨 좌측: 히스토리 */}
                <div className="w-28 bg-black/60 backdrop-blur-xl overflow-y-auto border-r border-white/10 p-2">
    <h4 className="text-white font-semibold mb-3 text-xs uppercase tracking-wider opacity-60">
        히스토리
    </h4>
    {imageHistory && imageHistory.length > 0 ? (
        <div className="flex flex-col gap-2">
            {imageHistory.map((item, idx) => (
                <div
                    key={item.id || idx}
                    onClick={() => onHistoryClick?.(item)}
                    className="group cursor-pointer rounded-lg overflow-hidden
                               bg-white/5 hover:bg-white/10 transition-all duration-300
                               border border-white/10 hover:border-white/20
                               hover:scale-105"
                >
                    <img 
                        src={item.imageUrl} 
                        alt={item.title || `이미지 ${idx + 1}`}
                        className="w-full h-auto"
                    />
                    <div className="p-1">
                        <span className="block text-[10px] text-gray-400 group-hover:text-white 
                                       truncate transition-colors">
                            {item.title || `이미지 ${idx + 1}`}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    ) : (
        <p className="text-gray-500 text-xs text-center mt-4">히스토리 없음</p>
    )}
</div>

                {/* 🎨 중앙: 도면 미리보기 */}
                <div className="flex-1 overflow-auto p-8 flex justify-center items-start bg-gradient-to-br from-black via-[#0A0A0B] to-black">
                    <div
                        ref={templateRef}
                        style={{
                            width: '2074px',
                            height: '2935px',
                            backgroundColor: 'white',
                            position: 'relative',
                            fontFamily: 'Arial, sans-serif',
                            boxShadow: '0 20px 60px rgba(59, 130, 246, 0.3), 0 0 100px rgba(0, 0, 0, 0.8)',
                            transform: `scale(${zoom})`,
                            transformOrigin: 'top center',
                            transition: 'transform 0.3s ease',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            boxSizing: 'border-box'
                        }}
                    >
                        {/* 헤더 Row 1: Logo, Title, Date */}
                        <div style={{ display: 'flex', height: '158px', borderBottom: '1px solid #e5e7eb', width: '2074px', boxSizing: 'border-box' }}>
                            {/* Logo: Fixed width 332px */}
                            <div style={{ width: '332px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)', boxSizing: 'border-box', flexShrink: 0 }}>
                                {/* Reduced size to 80px to fit better */}
                                <svg version="1.1" id="레이어_1" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 72 62.9" xmlSpace="preserve" style={{ width: '80px', height: 'auto' }}>
                                    <g>
                                        <path fill="#040000" d="M10.9,24.4c0-0.1,0.1-0.2,0.2-0.2c0.1-0.1,0.2-0.1,0.3-0.1l1.9,0c0.1,0,0.2,0,0.3,0.1c0.1,0.1,0.1,0.1,0.2,0.2
                                            l4,9.9c0,0.1,0,0.2,0,0.3c0,0.1-0.1-0.1-0.3,0.1l-2.4,0c-0.1,0-0.2,0-0.3-0.1c-0.1-0.1-0.2-0.1-0.2-0.2l-0.4-0.9
                                            c0-0.1-0.1-0.2-0.2-0.2c-0.1-0.1-0.2-0.1-0.3-0.1l-2.9,0c-0.1,0-0.2,0-0.3,0.1c-0.1,0.1-0.1,0.1-0.2,0.2L10,34.3
                                            c0,0.1-0.1,0.2-0.2,0.2c-0.1,0.1-0.2,0.1-0.3,0.1l-2.4,0c0,0-0.1,0-0.1,0c-0.1,0-0.1,0-0.1-0.1c0,0-0.1-0.1-0.1-0.1
                                            c0-0.1,0-0.1,0-0.2L10.9,24.4z M11.7,30.7l1.2,0c0.1,0,0.2,0,0.2-0.1c0-0.1,0-0.1,0-0.2c-0.1-0.2-0.2-0.5-0.3-0.8
                                            c-0.1-0.3-0.2-0.6-0.4-0.9c0-0.1-0.1-0.1-0.1-0.1c0,0-0.1,0-0.1,0.1l-0.7,1.8c0,0.1,0,0.2,0,0.2C11.5,30.6,11.6,30.7,11.7,30.7z"/>
                                        <path fill="#040000" d="M22.6,31.8l-1.2,0c-0.1,0-0.2,0-0.2,0.1S21,32,21,32.1l0,2.2c0,0.1,0,0.2-0.1,0.2c-0.1,0.1-0.1,0.1-0.2,0.1
                                            l-2.1,0c-0.1,0-0.2,0-0.2-0.1c-0.1-0.1-0.1-0.1-0.1-0.2l0-9.9c0-0.1,0-0.2,0.1-0.2c0.1-0.1,0.1-0.1,0.2-0.1l4.2,0
                                            c0.5,0,1,0.1,1.5,0.3s0.8,0.5,1.2,0.8c0.3,0.4,0.6,0.8,0.8,1.2c0.2,0.5,0.3,1,0.3,1.5c0,0.5-0.1,1-0.2,1.5
                                            c-0.2,0.5-0.4,0.9-0.8,1.2c-0.3,0.3-0.8,0.6-1.3,0.8C23.8,31.7,23.2,31.8,22.6,31.8z M22.7,26.7l-1.3,0c-0.1,0-0.2,0-0.2,0.1
                                            C21.1,26.9,21,26.9,21,27l0,1.7c0,0.1,0,0.2,0.1,0.2c0.1,0.1,0.1,0.1,0.2,0.1l1.5,0c0.4,0,0.6-0.1,0.8-0.4c0.2-0.2,0.2-0.5,0.2-0.8
                                            c0-0.2,0-0.3-0.1-0.5c-0.1-0.1-0.1-0.3-0.2-0.4c-0.1-0.1-0.2-0.2-0.4-0.3C23,26.7,22.9,26.7,22.7,26.7z"/>
                                        <path fill="#040000" d="M31.5,31.8l-1.2,0c-0.1,0-0.2,0-0.2,0.1S30,32,30,32.1l0,2.2c0,0.1,0,0.2-0.1,0.2c-0.1,0.1-0.1,0.1-0.2,0.1
                                            l-2.1,0c-0.1,0-0.2,0-0.2-0.1c-0.1-0.1-0.1-0.1-0.1-0.2l0-9.9c0-0.1,0-0.2,0.1-0.2c0.1-0.1,0.1-0.1,0.2-0.1l4.2,0
                                            c0.5,0,1,0.1,1.5,0.3c0.5,0.2,0.8,0.5,1.2,0.8s0.6,0.8,0.8,1.2c0.2,0.5,0.3,1,0.3,1.5c0,0.5-0.1,1-0.2,1.5
                                            c-0.2,0.5-0.4,0.9-0.8,1.2c-0.3,0.3-0.8,0.6-1.3,0.8C32.8,31.7,32.2,31.8,31.5,31.8z M31.6,26.7l-1.3,0c-0.1,0-0.2,0-0.2,0.1
                                            C30,26.9,30,26.9,30,27l0,1.7c0,0.1,0,0.2,0.1,0.2c0.1,0.1,0.1,0.1,0.2,0.1l1.5,0c0.4,0,0.6-0.1,0.8-0.4c0.2-0.2,0.2-0.5,0.2-0.8
                                            c0-0.2,0-0.3-0.1-0.5c-0.1-0.1-0.1-0.3-0.2-0.4s-0.2-0.2-0.4-0.3C32,26.7,31.8,26.7,31.6,26.7z"/>
                                        <path fill="#040000" d="M38.9,27v0.6c0,0.1,0,0.2,0.1,0.2c0.1,0.1,0.1,0.1,0.2,0.1l3.7,0c0.1,0,0.2,0,0.2,0.1c0.1,0.1,0.1,0.1,0.1,0.2
                                            v2c0,0.1,0,0.2-0.1,0.2c-0.1,0.1-0.1,0.1-0.2,0.1l-3.7,0c-0.1,0-0.2,0-0.2,0.1c-0.1,0.1-0.1,0.2-0.1,0.2v0.6c0,0.1,0,0.2,0.1,0.2
                                            c0.1,0.1,0.1,0.1,0.2,0.1l4.3,0c0.1,0,0.2,0,0.2,0.1c0.1,0.1,0.1,0.2,0.1,0.2l0,2c0,0.1,0,0.2-0.1,0.2s-0.1,0.1-0.2,0.1l-7,0
                                            c-0.1,0-0.2,0-0.2-0.1s-0.1-0.1-0.1-0.2l0-9.9c0-0.1,0-0.2,0.1-0.2c0.1-0.1,0.1-0.1,0.2-0.1l7,0c0.1,0,0.2,0,0.2,0.1
                                            c0.1,0.1,0.1,0.2,0.1,0.2l0,2c0,0.1,0,0.2-0.1,0.2c-0.1,0.1-0.1,0.1-0.2,0.1l-4.3,0c-0.1,0-0.2,0-0.2,0.1
                                            C38.9,26.9,38.9,26.9,38.9,27z"/>
                                        <path fill="#040000" d="M54.1,24.4l0,9.9c0,0.1,0,0.2-0.1,0.2s-0.1,0.1-0.2,0.1l-2,0c-0.1,0-0.2,0-0.3-0.1c-0.1-0.1-0.2-0.1-0.2-0.2
                                            L47.6,29c-0.1-0.1-0.1-0.1-0.2-0.1c-0.1,0-0.1,0.1-0.1,0.2l0,5.2c0,0.1,0,0.2-0.1,0.2s-0.1,0.1-0.2,0.1l-2.1,0
                                            c-0.1,0-0.2,0-0.2-0.1s-0.1-0.1-0.1-0.2l0-9.9c0-0.1,0-0.2,0.1-0.2C44.8,24,44.9,24,45,24l2.1,0c0.1,0,0.2,0,0.3,0.1
                                            c0.1,0.1,0.2,0.1,0.2,0.2l3.6,5.3c0.1,0.1,0.1,0.1,0.2,0.1s0.1-0.1,0.1-0.2l0-5.2c0-0.1,0-0.2,0.1-0.2c0.1-0.1,0.1-0.1,0.2-0.1l2,0
                                            c0.1,0,0.2,0,0.2,0.1C54.1,24.2,54.1,24.3,54.1,24.4z"/>
                                        <path fill="#040000" d="M63.1,34.6l-7.8,0c-0.1,0-0.2,0-0.2-0.1S55,34.4,55,34.3l0-1.6c0-0.1,0-0.2,0.1-0.3c0-0.1,0.1-0.2,0.2-0.3
                                            l4.2-5c0.1-0.1,0.1-0.2,0.1-0.2c0-0.1-0.1-0.1-0.2-0.1l-4,0c-0.1,0-0.2,0-0.2-0.1S55,26.5,55,26.4l0-2c0-0.1,0-0.2,0.1-0.2
                                            s0.1-0.1,0.2-0.1l7.8,0c0.1,0,0.2,0,0.2,0.1c0.1,0.1,0.1,0.2,0.1,0.2l0,1.6c0,0.1,0,0.2-0.1,0.3c0,0.1-0.1,0.2-0.1,0.3l-4.2,5
                                            C59,31.7,59,31.7,59,31.8c0,0.1,0.1,0.1,0.2,0.1l4,0c0.1,0,0.2,0,0.2,0.1c0.1,0.1,0.1,0.1,0.1,0.2l0,2c0,0.1,0,0.2-0.1,0.2
                                            S63.2,34.6,63.1,34.6z"/>
                                    </g>
                                    <g>
                                        <path fill="#040000" d="M10.5,39.7h-0.3l0-2.6l1.5,0v0.3l-1.2,0l0,0.8l1,0v0.3l-1,0L10.5,39.7z"/>
                                        <path fill="#040000" d="M13.2,39.4c0.1,0,0.2,0,0.2,0s0.1-0.1,0.2-0.1s0.1-0.1,0.1-0.1s0.1-0.1,0.1-0.2c0,0,0-0.1,0-0.1
                                            c0-0.1,0-0.1,0-0.2l0-1.6h0.3l0,1.6c0,0.1,0,0.1,0,0.2s0,0.1,0,0.2c0,0.1-0.1,0.2-0.1,0.3c0,0.1-0.1,0.2-0.2,0.2
                                            c-0.1,0.1-0.2,0.1-0.3,0.1c-0.1,0-0.2,0.1-0.4,0.1c-0.1,0-0.3,0-0.4,0c-0.1,0-0.2-0.1-0.3-0.1s-0.1-0.1-0.2-0.2
                                            c0-0.1-0.1-0.2-0.1-0.2c0-0.1,0-0.1,0-0.2c0-0.1,0-0.1,0-0.2l0-1.6h0.3l0,1.6c0,0.1,0,0.1,0,0.2c0,0.1,0,0.1,0,0.2
                                            c0,0.1,0.1,0.2,0.2,0.3C12.9,39.4,13,39.4,13.2,39.4z"/>
                                        <path fill="#040000" d="M15.2,38.6l0,1.1h-0.3l0-2.6h0.6c0.1,0,0.2,0,0.3,0c0.1,0,0.1,0,0.2,0c0.2,0,0.3,0.1,0.4,0.3s0.1,0.3,0.1,0.4
                                            c0,0.1,0,0.2,0,0.3c0,0.1-0.1,0.2-0.1,0.2c-0.1,0.1-0.1,0.1-0.2,0.2s-0.2,0.1-0.3,0.1v0l0.7,1.1h-0.3l-0.8-1.1H15.2z M15.2,37.4
                                            l0,1h0.3c0.1,0,0.2,0,0.2,0c0.1,0,0.1,0,0.2,0c0.1,0,0.2-0.1,0.2-0.2s0.1-0.2,0.1-0.3c0-0.1,0-0.2-0.1-0.3s-0.1-0.1-0.2-0.1
                                            c0,0-0.1,0-0.2,0s-0.1,0-0.2,0H15.2z"/>
                                        <path fill="#040000" d="M18.5,38.5c0.2,0.2,0.3,0.5,0.5,0.7h0c0-0.3,0-0.5,0-0.8l0-1.4h0.3l0,2.6h-0.3l-1-1.5
                                            c-0.2-0.3-0.3-0.5-0.5-0.7h0c0,0.2,0,0.5,0,0.8l0,1.3h-0.3l0-2.6h0.3L18.5,38.5z"/>
                                        <path fill="#040000" d="M20,39.7l0-2.6h0.3l0,2.6H20z"/>
                                        <path fill="#040000" d="M21.9,39.7h-0.3l0-2.3h-0.8v-0.3h2v0.3h-0.8L21.9,39.7z"/>
                                        <path fill="#040000" d="M24.2,39.4c0.1,0,0.2,0,0.2,0s0.1-0.1,0.2-0.1s0.1-0.1,0.1-0.1s0.1-0.1,0.1-0.2c0,0,0-0.1,0-0.1
                                            c0-0.1,0-0.1,0-0.2l0-1.6h0.3l0,1.6c0,0.1,0,0.1,0,0.2s0,0.1,0,0.2c0,0.1-0.1,0.2-0.1,0.3c0,0.1-0.1,0.2-0.2,0.2
                                            c-0.1,0.1-0.2,0.1-0.3,0.1c-0.1,0-0.2,0.1-0.4,0.1c-0.1,0-0.3,0-0.4,0c-0.1,0-0.2-0.1-0.3-0.1s-0.1-0.1-0.2-0.2
                                            c0-0.1-0.1-0.2-0.1-0.2c0-0.1,0-0.1,0-0.2c0-0.1,0-0.1,0-0.2l0-1.6h0.3l0,1.6c0,0.1,0,0.1,0,0.2c0,0.1,0,0.1,0,0.2
                                            c0,0.1,0.1,0.2,0.2,0.3C23.9,39.4,24.1,39.4,24.2,39.4z"/>
                                        <path fill="#040000" d="M26.2,38.6l0,1.1h-0.3l0-2.6h0.6c0.1,0,0.2,0,0.3,0c0.1,0,0.1,0,0.2,0c0.2,0,0.3,0.1,0.4,0.3s0.1,0.3,0.1,0.4
                                            c0,0.1,0,0.2,0,0.3c0,0.1-0.1,0.2-0.1,0.2c-0.1,0.1-0.1,0.1-0.2,0.2s-0.2,0.1-0.3,0.1v0l0.7,1.1h-0.3l-0.8-1.1H26.2z M26.2,37.3
                                            l0,1h0.3c0.1,0,0.2,0,0.2,0c0.1,0,0.1,0,0.2,0c0.1,0,0.2-0.1,0.2-0.2s0.1-0.2,0.1-0.3c0-0.1,0-0.2-0.1-0.3s-0.1-0.1-0.2-0.1
                                            c0,0-0.1,0-0.2,0s-0.1,0-0.2,0H26.2z"/>
                                        <path fill="#040000" d="M28.6,39.4h1.3v0.3h-1.6l0-2.6h1.5v0.3h-1.2l0,0.8h1.1v0.3h-1.1L28.6,39.4z"/>
                                        <path fill="#040000" d="M31.4,39.7l0-2.6h0.3l0,2.6H31.4z"/>
                                        <path fill="#040000" d="M33.8,38.5c0.2,0.2,0.3,0.5,0.5,0.7h0c0-0.3,0-0.5,0-0.8l0-1.4h0.3l0,2.6h-0.3l-1-1.5
                                            c-0.2-0.3-0.3-0.5-0.5-0.7h0c0,0.2,0,0.5,0,0.8l0,1.3h-0.3l0-2.6h0.3L33.8,38.5z"/>
                                        <path fill="#040000" d="M36.1,39.7h-0.3l0-2.3H35v-0.3h2v0.3h-0.8L36.1,39.7z"/>
                                        <path fill="#040000" d="M37.8,39.4h1.3v0.3h-1.6l0-2.6H39v0.3h-1.2l0,0.8h1.1v0.3h-1.1V39.4z"/>
                                        <path fill="#040000" d="M40,38.6v1.1h-0.3l0-2.6h0.6c0.1,0,0.2,0,0.3,0s0.1,0,0.2,0c0.2,0,0.3,0.1,0.4,0.3c0.1,0.1,0.1,0.3,0.1,0.4
                                            c0,0.1,0,0.2,0,0.3c0,0.1-0.1,0.2-0.1,0.2c-0.1,0.1-0.1,0.1-0.2,0.2c-0.1,0-0.2,0.1-0.3,0.1v0l0.7,1.1h-0.3l-0.8-1.1H40z M40,37.3
                                            l0,1h0.3c0.1,0,0.2,0,0.2,0c0.1,0,0.1,0,0.2,0c0.1,0,0.2-0.1,0.2-0.2s0.1-0.2,0.1-0.3c0-0.1,0-0.2-0.1-0.3
                                            c-0.1-0.1-0.1-0.1-0.2-0.1c0,0-0.1,0-0.2,0c-0.1,0-0.1,0-0.2,0H40z"/>
                                        <path fill="#040000" d="M42.1,39.7l0-2.6h0.3l0,2.6H42.1z"/>
                                        <path fill="#040000" d="M45.3,38.4c0,0.2,0,0.4-0.1,0.5c-0.1,0.2-0.1,0.3-0.2,0.4s-0.2,0.2-0.4,0.3s-0.3,0.1-0.5,0.1
                                            c-0.2,0-0.3,0-0.5-0.1s-0.3-0.2-0.4-0.3s-0.2-0.3-0.2-0.4S43,38.6,43,38.4c0-0.2,0-0.4,0.1-0.5s0.1-0.3,0.2-0.4
                                            c0.1-0.1,0.2-0.2,0.4-0.3C43.8,37,44,37,44.2,37c0.2,0,0.3,0,0.5,0.1c0.1,0.1,0.3,0.2,0.4,0.3s0.2,0.3,0.2,0.4S45.3,38.2,45.3,38.4
                                            z M45,38.4c0-0.2,0-0.3-0.1-0.5c0-0.1-0.1-0.2-0.2-0.3c-0.1-0.1-0.2-0.2-0.3-0.2c-0.1,0-0.2-0.1-0.3-0.1c-0.1,0-0.2,0-0.3,0.1
                                            s-0.2,0.1-0.3,0.2s-0.1,0.2-0.2,0.3s-0.1,0.3-0.1,0.5s0,0.3,0.1,0.5s0.1,0.2,0.2,0.3c0.1,0.1,0.2,0.2,0.3,0.2s0.2,0.1,0.3,0.1
                                            c0.1,0,0.2,0,0.3-0.1c0.1,0,0.2-0.1,0.3-0.2s0.1-0.2,0.2-0.3C45,38.7,45,38.5,45,38.4z"/>
                                        <path fill="#040000" d="M46.1,38.6v1.1h-0.3l0-2.6h0.6c0.1,0,0.2,0,0.3,0s0.1,0,0.2,0c0.2,0,0.3,0.1,0.4,0.3c0.1,0.1,0.1,0.3,0.1,0.4
                                            c0,0.1,0,0.2,0,0.3s-0.1,0.2-0.1,0.2c-0.1,0.1-0.1,0.1-0.2,0.2c-0.1,0-0.2,0.1-0.3,0.1v0l0.7,1.1h-0.3l-0.8-1.1H46.1z M46.1,37.3
                                            l0,1h0.3c0.1,0,0.2,0,0.2,0s0.1,0,0.2,0c0.1,0,0.2-0.1,0.2-0.2s0.1-0.2,0.1-0.3c0-0.1,0-0.2-0.1-0.3c-0.1-0.1-0.1-0.1-0.2-0.1
                                            c0,0-0.1,0-0.2,0c-0.1,0-0.1,0-0.2,0H46.1z"/>
                                        <path fill="#040000" d="M50.9,38.3c0,0.2,0,0.3-0.1,0.4c0,0.1-0.1,0.3-0.2,0.4s-0.2,0.2-0.3,0.3s-0.2,0.1-0.4,0.2
                                            c-0.1,0-0.2,0-0.3,0.1s-0.2,0-0.3,0h-0.6l0-2.6h0.6c0.1,0,0.2,0,0.3,0c0.1,0,0.2,0,0.3,0.1c0.1,0,0.3,0.1,0.4,0.2
                                            c0.1,0.1,0.2,0.2,0.3,0.3c0.1,0.1,0.1,0.2,0.2,0.4C50.9,38.1,50.9,38.2,50.9,38.3z M50.6,38.3c0-0.3-0.1-0.5-0.2-0.6
                                            s-0.3-0.3-0.5-0.3c-0.1,0-0.2,0-0.3-0.1s-0.2,0-0.3,0h-0.2l0,2h0.2c0.1,0,0.2,0,0.3,0s0.2,0,0.3-0.1c0.2-0.1,0.3-0.2,0.5-0.3
                                            S50.6,38.6,50.6,38.3z"/>
                                        <path fill="#040000" d="M51.9,39.4h1.3v0.3h-1.6l0-2.6h1.5v0.3h-1.2l0,0.8H53v0.3h-1.1V39.4z"/>
                                        <path fill="#040000" d="M54,37.7c0,0.1,0,0.1,0,0.2c0,0,0.1,0.1,0.1,0.1c0,0,0.1,0.1,0.2,0.1c0.1,0,0.1,0,0.2,0.1
                                            c0.1,0,0.2,0.1,0.3,0.1c0.1,0,0.2,0.1,0.2,0.1c0.1,0.1,0.1,0.1,0.2,0.2s0.1,0.2,0.1,0.3c0,0.1,0,0.3-0.1,0.4s-0.1,0.2-0.2,0.2
                                            s-0.2,0.1-0.3,0.1s-0.2,0-0.4,0c-0.1,0-0.1,0-0.2,0c-0.1,0-0.1,0-0.2,0s-0.1,0-0.2,0s-0.1,0-0.1-0.1v-0.3c0,0,0.1,0,0.2,0.1
                                            s0.1,0,0.2,0s0.1,0,0.2,0s0.1,0,0.2,0c0.1,0,0.2,0,0.2,0c0.1,0,0.1,0,0.2-0.1c0.1,0,0.1-0.1,0.1-0.1c0-0.1,0.1-0.1,0.1-0.2
                                            c0-0.1,0-0.1,0-0.2s-0.1-0.1-0.1-0.1s-0.1-0.1-0.2-0.1c-0.1,0-0.1,0-0.2-0.1c-0.1,0-0.2,0-0.3-0.1S54,38.3,54,38.3
                                            s-0.1-0.1-0.2-0.2s-0.1-0.2-0.1-0.3c0-0.1,0-0.2,0.1-0.3c0-0.1,0.1-0.2,0.2-0.2s0.2-0.1,0.3-0.1s0.2,0,0.3,0c0.1,0,0.3,0,0.4,0
                                            s0.2,0.1,0.3,0.1v0.3c-0.1,0-0.2-0.1-0.3-0.1s-0.2,0-0.4,0c-0.1,0-0.2,0-0.2,0s-0.1,0.1-0.2,0.1s-0.1,0.1-0.1,0.1S54,37.7,54,37.7z
                                            "/>
                                        <path fill="#040000" d="M56,39.7l0-2.6h0.3l0,2.6H56z"/>
                                        <path fill="#040000" d="M58.7,38.6l-0.6,0v-0.3l0.9,0v1.3c0,0-0.1,0-0.1,0.1,0c0,0-0.1,0-0.2,0c-0.1,0-0.1,0-0.2,0c-0.1,0-0.1,0-0.2,0
                                            c-0.2,0-0.4,0-0.6-0.1c-0.2-0.1-0.3-0.1-0.4-0.3S57.1,39.1,57,39C57,38.8,57,38.6,57,38.4c0-0.2,0-0.4,0.1-0.6s0.2-0.3,0.3-0.4
                                            c0.1-0.1,0.3-0.2,0.4-0.3c0.2-0.1,0.4-0.1,0.6-0.1c0.1,0,0.1,0,0.2,0c0.1,0,0.1,0,0.2,0c0,0,0.1,0,0.1,0s0.1,0,0.1,0v0.3
                                            c-0.1,0-0.2,0-0.3-0.1s-0.2,0-0.3,0c-0.1,0-0.3,0-0.4,0.1s-0.2,0.1-0.3,0.2s-0.2,0.2-0.2,0.3c-0.1,0.1-0.1,0.3-0.1,0.5
                                            c0,0.2,0,0.3,0.1,0.5c0,0.1,0.1,0.2,0.2,0.3c0.1,0.1,0.2,0.1,0.3,0.2s0.3,0.1,0.4,0.1c0.1,0,0.1,0,0.2,0s0.1,0,0.2,0V38.6z"/>
                                        <path fill="#040000" d="M61,38.5c0.2,0.2,0.3,0.5,0.5,0.7h0c0-0.3,0-0.5,0-0.8l0-1.4h0.3l0,2.6h-0.3l-1-1.5c-0.2-0.3-0.3-0.5-0.5-0.7
                                            h0c0,0.2,0,0.5,0,0.8v1.3h-0.3l0-2.6H60L61,38.5z"/>
                                    </g>
                                    <polygon fill="none" stroke="#000000" strokeWidth="1.3" strokeMiterlimit="10" points="0.7,31.4 18.2,62.2 53.3,62.2 71.3,31.4 53.3,0.6 18.6,0.6 "/>
                                    <polygon fill="#7F7669" points="9.1,42.7 17.8,57.7 54.1,57.7 62.9,42.7 "/>
                                    <polygon fill="#7F7669" points="18.7,59 19.3,60.2 52.6,60.2 53.3,59 "/>
                                    <polygon fill="#7F7669" points="62.9,21.2 54.2,5 17.9,5 9.1,21.2 "/>
                                    <polygon fill="#7F7669" points="53.3,3.8 52.8,2.7 19.1,2.7 18.3,3.8 "/>
                                </svg>
                            </div>
                            {/* Title Section */}
                            <div style={{ width: '1153px', display: 'flex', borderRight: '1px solid #e5e7eb', boxSizing: 'border-box', flexShrink: 0 }}>
                                <div style={{ width: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)', borderRight: '1px solid #e5e7eb', boxSizing: 'border-box', flexShrink: 0 }}>
                                    <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#374151', letterSpacing: '0.5px' }}>TITLE</span>
                                </div>
                                <div style={{ width: '952px', display: 'flex', alignItems: 'center', paddingLeft: '20px', paddingRight: '20px', backgroundColor: '#ffffff', boxSizing: 'border-box', flexShrink: 0 }}>
                                    <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#111827' }}>{tempMetadata.title}</span>
                                </div>
                            </div>
                            {/* Date Section */}
                            <div style={{ width: '589px', display: 'flex', boxSizing: 'border-box', flexShrink: 0 }}>
                                <div style={{ width: '115px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)', borderRight: '1px solid #e5e7eb', boxSizing: 'border-box', flexShrink: 0 }}>
                                    <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#374151', letterSpacing: '0.5px' }}>DATE</span>
                                </div>
                                <div style={{ width: '474px', display: 'flex', alignItems: 'center', paddingLeft: '20px', paddingRight: '20px', backgroundColor: '#ffffff', boxSizing: 'border-box', flexShrink: 0 }}>
                                    <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#111827' }}>{tempMetadata.date}</span>
                                </div>
                            </div>
                        </div>

                        {/* 헤더 Row 2: Notes */}
                        <div style={{ display: 'flex', height: '174px', borderBottom: '2px solid #374151', width: '2074px', boxSizing: 'border-box' }}>
                            <div style={{ width: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)', borderRight: '1px solid #e5e7eb', boxSizing: 'border-box', flexShrink: 0 }}>
                                <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#374151', letterSpacing: '0.5px' }}>NOTE</span>
                            </div>
                            <div style={{ width: '1954px', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: '20px', paddingRight: '20px', backgroundColor: '#fafafa', boxSizing: 'border-box', flexShrink: 0 }}>
                                <span style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6' }}>{tempMetadata.notes}</span>
                                <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px', fontWeight: '600' }}>TOLERANCE ±2MM</span>
                            </div>
                        </div>

                        {/* 메인 Content: Isometric + Views */}
                        <div style={{ display: 'flex', height: '2603px', width: '2074px', boxSizing: 'border-box' }}>
                            {/* Left Column: Isometric View */}
                            <div style={{ width: '1384px', height: '100%', borderRight: '2px solid #374151', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '50px', backgroundColor: '#ffffff', boxSizing: 'border-box', flexShrink: 0 }}>
                                <img src={`data:image/png;base64,${isometricImage}`} alt="Isometric view" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain' }} />
                                
                                {/* SVG Overlay for Dimensions */}
                                <svg 
                                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                                    viewBox="0 0 1974 1711" 
                                    preserveAspectRatio="xMidYMid meet"
                                >
                                    <defs>
                                        <marker id="arrowStart" markerWidth="24" markerHeight="24" refX="0" refY="12" orient="auto">
                                            <polygon points="24 0, 0 12, 24 24" fill="#1f2937" />
                                        </marker>
                                        <marker id="arrowEnd" markerWidth="24" markerHeight="24" refX="24" refY="12" orient="auto">
                                            <polygon points="0 0, 24 12, 0 24" fill="#1f2937" />
                                        </marker>
                                    </defs>
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
                                        const extLen = 30;
                                        const ext1X2 = dim.x1 + normalX * (Math.abs(dim.offset) + extLen) * extDirection;
                                        const ext1Y2 = dim.y1 + normalY * (Math.abs(dim.offset) + extLen) * extDirection;
                                        const ext2X2 = dim.x2 + normalX * (Math.abs(dim.offset) + extLen) * extDirection;
                                        const ext2Y2 = dim.y2 + normalY * (Math.abs(dim.offset) + extLen) * extDirection;
                                        const textX = (dimX1 + dimX2) / 2;
                                        const textY = (dimY1 + dimY2) / 2;
                                        return (
                                            <g key={dim.id}>
                                                <line x1={dim.x1} y1={dim.y1} x2={ext1X2} y2={ext1Y2} stroke="#1f2937" strokeWidth="4.5" />
                                                <line x1={dim.x2} y1={dim.y2} x2={ext2X2} y2={ext2Y2} stroke="#1f2937" strokeWidth="4.5" />
                                                <line x1={dimX1} y1={dimY1} x2={dimX2} y2={dimY2} stroke="#1f2937" strokeWidth="4.5" markerStart="url(#arrowStart)" markerEnd="url(#arrowEnd)" />
                                                <rect x={textX - dim.label.length * 8} y={textY - 18} width={dim.label.length * 16} height={36} fill="white" stroke="#1f2937" strokeWidth="2" rx="4" />
                                                <text x={textX} y={textY + 8} fill="#1f2937" fontSize="26" fontWeight="bold" textAnchor="middle">{dim.label}</text>
                                            </g>
                                        );
                                    })}
                                </svg>
                            </div>
                            {/* Right Column: Views */}
                            <div style={{ width: '690px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', flexShrink: 0 }}>
                                <div style={{ height: '50%', borderBottom: '2px solid #374151', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', position: 'relative', backgroundColor: '#fafafa', boxSizing: 'border-box' }}>
                                    <div style={{ position: 'absolute', top: '20px', left: '30px', fontSize: '14px', fontWeight: 'bold', color: '#6b7280', letterSpacing: '1px' }}>FRONT VIEW</div>
                                    <img src={`data:image/png;base64,${frontView}`} alt="Front view" style={{ maxWidth: '90%', maxHeight: '85%', objectFit: 'contain' }} />
                                </div>
                                <div style={{ height: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', position: 'relative', backgroundColor: '#fafafa', boxSizing: 'border-box' }}>
                                    <div style={{ position: 'absolute', top: '20px', left: '30px', fontSize: '14px', fontWeight: 'bold', color: '#6b7280', letterSpacing: '1px' }}>SIDE VIEW</div>
                                    <img src={`data:image/png;base64,${sideView}`} alt="Side view" style={{ maxWidth: '90%', maxHeight: '85%', objectFit: 'contain' }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 🎨 하단: Zoom + 텍스트 3개 + 저장 */}
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
