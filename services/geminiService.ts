import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { ImageVariation, ApiObject, BoundingBox } from "../types";
import { getCurrentLanguage } from "../i18n";
import { resizeBase64, resizeImageFile } from "../utils/imageUtils";

// Progress Callback Infrastructure
let globalProgressCallback: ((msg: string) => void) | null = null;

export const setProgressCallback = (cb: ((msg: string) => void) | null) => {
    globalProgressCallback = cb;
};

const reportProgress = (msg: string) => {
    if (globalProgressCallback) {
        globalProgressCallback(msg);
    }
};

// Removed lazy initialization of AI client to ensure fresh key usage
const getAiClient = (): GoogleGenAI => {
    if (!process.env.API_KEY) {
      throw new Error("API_KEY environment variable not set. Please configure it to use the AI features.");
    }
    // Always create a new instance to pick up any dynamic key changes from the environment/dialog
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Helper to extract a JSON object or array from a string that might contain extraneous text or markdown fences.
const extractJson = (text: string): string => {
    // First, try to find JSON within markdown fences (```json ... ```)
    const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) {
        return markdownMatch[1].trim();
    }

    // If no markdown fence, find the first '{' or '[' and the last '}' or ']'
    const firstBracket = text.indexOf('[');
    const firstBrace = text.indexOf('{');
    
    let start = -1;
    
    if (firstBracket === -1) {
        start = firstBrace;
    } else if (firstBrace === -1) {
        start = firstBracket;
    } else {
        start = Math.min(firstBracket, firstBrace);
    }
    
    if (start === -1) {
        // If we found neither, the response is not valid JSON.
        // It could be a conversational refusal from the model.
        throw new Error(`Could not find a valid JSON object or array in the response. Model returned: "${text}"`);
    }

    const lastBracket = text.lastIndexOf(']');
    const lastBrace = text.lastIndexOf('}');
    
    const end = Math.max(lastBracket, lastBrace);

    if (end === -1 || end < start) {
        throw new Error(`Could not find a valid JSON object or array in the response. Model returned: "${text}"`);
    }

    return text.substring(start, end + 1);
};

// Helper function to retry API calls on transient 500/503 errors
const withRetry = async <T>(operation: () => Promise<T>, retries = 2, delay = 1000): Promise<T> => {
    try {
        return await operation();
    } catch (error: any) {
        if (retries > 0) {
            const errorMsg = error.message || '';
            // Retry on Internal Error (500) or Service Unavailable (503) or Overloaded
            if (errorMsg.includes('500') || errorMsg.includes('503') || errorMsg.includes('Internal error') || errorMsg.includes('overloaded') || errorMsg.includes('429')) {
                const retryMsg = `Server busy, retrying in ${delay}ms... (${retries} left)`;
                console.warn(retryMsg);
                reportProgress(retryMsg);
                await new Promise(resolve => setTimeout(resolve, delay));
                return withRetry(operation, retries - 1, delay * 2); // Exponential backoff
            }
        }
        throw error;
    }
};

// This is an internal helper function, not exported.
const editImageInternal = async (
  images: { base64Data: string, mimeType: string }[],
  prompt: string,
  maskBase64?: string
): Promise<string> => {
  return withRetry(async () => {
      try {
        // Validate the prompt to prevent API errors from empty/invalid text parts.
        if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
          throw new Error("A valid, non-empty prompt is required for image editing.");
        }
        if (!images || images.length === 0) {
            throw new Error("At least one image is required for editing.");
        }
          
        const client = getAiClient();

        // OPTIMIZATION: Resize input images to 1024px (down from 1280px) to speed up processing
        reportProgress('Optimizing images...');
        const optimizedImages = await Promise.all(images.map(async (img) => {
            const resized = await resizeBase64(img.base64Data, 1024);
            return { ...img, base64Data: resized };
        }));

        const imageParts = optimizedImages.map(img => ({ inlineData: { data: img.base64Data, mimeType: img.mimeType } }));

        // Order matters for inpainting: [Image, Mask, Prompt] is generally more robust
        const parts: any[] = [...imageParts];
        
        if (maskBase64) {
          parts.push({
            inlineData: { data: maskBase64, mimeType: 'image/png' }
          });
        }
        
        parts.push({ text: prompt });

        // Using the requested Pro model. Requires valid paid API key.
        reportProgress('Sending request to Gemini AI...');
        const response = await client.models.generateContent({
          model: 'gemini-3-pro-image-preview', 
          contents: { parts },
          config: {
            // responseModalities is generally not required for this model
          },
        });

        reportProgress('Processing AI response...');
        if (!response.candidates || response.candidates.length === 0) {
          if (response.promptFeedback?.blockReason) {
            throw new Error(`Image generation was blocked. Reason: ${response.promptFeedback.blockReason}`);
          }
          throw new Error('The API did not return any candidates. The request may have been blocked or failed.');
        }
        
        const candidate = response.candidates[0];
        
        if (!candidate.content?.parts) {
            throw new Error('The API returned a candidate with no content parts.');
        }

        let returnedImage: string | null = null;
        let returnedText: string | null = null;

        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            returnedImage = part.inlineData.data;
          } else if (part.text) {
            returnedText = part.text;
          }
        }

        if (returnedImage) {
          return returnedImage;
        }

        let errorMessage = 'The API did not return an image. The response may have been blocked.';
        if (returnedText) {
          errorMessage = `The AI failed to generate an image and returned this message: "${returnedText}"`;
        }

        throw new Error(errorMessage);
        
      } catch (error) {
        console.error('Error calling Gemini API for image editing:', error);
        if (error instanceof Error) {
          throw error;
        }
        throw new Error('Could not edit the image.');
      }
  });
};

