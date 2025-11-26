

export const dataUrlToFile = async (dataUrl: string, fileName: string): Promise<File> => {
  const res: Response = await fetch(dataUrl);
  const blob: Blob = await res.blob();
  return new File([blob], fileName, { type: blob.type });
};

/**
 * Resizes an image file to a maximum dimension while maintaining aspect ratio.
 * @param file The input file.
 * @param maxDimension The maximum width or height in pixels (default 1280).
 * @returns Promise resolving to the base64 data string (no prefix).
 */
export const resizeImageFile = (file: File, maxDimension: number = 1280): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxDimension) {
                        height *= maxDimension / width;
                        width = maxDimension;
                    }
                } else {
                    if (height > maxDimension) {
                        width *= maxDimension / height;
                        height = maxDimension;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error("Could not get canvas context"));
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                // Use JPEG for compression if it's a photo, PNG otherwise. 
                // But for simplicity and alpha channel safety, usually PNG, 
                // though JPEG 0.9 is much smaller for photos.
                // Let's use PNG to be safe with transparency, but scaled down.
                resolve(canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9).split(',')[1]);
            };
            img.onerror = reject;
            img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

/**
 * Resizes a base64 image string to a maximum dimension.
 * @param base64Str The base64 string (without prefix).
 * @param maxDimension The maximum width or height.
 * @returns Promise resolving to the resized base64 string (no prefix).
 */
export const resizeBase64 = (base64Str: string, maxDimension: number = 1280): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxDimension) {
                    height *= maxDimension / width;
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width *= maxDimension / height;
                    height = maxDimension;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error("Could not get canvas context"));
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/png').split(',')[1]);
        };
        img.onerror = reject;
        // Add prefix if missing for loading
        img.src = base64Str.startsWith('data:') ? base64Str : `data:image/png;base64,${base64Str}`;
    });
};


/**
 * Crops an image element based on a normalized bounding box.
 * @param image The loaded HTMLImageElement to crop from.
 * @param box The normalized (0-1000) bounding box.
 * @returns A base64 data URL of the cropped image.
 */
export const cropImage = (
  image: HTMLImageElement,
  box: { yMin: number; xMin: number; yMax: number; xMax: number },
): string => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const { naturalWidth: imgWidth, naturalHeight: imgHeight } = image;
  
  const absX = (box.xMin / 1000) * imgWidth;
  const absY = (box.yMin / 1000) * imgHeight;
  const absWidth = ((box.xMax - box.xMin) / 1000) * imgWidth;
  const absHeight = ((box.yMax - box.yMin) / 1000) * imgHeight;
  
  if (absWidth < 1 || absHeight < 1) return '';

  canvas.width = absWidth;
  canvas.height = absHeight;

  ctx.drawImage(
    image,
    absX,
    absY,
    absWidth,
    absHeight,
    0,
    0,
    absWidth,
    absHeight
  );

  return canvas.toDataURL('image/png');
};

/**
 * Creates a black and white mask from a normalized bounding box.
 * @param box The normalized (0-1000) bounding box.
 * @param imageWidth The original width of the source image.
 * @param imageHeight The original height of the source image.
 * @returns A base64 encoded PNG string of the mask (data only, no prefix).
 */
export const createMaskFromBox = (
  box: { yMin: number; xMin: number; yMax: number; xMax: number },
  imageWidth: number,
  imageHeight: number
): string => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  canvas.width = imageWidth;
  canvas.height = imageHeight;

  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, imageWidth, imageHeight);

  const absX = (box.xMin / 1000) * imageWidth;
  const absY = (box.yMin / 1000) * imageHeight;
  const absWidth = ((box.xMax - box.xMin) / 1000) * imageWidth;
  const absHeight = ((box.yMax - box.yMin) / 1000) * imageHeight;
  
  ctx.fillStyle = 'white';
  ctx.fillRect(absX, absY, absWidth, absHeight);
  
  return canvas.toDataURL('image/png').split(',')[1];
};

/**
 * Creates a combined mask from multiple bounding boxes with optional padding.
 * Areas defined in the boxes will be White (editable), rest will be Black (preserved).
 * @param boxes Array of bounding boxes to mask.
 * @param imageWidth Width of the canvas.
 * @param imageHeight Height of the canvas.
 * @param paddingPixels Optional padding in pixels to expand the mask slightly for better blending (default 0).
 */
