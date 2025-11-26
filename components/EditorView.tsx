
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ImageVariation, ApiObject, DetectedObject, BoundingBox } from '../types';
import { segmentObjectsInImage, editImageWithMask, generateRepositionPrompt, applyRepositionEdit, generateFrontViewFromUploads, generateIsometricViews, editImageWithSketch, generateBlueprintStyle, refineBlueprintDimensions, generate3DIsometric, generateOrthographicViews } from '../services/geminiService';
import { t } from '../i18n';
import { ObjectLayer } from './ObjectLayer';
import { ObjectLayerSkeleton } from './ObjectLayerSkeleton';
import { Spinner } from './Spinner';
import { InteractiveBoundingBox } from './InteractiveBoundingBox';
import { cropImage, createMaskFromBox, createCombinedMask, compositeOntoCanvas } from '../utils/imageUtils';
import { StaticBoundingBox } from './StaticBoundingBox';
import { EditorVariationSelector } from './EditorVariationSelector';
import { CanvasSketchLayer, CanvasSketchLayerRef } from './CanvasSketchLayer';
import { DimensioningLayer } from './DimensioningLayer';
import { CheckIcon } from './icons/CheckIcon';
import { TechnicalDrawingExport } from './TechnicalDrawingExport';
import { UploadIcon } from './icons/UploadIcon';

// Icons for Sketch Tools
const PenIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>;
const EraserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20H7L3 16C2 15 2 13 3 12L13 2L22 11L20 20Z"></path><path d="M17 17L7 7"></path></svg>;
const ArrowIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>;

interface EditorViewProps {
  image?: ImageVariation; 
  uploadedFiles?: File[]; 
  onDone: (newImage?: ImageVariation) => void;
}

type EditorMode = 'UPLOAD' | 'OBJECT' | 'SKETCH' | 'BLUEPRINT' | 'FINAL';
type ViewPhase = 'INITIALIZING' | 'EDITING' | 'GENERATING_VIEWS' | 'SHOWCASE';

const findObjectById = (nodes: DetectedObject[], id: string): DetectedObject | null => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findObjectById(node.children, id);
    if (found) return found;
  }
  return null;
};

const getAllChildObjects = (object: DetectedObject): DetectedObject[] => {
    let children = [...object.children];
    object.children.forEach(child => {
        children = [...children, ...getAllChildObjects(child)];
    });
    return children;
};

const getAllObjects = (nodes: DetectedObject[]): DetectedObject[] => {
    let flat: DetectedObject[] = [];
    for (const node of nodes) {
        flat.push(node);
        if (node.children && node.children.length > 0) {
            flat = flat.concat(getAllObjects(node.children));
        }
    }
    return flat;
};

// Section Heights
const TOP_SECTION_HEIGHT = '70px';
const BOTTOM_SECTION_HEIGHT = '70px';