export const generateFrontViewFromUploads = async (
    files: File[]
): Promise<string> => {
    return withRetry(async () => {
        const client = getAiClient();
        
        reportProgress('Preparing images...');
        // Convert files to inline data AND RESIZE them to 1024px
        const imageParts = await Promise.all(files.map(async (file) => {
            const resizedBase64 = await resizeImageFile(file, 1024);
            return {
                inlineData: {
                    data: resizedBase64,
                    mimeType: 'image/png' // resized output is always PNG in our util
                }
            };
        }));

        // USER PROVIDED SPECIFIC PROMPT
        const prompt = `
OBJECTIVE: Create a photorealistic interior photo of the attached furniture (Hero Product from image_1.png), focusing on preserving its exact materials and colors in a clean environment.
USER-DEFINED VARIABLES:
INTERIOR_STYLE (깔끔한 창고/갤러리 스타일):
[The furniture is centrally placed in a spacious, minimalist industrial loft or gallery space. The background is a smooth, matte light greige (grey+beige mix) architectural wall, free of imperfections. It sits on a polished, light-toned concrete floor with a very low satin sheen (not glossy). The environment is completely empty, airy, and meticulously clean, serving only as a neutral backdrop.]
CAMERA_VIEW: [Front view]IMAGE_RATIO: [Square 1:1]
Placement & composition:
Use a realistic ~50-85mm lens perspective (natural eye view).
Place the HERO centrally.
The absolute sharpest point of focus must be the center of the furniture.The main priority is maintaining the integrity of the wood grain texture and the galvanized metal pipe finish seen in the original image.
Styling & Props:
The scene must be completely empty except for the main furniture piece. Absolutely no other objects.
Lighting & compositing (텍스처 보존을 위한 핵심 조명 설정):
[The scene is illuminated by soft, diffused, large-source neutral architectural lighting (simulating light from large North-facing windows or huge softboxes).Crucial: The lighting must not be overly bright or harsh. It should be gentle enough to define the tactile textures of the wood grain and metal pipes without washing out their colors or creating harsh specular highlights.
Shadows beneath the legs should be soft and grounded, not sharp black. The overall color balance is perfectly neutral.]
Hygiene:
Avoid HDR, oversharpening, or any effect that alters the original material appearance. No blown-out highlights on the wood surface.
        `;

        reportProgress('Generating studio view...');
        const response = await client.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: {
                parts: [...imageParts, { text: prompt }]
            },
            config: {
                imageConfig: {
                    aspectRatio: "1:1" // FORCE SQUARE RATIO
                }
            }
        });

        const candidate = response.candidates?.[0];
        const part = candidate?.content?.parts?.find(p => p.inlineData);
        
        if (!part || !part.inlineData || !part.inlineData.data) {
            throw new Error("Failed to generate front view.");
        }

        return part.inlineData.data;
    });
};