export const createCombinedMask = (
    boxes: { yMin: number; xMin: number; yMax: number; xMax: number }[],
    imageWidth: number,
    imageHeight: number,
    paddingPixels: number = 0
  ): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
  
    canvas.width = imageWidth;
    canvas.height = imageHeight;
  
    // Fill background with black (preserve)
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, imageWidth, imageHeight);
  
    // Fill all boxes with white (edit/inpaint)
    ctx.fillStyle = 'white';
    boxes.forEach(box => {
        // Calculate absolute coordinates
        const absX = (box.xMin / 1000) * imageWidth;
        const absY = (box.yMin / 1000) * imageHeight;
        const absWidth = ((box.xMax - box.xMin) / 1000) * imageWidth;
        const absHeight = ((box.yMax - box.yMin) / 1000) * imageHeight;

        // Apply padding, clamping to image boundaries
        const padX = Math.max(0, absX - paddingPixels);
        const padY = Math.max(0, absY - paddingPixels);
        const padW = Math.min(imageWidth - padX, absWidth + (paddingPixels * 2));
        const padH = Math.min(imageHeight - padY, absHeight + (paddingPixels * 2));

        ctx.fillRect(padX, padY, padW, padH);
    });
    
    return canvas.toDataURL('image/png').split(',')[1];
  };


/**
 * Draws the source image on a canvas and adds visual arrows and boxes to indicate multiple movements.
 * @param image The loaded HTMLImageElement.
 * @param movements An array of movements, each with an original and new bounding box.
 * @returns A base64 encoded PNG string of the new image (data only, no prefix).
 */
export const drawMovementInstructions = (
  image: HTMLImageElement,
  movements: { originalBox: { yMin: number; xMin: number; yMax: number; xMax: number }, newBox: { yMin: number; xMin: number; yMax: number; xMax: number } }[],
): string => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const { naturalWidth: w, naturalHeight: h } = image;
  canvas.width = w;
  canvas.height = h;

  // 1. Draw original image
  ctx.drawImage(image, 0, 0);

  movements.forEach((movement) => {
    const { originalBox, newBox } = movement;
    // 2. Calculate center points of boxes in absolute pixel coordinates
    const startX = ((originalBox.xMin + originalBox.xMax) / 2 / 1000) * w;
    const startY = ((originalBox.yMin + originalBox.yMax) / 2 / 1000) * h;
    const endX = ((newBox.xMin + newBox.xMax) / 2 / 1000) * w;
    const endY = ((newBox.yMin + newBox.yMax) / 2 / 1000) * h;

    // 3. Draw the arrow
    const headlen = 30; // length of head in pixels
    const angle = Math.atan2(endY - startY, endX - startX);
    
    ctx.strokeStyle = '#FF0000'; // Bright red
    ctx.lineWidth = 8; // Made the arrow thicker
    ctx.lineCap = 'round';
    
    // Line body
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - headlen * Math.cos(angle - Math.PI / 6), endY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - headlen * Math.cos(angle + Math.PI / 6), endY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();

    // 4. Draw the destination bounding box
    const absX = (newBox.xMin / 1000) * w;
    const absY = (newBox.yMin / 1000) * h;
    const absWidth = ((newBox.xMax - newBox.xMin) / 1000) * w;
    const absHeight = ((newBox.yMax - newBox.yMin) / 1000) * h;
    
    ctx.strokeStyle = '#FF0000'; // Bright red
    ctx.lineWidth = 4; // Slightly thinner than the arrow
    ctx.strokeRect(absX, absY, absWidth, absHeight);
  });

  // Return base64 data only
  return canvas.toDataURL('image/png').split(',')[1];
};

/**
 * Composite isometric image onto a white canvas of target dimensions.
 * Used to prepare the blueprint background.
 */
export const compositeOntoCanvas = async (base64Image: string, targetWidth: number, targetHeight: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        // Create image element
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
            // Create canvas with target size
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
                reject(new Error('Canvas context not available'));
                return;
            }
            
            // Fill white background
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, targetWidth, targetHeight);
            
            // Calculate scaling to fit image (maintain aspect ratio, leave margin)
            const margin = 0.1; // 10% margin
            const maxWidth = targetWidth * (1 - margin * 2);
            const maxHeight = targetHeight * (1 - margin * 2);
            
            const scale = Math.min(
                maxWidth / img.width,
                maxHeight / img.height
            );
            
            const scaledWidth = img.width * scale;
            const scaledHeight = img.height * scale;
            
            // Center the image
            const x = (targetWidth - scaledWidth) / 2;
            const y = (targetHeight - scaledHeight) / 2;
            
            // Draw image centered
            ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
            
            // Convert to base64
            const compositeBase64 = canvas.toDataURL('image/png').split(',')[1];
            resolve(compositeBase64);
        };
        
        img.onerror = () => {
            reject(new Error('Failed to load image'));
        };
        
        // Set source
        img.src = base64Image.startsWith('data:') ? base64Image : `data:image/png;base64,${base64Image}`;
    });
};