
import React, { useRef, useState, useEffect } from 'react';
import { t } from '../i18n';
import { UploadIcon } from './icons/UploadIcon';

interface HomeScreenProps {
  onFilesSelect: (files: File[]) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onFilesSelect }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true); 
  
  useEffect(() => {
      if (window.aistudio && window.aistudio.hasSelectedApiKey) {
          window.aistudio.hasSelectedApiKey().then(hasKey => {
              setHasApiKey(hasKey);
          });
      }
  }, []);

  const handleSelectKey = async () => {
      if (window.aistudio && window.aistudio.openSelectKey) {
          await window.aistudio.openSelectKey();
          setHasApiKey(true);
      }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const filesArray = Array.from(e.target.files);
        onFilesSelect(filesArray);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const filesArray = Array.from(e.dataTransfer.files).filter((file: File) => 
            file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/webp'
        );
        if (filesArray.length > 0) {
            onFilesSelect(filesArray);
        }
    }
  };

  return (
    <div className="h-full w-full bg-[#0D0D0D] flex flex-col relative font-sans">
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-2xl w-full text-center space-y-10">
            {/* 1. Main Branding - Changed to Heart Icon */}
            <div className="mb-4">
                <h1 className="text-6xl font-bold text-white">
                    ♥
                </h1>
            </div>

            {/* 2. API Key Section - Button Only, No Box/Text */}
            {!hasApiKey && window.aistudio && (
                <div className="flex justify-center mb-8">
                    <button 
                        onClick={handleSelectKey}
                        className="bg-blue-600 text-white hover:bg-blue-700 font-bold px-6 py-3 rounded-lg transition-colors"
                    >
                        API 키 선택하기
                    </button>
                </div>
            )}

            {/* Upload Area */}
            <div 
                className={`
                    border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all duration-300
                    ${isDragging ? 'border-white bg-white/5 scale-[1.02]' : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/30'}
                `}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept="image/png, image/jpeg, image/webp"
                    multiple
                />
                <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mb-6 shadow-2xl backdrop-blur-sm">
                    <UploadIcon />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                    이미지 업로드
                </h3>
                {/* 3. Updated Text */}
                <p className="text-gray-500 text-sm">
                    작업 할 가구의 최대한 많은 다각도 이미지 첨부
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};