export const generateIsometricViews = async (
    frontViewBase64: string
): Promise<{ left: string, right: string }> => {
    return withRetry(async () => {
        const client = getAiClient();
        
        reportProgress('Resizing input...');
        // Ensure input is resized to 1024px
        const resizedFront = await resizeBase64(frontViewBase64, 1024);
        
        const inlineData = {
            data: resizedFront,
            mimeType: 'image/png'
        };

        const leftPrompt = `Based on this FRONT VIEW image, generate a LEFT ISOMETRIC VIEW. Maintain exact materials, lighting, and warehouse concrete environment.`;
        const rightPrompt = `Based on this FRONT VIEW image, generate a RIGHT ISOMETRIC VIEW. Maintain exact materials, lighting, and warehouse concrete environment.`;

        reportProgress('Generating side views...');
        const [leftResp, rightResp] = await Promise.all([
            client.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: { parts: [{ inlineData }, { text: leftPrompt }] }
            }),
            client.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: { parts: [{ inlineData }, { text: rightPrompt }] }
            })
        ]);

        const getImg = (resp: any) => resp.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;

        const leftImg = getImg(leftResp);
        const rightImg = getImg(rightResp);

        if (!leftImg || !rightImg) throw new Error("Failed to generate side views.");

        return { left: leftImg, right: rightImg };
    });
};

// Converts the photorealistic image into a technical blueprint/line-drawing style
export const generateBlueprintStyle = async (
    imageBase64: string
): Promise<string> => {
    return withRetry(async () => {
        const client = getAiClient();
        const resized = await resizeBase64(imageBase64, 1024);
        const inlineData = { data: resized, mimeType: 'image/png' };

        const prompt = `
        Convert this furniture image into a technical architectural BLUEPRINT / LINE DRAWING.
        
        Style:
        - White background, Black lines (Technical Illustration style).
        - Clean, thin, precise lines.
        - Remove all shadows, textures, and lighting effects.
        - Focus purely on the geometry and dimensions.
        - High contrast, clear edges.
        - Do NOT add dimensions or text yet. Just the clean line art of the object.
        `;

        reportProgress('Generating blueprint style...');
        const response = await client.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts: [{ inlineData }, { text: prompt }] }
        });
        
        const img = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        if (!img) throw new Error("Failed to generate blueprint style.");
        return img;
    });
};

/**
 * Refine user-drawn dimension arrows into professional CAD-style annotations
 */
export const refineBlueprintDimensions = async (
    blueprintBase64: string,
    dimensionsData: {x1: number, y1: number, x2: number, y2: number, text: string}[]
): Promise<string> => {
    const client = getAiClient();
    
    const dimensionsDescription = dimensionsData.map((dim, i) => 
        `Dimension ${i+1}: From (${dim.x1.toFixed(0)}, ${dim.y1.toFixed(0)}) to (${dim.x2.toFixed(0)}, ${dim.y2.toFixed(0)}) - Label: "${dim.text}"`
    ).join('\n');
    
    const prompt = `
TASK: Redraw this blueprint with PROFESSIONAL CAD-STYLE dimension annotations.

USER DIMENSION MARKINGS:
${dimensionsDescription}

REQUIREMENTS:
1. **PRESERVE THE FURNITURE SKETCH STYLE** - Keep the gray/blueprint aesthetic of the furniture design
2. **REPLACE user arrows** with clean, professional dimension lines:
   - Thin, precise black lines (1-2px)
   - Small arrow endpoints or tick marks
   - Extension lines perpendicular to measured surfaces
   - Proper spacing from the object
3. **IMPROVE TEXT LABELS**:
   - Clear, legible font (sans-serif, 10-12pt)
   - Aligned parallel to dimension lines
   - Positioned above the line with proper clearance
4. **FOLLOW CAD STANDARDS**:
   - Dimension lines should NOT touch the object
   - Use extension lines that extend beyond dimension lines
   - Maintain consistent arrow/tick style
   - Professional spacing and alignment

OUTPUT: A refined blueprint image with CAD-quality dimension annotations while maintaining the original furniture sketch style.
`;

    try {
        const response = await withRetry(async () => {
            reportProgress('Refining blueprint dimensions...');
            return await client.models.generateContent({
                model: 'gemini-3-pro-image-preview', // 이미지 생성 가능한 모델
                contents: {
                    parts: [
                        { inlineData: { data: blueprintBase64, mimeType: 'image/png' } },
                        { text: prompt }
                    ]
                },
                config: {}
            });
        }, 3, 2000);

        const refinedImage = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        if (!refinedImage) {
            throw new Error("AI failed to refine blueprint dimensions.");
        }

        console.log("✅ Blueprint dimensions refined successfully");
        return refinedImage;
    } catch (error) {
        console.error("❌ Blueprint refinement failed:", error);
        throw new Error("Failed to refine dimensions. Please try again.");
    }
};

