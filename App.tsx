
import React, { useState, useRef } from 'react';
import { EditorView } from './components/EditorView';
import { HomeScreen } from './components/HomeScreen';
import type { ImageVariation } from './types';

const App: React.FC = () => {
  // New state: Array of files for the new workflow
  const [filesToEdit, setFilesToEdit] = useState<File[] | null>(null);
  
  // Legacy support (optional, but keeping for interface consistency if needed internally, though we primarily use files now)
  const [imageToEdit, setImageToEdit] = useState<ImageVariation | null>(null);
  
  const handleFilesSelected = (files: File[]) => {
    if (files.length > 0) {
      setFilesToEdit(files);
    }
  };

  const handleReturnFromEditor = () => {
    setFilesToEdit(null);
    setImageToEdit(null);
  };

  return (
    <div className="h-screen bg-[#0D0D0D] text-gray-200 flex flex-col">
      <div className="flex-1 h-full overflow-hidden">
        {filesToEdit ? (
          <EditorView 
            uploadedFiles={filesToEdit}
            // Legacy prop - passing null or a dummy if strictly required by types, but we updated EditorView to take optional
            image={null as any} 
            onDone={handleReturnFromEditor} 
          />
        ) : (
          <HomeScreen 
            onFilesSelect={handleFilesSelected} // Changed prop name to reflect multiple
          />
        )}
      </div>
    </div>
  );
};

export default App;