export const EditorView: React.FC<EditorViewProps> = ({ image: initialImage, uploadedFiles, onDone }) => {
  const [viewPhase, setViewPhase] = useState<ViewPhase>(uploadedFiles ? 'INITIALIZING' : 'EDITING');
  const [mode, setMode] = useState<EditorMode>('OBJECT');
  
  const [currentImage, setCurrentImage] = useState<ImageVariation | null>(initialImage || null);
  const [blueprintImage, setBlueprintImage] = useState<string | null>(null); 
  
  // Technical Export State
  const [isometricImage, setIsometricImage] = useState<string | null>(null);
  const [orthographicViews, setOrthographicViews] = useState<{front: string, side: string} | null>(null);
  const [showTechnicalExport, setShowTechnicalExport] = useState(false);
  const [exportDimensions, setExportDimensions] = useState<{id: string, x1: number, y1: number, x2: number, y2: number, offset: number, label: string}[]>([]);
  const [metadata, setMetadata] = useState({
      title: 'FURNITURE ASSEMBLY',
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase(),
      notes: 'ALL DIMENSIONS IN MM'
  });

  // Zoom Controls State
  const [zoom, setZoom] = useState(1);
  const [fitToScreen, setFitToScreen] = useState(true);

  // HISTORY STATE
  const [imageHistory, setImageHistory] = useState<ImageVariation[]>([]);

  const [objects, setObjects] = useState<DetectedObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); 
  const [error, setError] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState({ width: 1, height: 1 });
  const [prompt, setPrompt] = useState('');
  
  const [expandedObjectIds, setExpandedObjectIds] = useState<Set<string>>(new Set());
  
  const [modifiedBoxes, setModifiedBoxes] = useState<Record<string, BoundingBox>>({});
  const [duplicatedObjectIds, setDuplicatedObjectIds] = useState<Set<string>>(new Set());

  const [interactiveBox, setInteractiveBox] = useState<{x:number, y:number, width:number, height:number} | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const sketchLayerRef = useRef<CanvasSketchLayerRef>(null);
  const [imageLayout, setImageLayout] = useState({ top: 0, left: 0, width: 1, height: 1 });
  
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'generating' | 'analyzing'>('idle');
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [variationsToSelect, setVariationsToSelect] = useState<ImageVariation[] | null>(null);
  const [isGeneratingOrtho, setIsGeneratingOrtho] = useState(false);

  // SKETCH TOOLS STATE
  const [sketchTool, setSketchTool] = useState<'pen' | 'line' | 'rect' | 'eraser' | 'arrow'>('pen');
  const [sketchColor, setSketchColor] = useState('#FF0000');
  const [sketchWidth, setSketchWidth] = useState(5);

  // BLUEPRINT TOOLS STATE
  const [blueprintTool, setBlueprintTool] = useState<'draw' | 'select'>('draw');

  const COLORS = ['#FF0000', '#000000', '#FFFFFF', '#0000FF', '#00FF00', '#FFFF00', '#FFA500', '#800080'];

  // MODE BUTTONS configuration
  const modeButtons = [
      { key: 'upload', label: '이미지업로드' },
      { key: 'object', label: '객체편집' },
      { key: 'sketch', label: '스케치' },
      { key: 'blueprint', label: '도면작업' },
      { key: 'final', label: '최종도면' }
  ];

  const sketchTools = [
    { key: 'pen', label: '펜', icon: <PenIcon /> },
    { key: 'line', label: '직선', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="19" x2="19" y2="5"></line></svg> },
    { key: 'rect', label: '박스', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg> },
    { key: 'arrow', label: '화살표', icon: <ArrowIcon /> },
    { key: 'eraser', label: '지우개', icon: <EraserIcon /> }
  ];

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto Fit Zoom Effect
  useEffect(() => {
    if (mode === 'BLUEPRINT' && fitToScreen) {
        const handleResize = () => {
            const container = imageContainerRef.current?.parentElement;
            if (!container) return;
            
            const containerWidth = container.clientWidth - 80; // subtract padding
            const containerHeight = container.clientHeight - 80;
            
            const scaleX = containerWidth / 1974;
            const scaleY = containerHeight / 1711;
            const autoZoom = Math.min(scaleX, scaleY, 1); // max 100%
            
            setZoom(autoZoom > 0 ? autoZoom : 0.1);
        };
        
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }
  }, [mode, fitToScreen]);

  // Update Image History - Enhanced Logic (10번)
  const addToHistory = (newImage: ImageVariation, snapshotType?: 'pre-sketch' | 'pre-object') => {
      const entry: ImageVariation = {
          ...newImage,
          snapshotType // Save snapshot type
      };
      
      setImageHistory(prev => {
          const exists = prev.some(img => img.id === newImage.id);
          if (exists) return prev; 
          const updated = [...prev, entry];
          // Limit history size if needed, e.g. 20 items
          return updated.slice(-20);
      });
      setCurrentImage(entry);
  };

  const handleHistoryClick = (img: ImageVariation) => {
      setCurrentImage(img);
      setObjects([]);
      setSelectedObjectId(null);
      setModifiedBoxes({});
      setDuplicatedObjectIds(new Set());
      setBlueprintImage(null);
      setIsometricImage(null);
      setOrthographicViews(null);
      setVariationsToSelect(null);

      // Restore mode based on snapshot type (10번)
      if (img.snapshotType === 'pre-sketch') {
          setMode('OBJECT'); // Go back to Object mode
      } else if (img.snapshotType === 'pre-object') {
          setMode('UPLOAD'); // Go back to start
      }
      
      // Clear specific states
      if (mode === 'SKETCH') {
          sketchLayerRef.current?.clear();
          setPrompt('');
      }
  };

  useEffect(() => {
    if (currentImage) {
        // Initial load or current image update
    }
  }, [currentImage?.id]);

  const handleDownloadImage = (imageUrl: string, title: string) => {
    const link = document.createElement('a');
    link.download = `${title.replace(/\s+/g, '_')}_${Date.now()}.png`;
    link.href = imageUrl;
    link.click();
  };

  const handleSelectKey = async () => {
      if (window.aistudio && window.aistudio.openSelectKey) {
          await window.aistudio.openSelectKey();
      }
  };

  const initFrontView = async () => {
      if (uploadedFiles && uploadedFiles.length > 0) {
        try {
            setGenerationStatus('generating');
            setLoadingMessage('스튜디오샷으로 변경중...');
            setViewPhase('INITIALIZING');
            const frontViewBase64 = await generateFrontViewFromUploads(uploadedFiles);
            const newImage: ImageVariation = {
                id: `front-view-gen-${Date.now()}`,
                title: 'Generated Front View',
                description: 'Orthographic Front View',
                imageUrl: `data:image/png;base64,${frontViewBase64}`,
                createdAt: new Date(),
                snapshotType: 'pre-object' // Initial snapshot is pre-object editing
            };
            addToHistory(newImage);
            setViewPhase('EDITING');
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to generate front view.");
            setViewPhase('EDITING');
        } finally {
            setGenerationStatus('idle');
            setLoadingMessage('');
        }
      }
  };

  // -- PHASE 1: INITIALIZATION --
  useEffect(() => {
      if (viewPhase === 'INITIALIZING' && !currentImage && generationStatus === 'idle') {
          initFrontView();
      }
  }, [uploadedFiles, viewPhase, currentImage, generationStatus]);


  const handleRegenerate = () => {
      if (window.confirm("이미지를 재생성 하시겠습니까? 현재 작업 내용은 저장되지 않을 수 있습니다.")) {
        setObjects([]);
        setSelectedObjectId(null);
        setBlueprintImage(null);
        setIsometricImage(null);
        setOrthographicViews(null);
        sketchLayerRef.current?.clear();
        initFrontView();
      }
  };

  const handleRegenerateBlueprint = () => {
      setIsometricImage(null);
      setOrthographicViews(null);
      handleBlueprintStart();
  }
  
  // Handles new file upload from within Editor
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
         if (window.confirm("새 이미지를 업로드하면 현재 작업이 초기화됩니다. 계속하시겠습니까?")) {
             window.location.reload(); 
         }
      }
  };

  const selectedObject = selectedObjectId ? findObjectById(objects, selectedObjectId) : null;
  const childObjectsOfSelected = selectedObject ? getAllChildObjects(selectedObject) : [];

  const movedObjects = useMemo(() => {
    if (objects.length === 0) return [];
    const allFlatObjects = getAllObjects(objects);
    return allFlatObjects.filter(obj => {
        const originalBox = obj.box;
        const modifiedBox = modifiedBoxes[obj.id];
        if (!modifiedBox) return false;
        const tolerance = 0.001; 
        return (
            Math.abs(originalBox.xMin - modifiedBox.xMin) > tolerance ||
            Math.abs(originalBox.yMin - modifiedBox.yMin) > tolerance ||
            Math.abs(originalBox.xMax - modifiedBox.xMax) > tolerance ||
            Math.abs(originalBox.yMax - modifiedBox.yMax) > tolerance
        );
    });
  }, [objects, modifiedBoxes]);

  const processApiObjects = useCallback(async (apiObjects: ApiObject[], imageEl: HTMLImageElement) => {
    const originalIdToNewObjectMap = new Map<string, DetectedObject>();
    const allNewObjects = await Promise.all(
        apiObjects.map(async (item, i) => {
            const uniqueId = `client-${item.label.replace(/\s/g, '-')}-${i}-${Math.random()}`;
            const box: BoundingBox = { yMin: item.box_2d[0], xMin: item.box_2d[1], yMax: item.box_2d[2], xMax: item.box_2d[3] };
            const mask = createMaskFromBox(box, imageEl.naturalWidth, imageEl.naturalHeight);
            const newObject: DetectedObject & { _originalParentId?: string | null } = {
                id: uniqueId, label: item.label, box: box, mask: mask, children: [],
                thumbnailUrl: cropImage(imageEl, box), _originalParentId: item.parentId,
            };
            if (item.id) originalIdToNewObjectMap.set(item.id, newObject);
            return newObject;
        })
    );
    const roots: DetectedObject[] = [];
    for (const newObject of allNewObjects) {
      const parentId = newObject._originalParentId;
      if (parentId && originalIdToNewObjectMap.has(parentId)) {
        const parentObject = originalIdToNewObjectMap.get(parentId);
        if (parentObject && parentObject.id !== newObject.id) parentObject.children.push(newObject);
        else roots.push(newObject);
      } else roots.push(newObject);
      delete newObject._originalParentId;
    }

    // Expand parent boxes to fully enclose children
    const expandParentBoxes = (obj: DetectedObject) => {
        if (obj.children.length > 0) {
            obj.children.forEach(child => expandParentBoxes(child));
            let minX = obj.box.xMin, minY = obj.box.yMin, maxX = obj.box.xMax, maxY = obj.box.yMax;
            obj.children.forEach(child => {
                minX = Math.min(minX, child.box.xMin); minY = Math.min(minY, child.box.yMin);
                maxX = Math.max(maxX, child.box.xMax); maxY = Math.max(maxY, child.box.yMax);
            });
            obj.box = { xMin: minX, yMin: minY, xMax: maxX, yMax: maxY };
            obj.thumbnailUrl = cropImage(imageEl, obj.box);
        }
    };
    roots.forEach(root => expandParentBoxes(root));
    return roots.filter(r => !(roots.flatMap(root => root.children.map(c => c.id)).includes(r.id)));
  }, []);

  const calculateLayout = useCallback(() => {
    if (mode === 'BLUEPRINT') {
        return; 
    }

    if (!imageRef.current || !imageContainerRef.current) return;
    
    const img = imageRef.current;
    const container = imageContainerRef.current;
    
    if (img.naturalWidth === 0) return;

    const imgRect = img.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    setImageLayout({ 
        top: imgRect.top - containerRect.top, 
        left: imgRect.left - containerRect.left, 
        width: imgRect.width, 
        height: imgRect.height 
    });
  }, [mode]);
  
  const handleObjectDetection = useCallback(async () => {
    if (!currentImage) return;
    if (currentImage.objects && currentImage.objects.length > 0) {
        setObjects(currentImage.objects);
        return;
    }
    const img = imageRef.current;
    if (!img) return;
    if (!img.complete || img.naturalHeight === 0) await new Promise(resolve => { img.onload = resolve; });

    setIsLoading(true);
    setLoadingMessage('객체 감지 중...');
    setError(null);
    try {
      setImgSize({ width: img.naturalWidth, height: img.naturalHeight });
      const base64Data = currentImage.imageUrl.split(',')[1];
      const mimeType = currentImage.imageUrl.match(/data:(.*);/)?.[1] || 'image/png';
      
      const apiObjects = await segmentObjectsInImage(base64Data, mimeType);
      const objectTree = await processApiObjects(apiObjects, img);
      
      setObjects(objectTree);
      setExpandedObjectIds(new Set(objectTree.filter(o => o.children.length > 0).map(obj => obj.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to segment image.');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [processApiObjects, currentImage]);

  const handleBoxUpdate = useCallback((newPixelBox: {x:number, y:number, width:number, height:number}) => {
    setInteractiveBox(newPixelBox);
    if (selectedObjectId && imageLayout.width > 1 && imageLayout.height > 1 && selectedObject) {
      const newParentBox: BoundingBox = {
        xMin: Math.max(0, ((newPixelBox.x - imageLayout.left) / imageLayout.width) * 1000),
        yMin: Math.max(0, ((newPixelBox.y - imageLayout.top) / imageLayout.height) * 1000),
        xMax: Math.min(1000, ((newPixelBox.x + newPixelBox.width - imageLayout.left) / imageLayout.width) * 1000),
        yMax: Math.min(1000, ((newPixelBox.y + newPixelBox.height - imageLayout.top) / imageLayout.height) * 1000),
      };
      setModifiedBoxes(prev => ({ ...prev, [selectedObjectId]: newParentBox }));
    }
  }, [selectedObjectId, selectedObject, imageLayout]);

  useEffect(() => {
    if (selectedObject && selectedObjectId && mode === 'OBJECT') {
      const boxToUse = modifiedBoxes[selectedObjectId] || selectedObject.box;
      setInteractiveBox({
          x: (boxToUse.xMin / 1000) * imageLayout.width + imageLayout.left,
          y: (boxToUse.yMin / 1000) * imageLayout.height + imageLayout.top,
          width: ((boxToUse.xMax - boxToUse.xMin) / 1000) * imageLayout.width,
          height: ((boxToUse.yMax - boxToUse.yMin) / 1000) * imageLayout.height
      });
    } else {
        setInteractiveBox(null);
    }
  }, [selectedObjectId, selectedObject, imageLayout, modifiedBoxes, mode]);

  useEffect(() => {
    const observer = new ResizeObserver(() => calculateLayout());
    const container = imageContainerRef.current;
    if (container) observer.observe(container);
    return () => { if (container) observer.unobserve(container); };
  }, [calculateLayout]);
  
  // ----------------------
  // ACTIONS
  // ----------------------

  const handleCopyObject = () => {
    if (!selectedObject) return;
    const newId = `dup-${Date.now()}`;
    const newObj: DetectedObject = { ...selectedObject, id: newId, label: `${selectedObject.label} (Copy)`, children: [] };
    setObjects(prev => [...prev, newObj]);
    const offset = 50; 
    const newBox = {
        ...selectedObject.box,
        xMin: Math.min(1000, selectedObject.box.xMin + offset),
        xMax: Math.min(1000, selectedObject.box.xMax + offset),
    };
    setModifiedBoxes(prev => ({ ...prev, [newId]: newBox }));
    setDuplicatedObjectIds(prev => new Set(prev).add(newId));
    setSelectedObjectId(newId);
  };

  const handleDeleteObject = () => {
      if (!selectedObject) return;
      handleApplyEditInternal(`Remove the object '${selectedObject.label}' from the scene completely. Fill the space with background.`);
  };

  // Unified Apply Function (8번: 텍스트+편집 통합)
  const handleApplyEdit = async () => {
      // Determines if we are applying text edit, repositioning, or both
      const hasReposition = movedObjects.length > 0;
      const hasTextPrompt = prompt.trim().length > 0;

      if (hasReposition) {
          await handleApplyReposition(hasTextPrompt);
      } else if (hasTextPrompt || mode === 'SKETCH') {
          await handleApplyEditInternal();
      }
  };

  const handleApplyReposition = async (hasTextPrompt: boolean) => {
    setGenerationStatus('generating');
    setLoadingMessage('객체 배치 수정 중...');
    try {
        const repositionPayload = movedObjects.map(obj => ({ label: obj.label, originalBox: obj.box, newBox: modifiedBoxes[obj.id]! }));
        let finalInstruction = await generateRepositionPrompt("", repositionPayload);
        
        if (hasTextPrompt) {
            finalInstruction += `\nADDITIONAL INSTRUCTION: ${prompt}`;
        }

        const boxesToMask: BoundingBox[] = [];
        const duplicates = movedObjects.filter(obj => duplicatedObjectIds.has(obj.id));
        
        if (duplicates.length > 0) {
            const dupLabels = duplicates.map(d => d.label).join(", ");
            finalInstruction = `ACTION: DUPLICATE the following objects: ${dupLabels}. \n${finalInstruction}`;
        }
        
        movedObjects.forEach(obj => {
            if (duplicatedObjectIds.has(obj.id)) {
                const newBox = modifiedBoxes[obj.id]; if (newBox) boxesToMask.push(newBox);
            } else {
                boxesToMask.push(obj.box);
                const newBox = modifiedBoxes[obj.id]; if (newBox) boxesToMask.push(newBox);
            }
        });
        
        const maskBase64 = createCombinedMask(boxesToMask, imgSize.width, imgSize.height, 20); 
        const base64Data = currentImage!.imageUrl.split(',')[1];
        const mimeType = currentImage!.imageUrl.match(/data:(.*);/)?.[1] || 'image/png';
        const newImageBase64Array = await applyRepositionEdit(base64Data, maskBase64, mimeType, finalInstruction);
        
        // Variations selection handled by component, but here we just take the first or let user choose
        const newVariations = newImageBase64Array.map((b64, i) => ({ id: `reposition-${Date.now()}-${i}`, title: `Variation ${i + 1}`, description: "Applied geometric changes", imageUrl: `data:${mimeType};base64,${b64}`, createdAt: new Date(), snapshotType: 'pre-object' as const }));
        setVariationsToSelect(newVariations);
        setModifiedBoxes({});
        setDuplicatedObjectIds(new Set());
        setPrompt('');
    } catch (e) { setError(e instanceof Error ? e.message : "Reposition failed"); } finally { setGenerationStatus('idle'); setLoadingMessage(''); }
  };

  const handleApplyEditInternal = async (customPrompt?: string) => {
    if (!currentImage) return;
    const promptToUse = customPrompt || prompt;
    
    if (mode === 'SKETCH') {
        const sketchDataUrl = sketchLayerRef.current?.getSketchDataUrl();
        if (!sketchDataUrl) { console.error("❌ No sketch data found!"); return; }
        setGenerationStatus('generating');
        setLoadingMessage('스케치를 반영하여 생성 중...');
        try {
            const base64 = currentImage.imageUrl.split(',')[1];
            const newImages = await editImageWithSketch(base64, sketchDataUrl, promptToUse);
            const newVariations = newImages.map((b64, i) => ({ id: `sketch-edit-${Date.now()}-${i}`, title: `Sketch Variation ${i + 1}`, description: promptToUse, imageUrl: `data:image/png;base64,${b64}`, createdAt: new Date(), snapshotType: 'pre-sketch' as const }));
            setVariationsToSelect(newVariations);
        } catch (e) { setError(e instanceof Error ? e.message : "Sketch edit failed"); } finally { setGenerationStatus('idle'); setLoadingMessage(''); }
        return;
    }

    if ((!promptToUse && !customPrompt)) return;
    
    // Object mode edit
    setGenerationStatus('generating');
    setLoadingMessage('이미지 편집 중...');
    setError(null);
    try {
        const base64Data = currentImage.imageUrl.split(',')[1];
        const mimeType = currentImage.imageUrl.match(/data:(.*);/)?.[1] || 'image/png';
        let maskBase64 = "";

        if (selectedObject) {
            const boxToUse = modifiedBoxes[selectedObject.id] || selectedObject.box;
            maskBase64 = createMaskFromBox(boxToUse, imgSize.width, imgSize.height);
        } else {
             // If no object selected, maybe global edit or fail? For now let's assume global edit isn't supported in Object Mode without selection or use entire image
             // Assuming mask required for `editImageWithMask`. If full edit desired, we need a different service call or full mask.
             // Let's create a full white mask for global edit if no object selected
             const canvas = document.createElement('canvas'); canvas.width = imgSize.width; canvas.height = imgSize.height;
             const ctx = canvas.getContext('2d'); if(ctx) { ctx.fillStyle = 'white'; ctx.fillRect(0,0,imgSize.width, imgSize.height); maskBase64 = canvas.toDataURL('image/png').split(',')[1]; }
        }

        const newImageBase64Array = await editImageWithMask(base64Data, mimeType, promptToUse, maskBase64);
        const newVariations = newImageBase64Array.map((b64, i) => ({ id: `edited-${Date.now()}-${i}`, title: `Variation ${i + 1}`, description: `Result of: "${promptToUse}"`, imageUrl: `data:${mimeType};base64,${b64}`, createdAt: new Date(), snapshotType: 'pre-object' as const }));
        setVariationsToSelect(newVariations);
        if (!customPrompt) setPrompt('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to generate edit.'); } finally { setGenerationStatus('idle'); setLoadingMessage(''); }
  };

  const handleBlueprintStart = async () => {
    if (!currentImage) return;
    
    setGenerationStatus('generating');
    try {
        const base64 = currentImage.imageUrl.split(',')[1];
        
        // Step 1: Generate isometric view (original size)
        setLoadingMessage('로딩중... 3D 아이소메트릭 생성 작업을 하는 중입니다');
        const isoBase64 = await generate3DIsometric(base64);
        
        // Step 2: Composite onto 1974x1711 canvas
        const compositedIsoBase64 = await compositeOntoCanvas(isoBase64, 1974, 1711);
        setIsometricImage(compositedIsoBase64);
        
        const isoImg: ImageVariation = {
            id: `iso-${Date.now()}`,
            title: '3D Isometric + Blueprint',
            description: 'Isometric view',
            imageUrl: `data:image/png;base64,${compositedIsoBase64}`,
            createdAt: new Date()
        };
        addToHistory(isoImg);

        // Step 3: Background generate orthographic views
        setLoadingMessage(''); // Clear main blocker
        setIsGeneratingOrtho(true);
        generateOrthographicViews(base64).then(orthoViews => {
            setOrthographicViews(orthoViews);
            setIsGeneratingOrtho(false);
        }).catch(e => {
            console.error(e);
            setIsGeneratingOrtho(false);
        });
        
    } catch (e) {
        console.error("❌ Blueprint generation error:", e);
        setError(e instanceof Error ? e.message : "도면 생성 실패");
        setLoadingMessage('');
    } finally {
        setGenerationStatus('idle');
    }
  };

  // ----------------------
  // RENDER
  // ----------------------

  if (viewPhase === 'INITIALIZING') {
      return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent mx-auto mb-2 rounded-full"></div>
                  <p className="text-blue-600 font-medium">스튜디오샷으로 변경중...</p>
              </div>
          </div>
      );
  }
  if (!currentImage && mode !== 'UPLOAD') return <div className="h-screen bg-[#0A0A0B] flex items-center justify-center text-red-500">Error loading editor.</div>;
  const isActionInProgress = generationStatus !== 'idle' || isLoading;

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0B] text-white overflow-hidden">
        
        {/* LOADING OVERLAY - Modern Style */}
        {(isActionInProgress || loadingMessage) && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50">
                <div className="bg-gradient-to-br from-gray-900 to-black p-12 rounded-3xl border border-white/10 shadow-2xl text-center max-w-md">
                    <div className="animate-spin w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 mx-auto mb-6 rounded-full"></div>
                    <p className="text-white text-lg font-medium mb-2">{loadingMessage || '처리중...'}</p>
                    <p className="text-gray-400 text-sm">잠시만 기다려주세요...</p>
                </div>
            </div>
        )}

        {/* ERROR TOAST */}
        {error && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-lg w-full px-4">
                <div className="bg-gradient-to-r from-[#EF4444] to-[#DC2626] rounded-xl p-4 shadow-2xl border border-[#EF4444] flex items-start gap-3">
                    <svg className="w-6 h-6 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                        <p className="text-white font-bold text-sm">{error}</p>
                    </div>
                    <button onClick={() => setError(null)} className="text-white/80 hover:text-white">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
        )}

      {/* HEADER - Updated Styling */}
      <div className="flex items-center justify-between h-16 bg-gradient-to-r from-black via-[#0A0A0B] to-black px-8 border-b border-white/5">
        <div className="text-white text-2xl font-light tracking-widest">♥</div>
        <div className="flex items-center gap-2">
            {!window.aistudio ? null : (
                 <button onClick={handleSelectKey} className="px-4 py-2 bg-blue-600/90 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
                     API 키 선택하기
                 </button>
            )}
        </div>
      </div>

      {/* 5. Mode Buttons Section - Updated Styling */}
      <div className="flex items-center gap-3 px-8 h-14 bg-black/40 backdrop-blur-md border-b border-white/10">
        {modeButtons.map((btn) => (
            <button
                key={btn.key}
                onClick={() => {
                    if (btn.key === 'upload') {
                         setMode('UPLOAD');
                    } else if (btn.key === 'final') {
                         setMode('FINAL');
                         setShowTechnicalExport(true);
                    } else {
                        // If switching away from Sketch, clear
                        if (mode === 'SKETCH' && btn.key !== 'sketch') {
                            sketchLayerRef.current?.clear();
                            setPrompt('');
                        }
                        const upperMode = btn.key.toUpperCase() as EditorMode;
                        setMode(upperMode);
                        if (btn.key === 'blueprint') {
                            setFitToScreen(true);
                        } else {
                            setZoom(1);
                        }
                    }
                }}
                className={`
                    px-6 py-2.5 rounded-xl font-medium text-sm tracking-wide
                    transition-all duration-300 ease-out
                    ${(mode === 'UPLOAD' && btn.key === 'upload') || mode === btn.key.toUpperCase() || (mode === 'FINAL' && btn.key === 'final')
                        ? 'bg-blue-500/90 text-white shadow-lg shadow-blue-500/30 scale-105' 
                        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white hover:scale-102'
                    }
                `}
            >
                {btn.label}
            </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        {/* LEFT HISTORY SIDEBAR - Resized and Styled */}
        <aside className="w-28 bg-black/60 backdrop-blur-xl border-r border-white/10 flex flex-col overflow-y-auto flex-shrink-0 p-2">
             <h4 className="text-white font-semibold mb-4 text-xs uppercase tracking-wider opacity-60">
                히스토리
            </h4>
            <div className="flex flex-col gap-3">
                {/* HISTORY LIST */}
                {[...imageHistory].reverse().map((img, idx) => (
                    <div 
                        key={img.id} 
                        className="group cursor-pointer mb-3 rounded-xl overflow-hidden
                                   bg-white/5 hover:bg-white/10 transition-all duration-300
                                   border border-white/10 hover:border-white/20
                                   hover:scale-105 hover:shadow-lg hover:shadow-blue-500/20"
                        onClick={() => handleHistoryClick(img)}
                    >
                        <img src={img.imageUrl} alt={img.title} className="w-full h-auto rounded-t-xl"/>
                        <div className="p-2">
                            <span className="block text-xs text-gray-400 group-hover:text-white truncate transition-colors">
                                {img.title || `이미지 ${imageHistory.length - idx}`}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </aside>

        {mode === 'UPLOAD' ? (
            <main className="flex-1 bg-[#0A0A0B] flex flex-col items-center justify-center p-8 text-center">
                 <div className="max-w-md w-full border-2 border-dashed border-[#3F3F46] rounded-3xl p-12 flex flex-col items-center hover:border-[#52525B] transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                        accept="image/png, image/jpeg, image/webp"
                        multiple
                    />
                    <div className="w-20 h-20 bg-[#27272A] rounded-full flex items-center justify-center mb-6">
                        <UploadIcon />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">이미지 업로드</h3>
                    {/* 3. Updated Upload Text */}
                    <div className="text-center text-[#A1A1AA] mt-4 text-sm">
                        작업 할 가구의 최대한 많은 다각도 이미지 첨부
                    </div>
                 </div>
            </main>
        ) : (
            <main className={`flex-1 bg-[#0A0A0B] relative flex items-center justify-center p-8 ${mode === 'BLUEPRINT' ? 'overflow-auto' : 'overflow-hidden'}`}>
                <div 
                    className="image-container relative flex items-center justify-center" 
                    ref={imageContainerRef}
                    style={{
                        width: mode === 'BLUEPRINT' ? '1974px' : '100%',
                        height: mode === 'BLUEPRINT' ? '1711px' : '100%',
                        backgroundColor: mode === 'BLUEPRINT' ? '#FFFFFF' : 'transparent',
                        flexShrink: 0,
                        transform: mode === 'BLUEPRINT' ? `scale(${zoom})` : 'none',
                        transformOrigin: 'center center',
                        transition: 'transform 0.3s ease'
                    }}
                >
                    {mode === 'BLUEPRINT' && isometricImage ? (
                        <>
                            <img 
                                ref={imageRef} 
                                src={`data:image/png;base64,${isometricImage}`} 
                                alt="Isometric blueprint" 
                                style={{
                                    width: '1974px',
                                    height: '1711px',
                                    display: 'block'
                                }}
                                crossOrigin="anonymous" 
                            />
                            
                            <DimensioningLayer
                                width={1974}
                                height={1711}
                                isActive={true}
                                currentTool={blueprintTool}
                                onDimensionsChange={(dims) => setExportDimensions(dims)}
                                zoom={zoom}
                            />
                        </>
                    ) : (
                        <>
                            <img 
                                ref={imageRef} 
                                src={currentImage?.imageUrl} 
                                alt={currentImage?.title} 
                                className="object-contain" 
                                style={{
                                    maxWidth: '90%',
                                    maxHeight: '90%'
                                }}
                                crossOrigin="anonymous" 
                                onLoad={calculateLayout}
                            />
                            <div style={{ position: 'absolute', top: imageLayout.top, left: imageLayout.left, width: imageLayout.width, height: imageLayout.height }}>
                                <CanvasSketchLayer ref={sketchLayerRef} width={imageLayout.width} height={imageLayout.height} isActive={mode === 'SKETCH'} tool={sketchTool} color={sketchColor} lineWidth={sketchWidth} />
                            </div>
                        </>
                    )}

                    {mode === 'OBJECT' && !variationsToSelect && (
                        <>
                            {childObjectsOfSelected.map(child => {
                            const boxToUse = modifiedBoxes[child.id] || child.box;
                            const box = { x: (boxToUse.xMin / 1000) * imageLayout.width + imageLayout.left, y: (boxToUse.yMin / 1000) * imageLayout.height + imageLayout.top, width: ((boxToUse.xMax - boxToUse.xMin) / 1000) * imageLayout.width, height: ((boxToUse.yMax - boxToUse.yMin) / 1000) * imageLayout.height };
                            return <StaticBoundingBox key={child.id} box={box} />;
                            })}
                            {movedObjects.map(obj => {
                            const boxToUse = modifiedBoxes[obj.id]; if (!boxToUse) return null;
                            const centerX = ((boxToUse.xMin + boxToUse.xMax) / 2 / 1000) * imageLayout.width + imageLayout.left;
                            const centerY = ((boxToUse.yMin + boxToUse.yMax) / 2 / 1000) * imageLayout.height + imageLayout.top;
                            return <div key={`dot-${obj.id}`} className="absolute w-3 h-3 bg-white rounded-full ring-2 ring-black/50 cursor-pointer z-20" style={{ left: `${centerX}px`, top: `${centerY}px`, transform: 'translate(-50%, -50%)' }} onClick={(e) => { e.stopPropagation(); setSelectedObjectId(obj.id); }} />;
                            })}
                            {interactiveBox && <InteractiveBoundingBox box={interactiveBox} onBoxChange={handleBoxUpdate} bounds={imageLayout} />}
                        </>
                    )}
                    {variationsToSelect && <EditorVariationSelector 
                        variations={variationsToSelect} 
                        onSelect={(v) => { 
                            setVariationsToSelect(null); 
                            addToHistory(v, mode === 'SKETCH' ? 'pre-sketch' : 'pre-object');
                            setObjects([]);
                            setSelectedObjectId(null);
                            setModifiedBoxes({});
                            setDuplicatedObjectIds(new Set());
                            setBlueprintImage(null);
                            setIsometricImage(null);
                            setOrthographicViews(null);
                            setGenerationStatus('idle');
                            if (mode === 'SKETCH') {
                                sketchLayerRef.current?.clear();
                                setPrompt('');
                            }
                        }} 
                        onCancel={() => {
                            setVariationsToSelect(null);
                            setGenerationStatus('idle');
                            setIsLoading(false);
                            setError(null);
                        }} 
                    />}
                </div>
            </main>
        )}

        {/* DYNAMIC RIGHT SIDEBAR */}
        {mode !== 'UPLOAD' && mode !== 'FINAL' && (
            <aside className="w-80 bg-gradient-to-b from-[#18181B] to-[#0A0A0B] flex flex-col border-l border-[#3F3F46] flex-shrink-0 shadow-2xl overflow-hidden">
                <div className="flex-1 overflow-y-auto">
                    {/* 7. Object Detection Section */}
                    {mode === 'OBJECT' && (
                        <div className="flex flex-col items-center p-6 space-y-4">
                            <button onClick={handleObjectDetection} className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl w-full font-bold shadow-lg shadow-green-600/20 transition-all">
                                객체 감지시작
                            </button>
                            
                            {/* Object List Container */}
                            <div className="w-full bg-[#27272A] p-4 rounded-xl border border-white/5">
                                <h4 className="text-white font-bold mb-3 text-lg border-b border-[#3F3F46] pb-2">객체 목록</h4>
                                <div className="space-y-1">
                                    {isLoading ? (
                                        <ObjectLayerSkeleton />
                                    ) : objects.length > 0 ? (
                                        objects.map(obj => (
                                            <ObjectLayer key={obj.id} object={obj} level={0} selectedObjectId={selectedObjectId} onSelect={setSelectedObjectId} isExpanded={expandedObjectIds.has(obj.id)} onToggleExpand={(id) => setExpandedObjectIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })} onRename={() => { }} />
                                        ))
                                    ) : (
                                        <div className="text-[#A1A1AA] text-sm py-2">감지된 객체가 없습니다.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {mode === 'SKETCH' && (
                        <div className="flex flex-col gap-2 p-6 bg-black/40 backdrop-blur-md border-r border-white/10 h-full">
                            <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">스케치 도구</h3>
                            
                            <div className="flex flex-col gap-2">
                                {sketchTools.map((tool) => (
                                    <button
                                        key={tool.key}
                                        onClick={() => setSketchTool(tool.key as any)}
                                        className={`
                                            px-4 py-3 rounded-xl font-medium text-sm
                                            transition-all duration-300 flex items-center gap-2
                                            ${sketchTool === tool.key
                                                ? 'bg-blue-500/90 text-white shadow-lg shadow-blue-500/30 scale-105'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white hover:scale-102'
                                            }
                                        `}
                                    >
                                        {tool.icon}
                                        <span>{tool.label}</span>
                                    </button>
                                ))}
                            </div>
                            
                            <div className="space-y-4 mt-6">
                                <div>
                                    <label className="text-xs font-bold text-[#71717A] mb-2 block">색상</label>
                                    <div className="grid grid-cols-4 gap-2">{COLORS.map(c => (<button key={c} onClick={() => setSketchColor(c)} className={`w-8 h-8 rounded-full border-2 ${sketchColor === c ? 'border-white ring-2 ring-white/20' : 'border-transparent'}`} style={{ backgroundColor: c }} />))}</div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-[#71717A] mb-2 block">굵기</label>
                                    <div className="flex gap-2">{[2, 5, 10, 20].map(w => (<button key={w} onClick={() => setSketchWidth(w)} className={`flex-1 py-1 rounded bg-[#27272A] flex justify-center ${sketchWidth === w ? 'ring-1 ring-[#3B82F6]' : ''}`}><div className="bg-white rounded-full" style={{ width: w, height: w }} /></button>))}</div>
                                </div>
                            </div>

                            <div className="mt-auto space-y-2">
                                <button onClick={() => sketchLayerRef.current?.undo()} 
                                    className="w-full px-4 py-3 rounded-xl font-medium text-sm bg-yellow-500/80 hover:bg-yellow-500 text-white shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/40 transition-all duration-300 hover:scale-105">
                                    실행취소
                                </button>
                                <button onClick={() => sketchLayerRef.current?.clear()} 
                                    className="w-full px-4 py-3 rounded-xl font-medium text-sm bg-red-500/80 hover:bg-red-500 text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/40 transition-all duration-300 hover:scale-105">
                                    전부지우기
                                </button>
                            </div>
                        </div>
                    )}

                    {mode === 'BLUEPRINT' && (
                        <div className="p-6 space-y-4">
                            {!isometricImage ? (
                                <button
                                    onClick={handleBlueprintStart}
                                    disabled={generationStatus !== 'idle'}
                                    className="w-full py-4 px-4 bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white rounded-xl font-black text-sm shadow-lg disabled:opacity-50"
                                >
                                    도면 작업 시작
                                </button>
                            ) : (
                                <div className="space-y-4">
                                     <div className="bg-[#18181B] rounded-xl p-4 border border-[#3F3F46]">
                                        <h4 className="text-sm font-bold text-white mb-2">평면도</h4>
                                        {orthographicViews ? (
                                            <div className="space-y-2">
                                                <img src={`data:image/png;base64,${orthographicViews.front}`} className="w-full rounded bg-white" alt="Front" />
                                                <img src={`data:image/png;base64,${orthographicViews.side}`} className="w-full rounded bg-white" alt="Side" />
                                            </div>
                                        ) : (
                                            isGeneratingOrtho && <div className="text-center text-blue-400 text-xs animate-pulse">평면도 생성중...</div>
                                        )}
                                     </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </aside>
        )}
      </div>

      {/* FOOTER - Updated Styling */}
      {mode !== 'UPLOAD' && mode !== 'FINAL' && (
      <footer className="flex items-center justify-between px-8 py-4 bg-gradient-to-t from-black via-[#0A0A0B] to-black/80 backdrop-blur-xl border-t border-white/10 flex-shrink-0">
          {mode === 'OBJECT' || mode === 'SKETCH' ? (
              <>
                {/* 6. Regenerate Button (Left) */}
                <div className="flex items-center gap-3">
                    <button onClick={handleRegenerate} 
                        className="px-5 py-2.5 rounded-xl font-medium text-sm bg-orange-500/90 hover:bg-orange-500 text-white shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 transition-all duration-300 hover:scale-105">
                        이미지 재생성(각도변경)
                    </button>
                </div>
                
                {/* 8, 9. Object Actions (Center) */}
                <div className="flex items-center gap-3">
                    {mode === 'OBJECT' && (
                        <>
                            <button onClick={handleDeleteObject} disabled={!selectedObject} 
                                className="px-4 py-2.5 rounded-xl font-medium text-sm bg-red-500/80 hover:bg-red-500 text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/40 transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:scale-100">
                                선택한 객체 삭제
                            </button>
                            <button onClick={handleCopyObject} disabled={!selectedObject} 
                                className="px-4 py-2.5 rounded-xl font-medium text-sm bg-blue-500/80 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:scale-100">
                                선택한 객체 복사
                            </button>
                        </>
                    )}
                </div>

                {/* 9. Text Input + Unified Modify (Right) */}
                <div className="flex items-center gap-3">
                    <input 
                        type="text" 
                        value={prompt} 
                        onChange={(e) => setPrompt(e.target.value)} 
                        className="px-4 py-2.5 bg-white/5 text-white rounded-xl w-72 border border-white/10 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder-gray-500 text-sm transition-all duration-300"
                        placeholder="" 
                    />
                    <button onClick={handleApplyEdit} disabled={isActionInProgress} 
                        className="px-6 py-2.5 rounded-xl font-medium text-sm bg-green-500/90 hover:bg-green-500 text-white shadow-lg shadow-green-500/30 hover:shadow-green-500/50 transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:scale-100">
                        수정
                    </button>
                </div>
              </>
          ) : mode === 'BLUEPRINT' ? (
              <>
                 {/* Blueprint Actions */}
                 <div className="flex items-center gap-3">
                    <button 
                        onClick={handleRegenerateBlueprint}
                        className="px-5 py-2.5 rounded-xl font-medium text-sm bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-105"
                    >
                        도면다시만들기
                    </button>
                 </div>

                 <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2 border border-white/10">
                    <button onClick={() => setFitToScreen(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-all duration-200">Fit</button>
                    <button onClick={() => { setFitToScreen(false); setZoom(Math.max(0.1, zoom - 0.1)); }} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-all duration-200">-</button>
                    <span className="px-3 py-1.5 text-xs font-medium text-blue-400">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => { setFitToScreen(false); setZoom(Math.min(2, zoom + 0.1)); }} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-all duration-200">+</button>
                    <button onClick={() => { setFitToScreen(false); setZoom(1); }} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-all duration-200">100%</button>
                 </div>

                 <div className="flex items-center gap-3">
                  {/* 치수그리기 */}
                  <button 
                    onClick={() => setBlueprintTool('draw')} 
                    className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-300 hover:scale-105 ${
                     blueprintTool === 'draw' 
                     ? 'bg-blue-500/80 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20' 
                     : 'bg-white/5 text-gray-400 hover:bg-white/10'
                   }`}
                >
        치수그리기
    </button>
    
    {/* 실행취소 버튼 추가 (치수선선택 제거됨) */}
    <button 
        onClick={() => {
            // Ctrl+Z 이벤트 발송하여 DimensioningLayer가 감지하도록
            const event = new KeyboardEvent('keydown', {
                key: 'z',
                ctrlKey: true,
                bubbles: true
            });
            window.dispatchEvent(event);
        }}
        className="px-4 py-2.5 rounded-xl font-medium text-sm
                 bg-yellow-500/80 hover:bg-yellow-500 text-white
                 shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/40
                 transition-all duration-300 hover:scale-105"
    >
        실행취소
    </button>
    
    {/* 최종도면생성 */}
    <button 
        onClick={() => {
            if (!isometricImage || !orthographicViews) {
                alert('도면 이미지를 먼저 생성해주세요.');
                return;
            }
            setShowTechnicalExport(true);
            setMode('FINAL');
        }} 
        className="px-5 py-2.5 rounded-xl font-medium text-sm
                 bg-green-500/90 hover:bg-green-500 text-white
                 shadow-lg shadow-green-500/30 hover:shadow-green-500/50
                 transition-all duration-300 hover:scale-105"
    >
        최종도면생성
    </button>
</div>

              </>
          ) : null}
      </footer>
      )}

      {showTechnicalExport && isometricImage && orthographicViews && (
        <TechnicalDrawingExport
            isometricImage={isometricImage.startsWith('data:') ? isometricImage : `data:image/png;base64,${isometricImage}`}
            frontView={orthographicViews.front.startsWith('data:') ? orthographicViews.front : `data:image/png;base64,${orthographicViews.front}`}
            sideView={orthographicViews.side.startsWith('data:') ? orthographicViews.side : `data:image/png;base64,${orthographicViews.side}`}
            dimensions={exportDimensions}
            metadata={metadata}
            onClose={() => {
                setShowTechnicalExport(false);
                setMode('BLUEPRINT');
            }}
            onMetadataChange={setMetadata}
            imageHistory={imageHistory}
            onHistoryClick={(item) => {
                handleHistoryClick(item);
                setShowTechnicalExport(false);
            }}
            onModeChange={(newMode) => {
                setMode(newMode as EditorMode);
                if (newMode !== 'FINAL') setShowTechnicalExport(false);
            }}
        />
      )}
    </div>
  );
};