// Internal helper to generate a single sketch variation
const generateSingleSketchEdit = async (
    imageBase64: string,
    sketchBase64: string,
    prompt: string
): Promise<string> => {
    return withRetry(async () => {
        const client = getAiClient();
        
        reportProgress('Optimizing sketch inputs...');
        const resizedBase = await resizeBase64(imageBase64, 1024);
        const resizedSketch = await resizeBase64(sketchBase64, 1024);

        const promptText = `
        You are an expert 3D Product Designer and Visualizer.

        **INPUTS:**
        1. **Source Image:** The original photo of the furniture.
        2. **Sketch Overlay:** A transparent layer with colored lines/shapes indicating the Desired Changes.
        3. **Instruction:** "${prompt}"

        **TASK:**
        Transform the Source Image by applying the changes indicated by the Sketch and Instruction.

        **CRITICAL EXECUTION RULES:**
        1. **INTERPRET THE SKETCH, DO NOT PRINT IT:** The sketch lines (red/blue boxes, lines, etc.) are strictly *spatial guides*. **DO NOT** render these colored lines in the final output.
        2. **PHOTOREALISM:** The area defined by the sketch must be rendered as **real 3D geometry** with materials (wood, metal, glass) that perfectly match the original object.
        3. **SEAMLESS INTEGRATION:** The new parts must look like they were always there. Match lighting, shadows, and perspective of the concrete warehouse.
        4. **EXAMPLE:** If the sketch shows a red box on the side, you must generate a *wooden cabinet* (or whatever matches the furniture) in that exact shape/position, NOT a red box.
        `;

        const parts = [
            { inlineData: { data: resizedBase, mimeType: 'image/png' } }, // Source
            { inlineData: { data: resizedSketch, mimeType: 'image/png' } }, // Sketch
            { text: promptText }
        ];

        reportProgress('Generating sketch edit...');
        const response = await client.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts },
        });

        const img = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        if (!img) throw new Error("Failed to generate sketch edit.");
        return img;
    });
};


// Uses a user-drawn sketch + prompt to edit the image
// Returns 3 variations -> UPDATED TO RETURN 1 VARIATION TO PREVENT TIMEOUT
export const editImageWithSketch = async (
    imageBase64: string,
    sketchBase64: string,
    prompt: string
): Promise<string[]> => {
    // 🔥 Validation Added
    if (!imageBase64 || !sketchBase64) {
        throw new Error("이미지 또는 스케치 데이터가 없습니다.");
    }
    
    const cleanSketchBase64 = sketchBase64.includes(',') 
        ? sketchBase64.split(',')[1] 
        : sketchBase64;
    
    console.log("📊 Data validation:", {
        imageLength: imageBase64.length,
        sketchLength: cleanSketchBase64.length,
        promptLength: prompt.length
    });

    // OPTIMIZATION: Generate only 1 variation to ensure stability and prevent timeouts
    const result = await generateSingleSketchEdit(imageBase64, cleanSketchBase64, prompt);
    
    return [result];
};


// ... (rest of existing functions like editImageWithMask, etc.)

export const retryImageGeneration = async (
    images: { base64Data: string, mimeType: string }[],
    prompt: string
): Promise<string> => {
    return await editImageInternal(images, prompt);
};

export const editImageWithMask = async (
    imageBase64: string,
    mimeType: string,
    prompt: string,
    maskBase64: string
): Promise<string[]> => {
    const maskedPrompt = `You are a professional photo editor. 
    
    TASK: Edit the image content found strictly within the white masked area.
    INSTRUCTION: ${prompt}
    CONSTRAINT: Do NOT modify the black areas of the mask. Do NOT return the original image unchanged. You MUST apply the requested edit visibly.`;
    
    const imageInput = [{ base64Data: imageBase64, mimeType: mimeType }];
    
    // OPTIMIZATION: Generate only 1 variation to prevent timeouts
    const result = await editImageInternal(imageInput, maskedPrompt, maskBase64);
    
    return [result];
};

export const generateRepositionPrompt = async (
    visualInstructionImageBase64: string,
    movedObjects: { label: string; originalBox: BoundingBox; newBox: BoundingBox }[]
): Promise<string> => {
    try {
        reportProgress('Analyzing spatial changes...');
        // Perform detailed mathematical analysis of the movement
        const calculatedFacts = movedObjects.map(obj => {
            const oldW = obj.originalBox.xMax - obj.originalBox.xMin;
            const oldH = obj.originalBox.yMax - obj.originalBox.yMin;
            const newW = obj.newBox.xMax - obj.newBox.xMin;
            const newH = obj.newBox.yMax - obj.newBox.yMin;
            
            const oldCenterX = (obj.originalBox.xMin + obj.originalBox.xMax) / 2;
            const oldCenterY = (obj.originalBox.yMin + obj.originalBox.yMax) / 2;
            const newCenterX = (obj.newBox.xMin + obj.newBox.xMax) / 2;
            const newCenterY = (obj.newBox.yMin + obj.newBox.yMax) / 2;

            // Movement logic (0-1000 scale)
            const dx = newCenterX - oldCenterX;
            const dy = newCenterY - oldCenterY;
            const moveThreshold = 20; // 2% of screen

            let direction = "";
            if (Math.abs(dx) < moveThreshold && Math.abs(dy) < moveThreshold) {
                direction = "stayed in roughly the same location";
            } else {
                const vertical = dy < -moveThreshold ? "UP" : (dy > moveThreshold ? "DOWN" : "");
                const horizontal = dx < -moveThreshold ? "LEFT" : (dx > moveThreshold ? "RIGHT" : "");
                direction = `moved ${vertical} ${horizontal}`.trim();
            }

            // Scaling logic
            const widthRatio = newW / oldW;
            const heightRatio = newH / oldH;
            const areaRatio = (newW * newH) / (oldW * oldH);

            let scaling = "";
            let structureInstruction = "";

            if (Math.abs(widthRatio - 1) < 0.05 && Math.abs(heightRatio - 1) < 0.05) {
                scaling = "kept the same size";
                structureInstruction = "Maintain the object's original proportions and design.";
            } else if (Math.abs(widthRatio - heightRatio) > 0.15) {
                // Significant aspect ratio change (STRETCH)
                if (widthRatio > heightRatio) {
                    scaling = `became WIDER/STRETCHED HORIZONTALLY (Width x${widthRatio.toFixed(2)})`;
                    structureInstruction = `STRUCTURAL EXTENSION REQUIRED: The object '${obj.label}' is being widened.
                    1. Elongate horizontal elements (e.g., table tops, shelves, connecting beams).
                    2. DISPLACE vertical elements (legs, cabinets, sides) to the new far left and right edges.
                    3. PRESERVE TOPOLOGY: Do NOT duplicate distinct sub-parts like drawer units, doors, or computer towers unless they form a repeating pattern. If the original had drawers only on the right, the new version must ONLY have drawers on the right, just moved further out.
                    4. DO NOT DUPLICATE: Do not create two copies of the object. Just stretch the middle.`;
                } else {
                    scaling = `became TALLER/STRETCHED VERTICALLY (Height x${heightRatio.toFixed(2)})`;
                    structureInstruction = `STRUCTURAL EXTENSION REQUIRED: The object '${obj.label}' is being made taller.
                    1. Elongate vertical elements (legs, supports).
                    2. Maintain the aspect ratio of horizontal details (handles, drawers).
                    3. Do NOT duplicate distinct features vertically unless they form a stack.`;
                }
            } else {
                // Uniform scaling
                if (areaRatio > 1.1) {
                    scaling = `grew LARGER (Scale x${Math.sqrt(areaRatio).toFixed(2)})`;
                    structureInstruction = "Scale the object up uniformly. Maintain high resolution and sharp details.";
                }
                else {
                    scaling = `shrank SMALLER (Scale x${Math.sqrt(areaRatio).toFixed(2)})`;
                    structureInstruction = "Scale the object down uniformly.";
                }
            }

            return `Object '${obj.label}': ${direction}, and ${scaling}. ${structureInstruction}`;
        }).join('\n');

        return calculatedFacts;

    } catch (error) {
        console.error('Error generating reposition prompt:', error);
        // Fallback to simple description
        return "Move the objects as requested.";
    }
};

export const applyRepositionEdit = async (
    imageBase64: string,
    maskBase64: string,
    mimeType: string,
    generatedPrompt: string
): Promise<string[]> => {
    const finalPrompt = `You are an expert architectural and product visualizer using Inpainting.

    **TASK:** Re-generate the object in the new masked area.
    
    **SCENE CONTEXT:** The object is placed on the floor/ground in a room. It must cast correct shadows and match the perspective of the concrete wall/floor.

    **INSTRUCTION:**
    ${generatedPrompt}

    **EXECUTION RULES:**
    1. **INPAINTING:** The white mask represents the "New Reality". Completely redraw the object inside this area based on the instruction.
    2. **BACKGROUND:** If the mask covers the old position, fill that part with the background (concrete wall/floor) seamlessly.
    3. **STRUCTURE:** If the instruction says "WIDER", you must DESIGN a wider version of the object (e.g. a longer desk surface with legs at the far ends), do not distort it.
    4. **FIDELITY:** Maintain the exact style, material, and configuration of the original object. If the original has drawers on the right, KEEP them on the right. Do not mirror features.
    5. **REALISM:** High quality, photorealistic, 4k. Match lighting and shadows.`;

    const imageInput = [{ base64Data: imageBase64, mimeType: mimeType }];
    
    // OPTIMIZATION: Generate 1 variation
    const result = await editImageInternal(imageInput, finalPrompt, maskBase64);
    return [result];
};

// ... (segmentObjectsInImage remains unchanged)
export const segmentObjectsInImage = async (
  imageBase64: string,
  mimeType: string,
): Promise<ApiObject[]> => {
  console.log("Starting object segmentation with JSON schema enforcement (no masks)...");
  try {
    const client = getAiClient();
    reportProgress('Detecting objects...');
    // No need to resize here for flash model usually, but we could if detection fails.
    // Keeping it raw for now as flash is robust.
    
    const objectSegmentationSchema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            parentId: { type: Type.STRING },
            label: { type: Type.STRING },
            box_2d: {
              type: Type.ARRAY,
              items: { type: Type.NUMBER },
              minItems: 4,
              maxItems: 4,
            },
          },
          required: ["id", "parentId", "label", "box_2d"]
        }
      };

    const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                { inlineData: { data: imageBase64, mimeType: mimeType } },
                { text: `Analyze the image and detect all distinct objects. Your task is to organize these objects into a hierarchical scene graph, like layers in an image editor.

**CRITICAL BOUNDING BOX RULES:**
1. **PARENT OBJECTS MUST FULLY ENCLOSE ALL CHILDREN**: If 'table' has children like 'table top' and 'leg structure', the 'table' bounding box MUST be large enough to contain ALL of them.
2. Bounding boxes must be **EXTREMELY TIGHT** to the visible pixels of the object.
3. **EXCLUDE** cast shadows on the floor.
4. **EXCLUDE** floor reflections.
5. For hierarchical objects (e.g., furniture):
   - Parent object (e.g., "table"): Draw ONE box around the ENTIRE assembled object including ALL visible parts
   - Child objects (e.g., "table top", "legs"): Draw tight boxes around each individual component

**HIERARCHY RULES:**
- Top-level objects should represent complete, assembled items (e.g., "table", "chair", "cabinet")
- Sub-parts should be children (e.g., "table top", "table legs" are children of "table")
- parentId should be the id of the containing object, or null for top-level objects

**OUTPUT FORMAT:**
For each object, provide:
- unique 'id'
- descriptive 'label'
- 'parentId' (id of parent object, or null for top-level)
- normalized 2D 'box_2d' [yMin, xMin, yMax, xMax] in 0-1000 range

EXAMPLE for a table with top and legs:
[
  { "id": "obj1", "parentId": null, "label": "table", "box_2d": [200, 100, 700, 900] },
  { "id": "obj2", "parentId": "obj1", "label": "table top", "box_2d": [200, 100, 350, 900] },
  { "id": "obj3", "parentId": "obj1", "label": "leg structure", "box_2d": [350, 150, 700, 850] }
]
Note how 'table' (parent) box fully contains both children's boxes.` }
            ]
        },
        config: {
            responseMimeType: 'application/json',
            responseSchema: objectSegmentationSchema,
            thinkingConfig: { thinkingBudget: 0 }
        }
    });

    console.log("Raw JSON response from Gemini for segmentation:", response.text);

    // FIX: Use extractJson instead of JSON.parse directly to handle potential markdown wrapping
    const jsonString = extractJson(response.text);
    const detectedObjects = JSON.parse(jsonString);
    
    if (!Array.isArray(detectedObjects)) {
        throw new Error("API returned an invalid format for object segmentation.");
    }
    
    return detectedObjects.map((obj:any) => ({
        ...obj,
        parentId: obj.parentId || null,
    }));

  } catch (error: any) {
    console.error("Detailed error during object segmentation:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        throw new Error("API usage limit reached (Quota Exceeded). Please wait a moment and try again.");
    }
    
    throw new Error(`Could not detect objects in the image. ${errorMessage}`);
  }
};

/**
 * Generate 3D isometric view using Gemini's image transformation
 */
export const generate3DIsometric = async (editedImageBase64: string): Promise<string> => {
    const client = getAiClient();
    
    const prompt = `A highly detailed photorealistic isometric 3D render of the furniture. 
The view is an elevated corner perspective (30-degree isometric angle), showing all materials, textures, wood grain, and metal details sharply defined with professional studio lighting. 

CRITICAL: The background must be PURE SOLID WHITE (Hex Code #FFFFFF). 
- The object must appear completely isolated on a stark white background.
- DO NOT generate any floor shadows, wall gradients, or ambient occlusion on the background.
- The background pixels must be perfectly (255, 255, 255).
- Product catalog style, die-cut look.
High-resolution output suitable for technical documentation.`;

    try {
        console.log("🔄 Generating isometric view...");
        
        const response = await withRetry(async () => {
            reportProgress('Generating 3D Isometric view...');
            return await client.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: {
                    parts: [
                        { inlineData: { data: editedImageBase64, mimeType: 'image/png' } },
                        { text: prompt }
                    ]
                },
                config: {
                    temperature: 0.4,
                    topP: 0.85,
                    topK: 40
                }
            });
        }, 3, 3000);

        console.log("📊 API Response received");

        // Extract image from response
        const candidate = response.candidates?.[0];
        if (!candidate) {
            throw new Error("No response candidate");
        }

        const parts = candidate.content?.parts;
        if (!parts || parts.length === 0) {
            throw new Error("No content parts in response");
        }

        // Find image data
        const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image'));
        if (!imagePart?.inlineData?.data) {
            // Check if there's explanatory text
            const textPart = parts.find(p => p.text);
            const errorText = textPart?.text || "Unknown error";
            console.error("❌ Response:", errorText);
            throw new Error(`Image generation failed: ${errorText}`);
        }

        const isoImage = imagePart.inlineData.data;
        console.log("✅ Isometric view generated successfully");
        return isoImage;

    } catch (error) {
        console.error("❌ Isometric generation error:", error);
        
        if (error instanceof Error) {
            throw new Error(`3D 변환 실패: ${error.message}`);
        }
        throw new Error("3D 변환에 실패했습니다. 다시 시도해주세요.");
    }
};

/**
 * Generate front and side orthographic views sequentially to ensure different angles
 */
export const generateOrthographicViews = async (
    editedImageBase64: string
): Promise<{front: string, side: string}> => {
    const client = getAiClient();
    
    // Step 1: Generate FRONT view first
    const frontPrompt = `Create a precise FRONT ORTHOGRAPHIC technical line drawing of this furniture. 

CRITICAL REQUIREMENTS:
- View the furniture DIRECTLY from the FRONT (facing the main surface)
- Pure orthographic projection with no perspective distortion
- Black lines on pure white background
- Show all construction details and edges
- Engineering blueprint style with NO text, dimensions, or labels
- Clean professional linework

OUTPUT: Front-facing orthographic view.`;

    try {
        console.log("🔄 Step 1: Generating FRONT view...");

        const frontResp = await withRetry<GenerateContentResponse>(() => {
            reportProgress('Generating orthographic FRONT view...');
            return client.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: { 
                    parts: [
                        { inlineData: { data: editedImageBase64, mimeType: 'image/png' } },
                        { text: frontPrompt }
                    ]
                },
                config: { temperature: 0.3, topP: 0.8 }
            });
        }, 3, 3000);

        const frontImage = frontResp.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('image'))?.inlineData?.data;
        
        if (!frontImage) {
            throw new Error("Failed to generate front view");
        }
        
        console.log("✅ Front view generated");

        // Step 2: Generate SIDE view (with explicit difference instruction)
        const sidePrompt = `Create a precise SIDE ORTHOGRAPHIC technical line drawing of this furniture.

CRITICAL REQUIREMENTS:
- View the furniture from the RIGHT SIDE (90-degree angle from the front view)
- MUST show a DIFFERENT angle than the front view
- Pure orthographic projection with no perspective distortion
- Black lines on pure white background
- Show all construction details and edges from the side perspective
- Engineering blueprint style with NO text, dimensions, or labels
- Clean professional linework

IMPORTANT: This view must show the furniture's DEPTH and PROFILE, not the same angle as the front view.

OUTPUT: Side-facing orthographic view showing depth.`;

        console.log("🔄 Step 2: Generating SIDE view...");

        const sideResp = await withRetry<GenerateContentResponse>(() => {
            reportProgress('Generating orthographic SIDE view...');
            return client.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: { 
                    parts: [
                        { inlineData: { data: editedImageBase64, mimeType: 'image/png' } },
                        { text: sidePrompt }
                    ]
                },
                config: { temperature: 0.4, topP: 0.85 } // Slightly higher randomness for variety
            });
        }, 3, 3000);

        const sideImage = sideResp.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('image'))?.inlineData?.data;

        if (!sideImage) {
            throw new Error("Failed to generate side view");
        }

        console.log("✅ Side view generated (different angle)");
        return { front: frontImage, side: sideImage };

    } catch (error) {
        console.error("❌ Orthographic generation error:", error);
        throw new Error("평면도 생성 실패. 다시 시도해주세요.");
    }
};

/**
 * Generates a multi-step response including a text plan and image variations.
 */
export async function* generateImageEdits(
    images: { base64Data: string, mimeType: string }[],
    userPrompt: string,
    useWebSearch: boolean
): AsyncGenerator<
    | { status: 'progress'; message: string }
    | { plan: { textResponse: string; followUpSuggestions: string[] }; groundingMetadata?: any }
    | ImageVariation
> {
    const client = getAiClient();
    
    yield { status: 'progress', message: 'Analyzing request...' };

    const planningImages = await Promise.all(images.map(async (img) => {
        const resized = await resizeBase64(img.base64Data, 512); 
        return { inlineData: { data: resized, mimeType: 'image/png' } };
    }));

    const systemInstruction = `You are a creative design assistant.
    The user wants to edit or generate variations of the provided image(s) based on their text prompt.
    
    YOUR TASKS:
    1. Analyze the user's request and the image(s).
    2. Create a plan with 3 distinct, creative, and detailed image generation prompts that fulfill the user's request.
       - Vary the style, lighting, or perspective slightly if appropriate to give the user options.
       - If the user request is specific, stick to it but maximize quality.
    3. Generate a friendly, short text response acknowledging the request.
    4. Suggest 3 follow-up actions/prompts the user might want to try next.

    OUTPUT JSON FORMAT:
    {
      "textResponse": "string",
      "imagePrompts": ["string", "string", "string"],
      "followUpSuggestions": ["string", "string", "string"]
    }
    `;

    const tools: any[] = [];
    if (useWebSearch) {
        tools.push({ googleSearch: {} });
    }

    let plan: any = {
        textResponse: "Working on your variations...",
        imagePrompts: [userPrompt, userPrompt, userPrompt],
        followUpSuggestions: []
    };

    try {
        const planningResp = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [...planningImages, { text: userPrompt }]
            },
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json',
                tools: tools.length > 0 ? tools : undefined,
            }
        });

        const text = planningResp.text;
        if (text) {
            try {
                plan = JSON.parse(extractJson(text));
            } catch (e) {
                console.warn("Failed to parse planning JSON", e);
            }
        }
        
        yield { 
            plan: { 
                textResponse: plan.textResponse, 
                followUpSuggestions: plan.followUpSuggestions || []
            },
            groundingMetadata: planningResp.candidates?.[0]?.groundingMetadata
        };

    } catch (error) {
        console.error("Planning step failed:", error);
        yield {
            plan: {
                textResponse: "I'm generating variations based on your prompt.",
                followUpSuggestions: []
            }
        };
    }

    yield { status: 'progress', message: 'Generating 3 variations...' };

    const prompts: string[] = Array.isArray(plan.imagePrompts) ? plan.imagePrompts : [userPrompt, userPrompt, userPrompt];
    while (prompts.length < 3) prompts.push(userPrompt);
    
    // MODIFIED: SEQUENTIAL GENERATION TO PREVENT TIMEOUTS
    // Instead of launching all promises at once, we await them one by one.
    for (let i = 0; i < 3; i++) {
        const prompt = prompts[i];
        yield { status: 'progress', message: `Generating variation ${i + 1} of 3...` };
        
        try {
            const imageBase64 = await editImageInternal(images, prompt);
            const variation: ImageVariation = {
                id: `var-${Date.now()}-${i}`,
                title: `Variation ${i + 1}`,
                description: prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt,
                imageUrl: `data:image/png;base64,${imageBase64}`,
                createdAt: new Date(),
                retryPayload: {
                    images: images,
                    prompt: prompt
                }
            };
            yield variation;
        } catch (err) {
             const errorVariation: ImageVariation = {
                id: `err-${Date.now()}-${i}`,
                title: `Error ${i + 1}`,
                description: "Generation failed",
                imageUrl: "", 
                createdAt: new Date(),
                isError: true,
                errorMessage: err instanceof Error ? err.message : "Unknown error",
                retryPayload: {
                    images: images,
                    prompt: prompt
                }
            };
            yield errorVariation;
        }
    }
}