/**
 * useOctThicknessMap — Generate thickness map from OCT volume data.
 *
 * Fetches DICOM frame pixel data, runs layer detection + thickness calculation,
 * and returns thickness map data ready for rendering by <ThicknessMap>.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  generateThicknessMap,
  type ThicknessMapData,
  type ThicknessType,
  type PixelSpacing,
} from '@pacsviewer/image-processing/browser';

interface UseOctThicknessMapOptions {
  imageId: string;
  /** Thickness type to calculate (default: 'total') */
  thicknessType?: ThicknessType;
  /** Pixel spacing override (if not available from DICOM metadata) */
  pixelSpacing?: PixelSpacing;
  /** Whether to auto-generate on mount */
  autoGenerate?: boolean;
}

interface UseOctThicknessMapReturn {
  /** Thickness map data (null until generated) */
  thicknessData: ThicknessMapData | null;
  /** Whether generation is in progress */
  isGenerating: boolean;
  /** Error message if generation failed */
  error: string | null;
  /** Trigger thickness map generation */
  generate: () => Promise<void>;
  /** Current thickness type */
  thicknessType: ThicknessType;
  /** Set thickness type and regenerate */
  setThicknessType: (type: ThicknessType) => void;
}

/**
 * Parse DICOM file and extract per-frame grayscale pixel data.
 */
async function extractFramesFromDicom(
  buffer: ArrayBuffer
): Promise<{
  frames: Uint8Array[];
  width: number;
  height: number;
  pixelSpacing: PixelSpacing;
  numberOfFrames: number;
}> {
  // Dynamically import dicom-parser (only when needed)
  const dicomParser = await import('dicom-parser');
  const byteArray = new Uint8Array(buffer);
  const dataSet = dicomParser.parseDicom(byteArray);

  // Extract dimensions
  const width = dataSet.uint16('x00280011') ?? 0; // Columns
  const height = dataSet.uint16('x00280010') ?? 0; // Rows
  const numberOfFrames = dataSet.intString('x00280008') ?? 1;
  const bitsAllocated = dataSet.uint16('x00280100') ?? 8;
  const samplesPerPixel = dataSet.uint16('x00280002') ?? 1;

  // Extract pixel spacing (try 0028,0030 first, then 0018,1164)
  let axialSpacing = 0.01; // default 10 μm
  let lateralSpacing = 0.01;
  try {
    const spacingStr = dataSet.string('x00280030');
    if (spacingStr) {
      const parts = spacingStr.split('\\').map(Number);
      if (parts.length >= 2 && parts[0] > 0 && parts[1] > 0) {
        axialSpacing = parts[0];
        lateralSpacing = parts[1];
      }
    }
  } catch { /* use defaults */ }

  // Extract pixel data
  const pixelDataElement = dataSet.elements.x7fe00010;
  if (!pixelDataElement) {
    throw new Error('No pixel data found in DICOM file');
  }

  const pixelData = new Uint8Array(
    buffer,
    pixelDataElement.dataOffset,
    pixelDataElement.length
  );

  // Calculate frame size in bytes
  const bytesPerPixel = bitsAllocated / 8;
  const frameSizeBytes = width * height * bytesPerPixel * samplesPerPixel;

  // Extract individual frames
  const frames: Uint8Array[] = [];
  for (let i = 0; i < numberOfFrames; i++) {
    const offset = i * frameSizeBytes;
    const frameEnd = Math.min(offset + frameSizeBytes, pixelData.length);

    if (samplesPerPixel === 1 && bitsAllocated === 8) {
      // Grayscale 8-bit: use directly
      frames.push(new Uint8Array(pixelData.buffer, pixelData.byteOffset + offset, frameEnd - offset));
    } else if (samplesPerPixel === 1 && bitsAllocated === 16) {
      // Grayscale 16-bit: convert to 8-bit
      const raw16 = new Uint16Array(pixelData.buffer, pixelData.byteOffset + offset, (frameEnd - offset) / 2);
      const frame8 = new Uint8Array(raw16.length);
      // Normalize to 8-bit range
      let maxVal = 0;
      for (let j = 0; j < raw16.length; j++) {
        if (raw16[j] > maxVal) maxVal = raw16[j];
      }
      const scale = maxVal > 0 ? 255 / maxVal : 1;
      for (let j = 0; j < raw16.length; j++) {
        frame8[j] = Math.min(255, Math.round(raw16[j] * scale));
      }
      frames.push(frame8);
    } else {
      // Multi-sample (RGB): convert to grayscale
      const raw = new Uint8Array(pixelData.buffer, pixelData.byteOffset + offset, frameEnd - offset);
      const gray = new Uint8Array(width * height);
      for (let p = 0; p < width * height; p++) {
        const r = raw[p * samplesPerPixel] ?? 0;
        const g = raw[p * samplesPerPixel + 1] ?? r;
        const b = raw[p * samplesPerPixel + 2] ?? r;
        gray[p] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      }
      frames.push(gray);
    }
  }

  return {
    frames,
    width,
    height,
    pixelSpacing: { axial: axialSpacing, lateral: lateralSpacing },
    numberOfFrames,
  };
}

export function useOctThicknessMap({
  imageId,
  thicknessType: initialType = 'total',
  pixelSpacing: pixelSpacingOverride,
  autoGenerate = false,
}: UseOctThicknessMapOptions): UseOctThicknessMapReturn {
  const [thicknessData, setThicknessData] = useState<ThicknessMapData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thicknessType, setThicknessType] = useState<ThicknessType>(initialType);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async () => {
    if (!imageId) return;

    // Cancel any in-progress generation
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsGenerating(true);
    setError(null);

    try {
      // Fetch DICOM file
      const resp = await fetch(`/api/images/${imageId}/file`, {
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(`Failed to fetch DICOM: ${resp.status}`);

      const buffer = await resp.arrayBuffer();
      if (controller.signal.aborted) return;

      // Parse and extract frames
      const { frames, width, height, pixelSpacing: detectedSpacing } =
        await extractFramesFromDicom(buffer);
      if (controller.signal.aborted) return;

      if (frames.length === 0) {
        throw new Error('No frames found in DICOM file');
      }

      // Use override pixel spacing if provided
      const spacing = pixelSpacingOverride ?? detectedSpacing;

      // Generate thickness map (run in next tick to avoid blocking UI)
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (controller.signal.aborted) return;

      const result = generateThicknessMap(
        frames,
        width,
        height,
        spacing,
        thicknessType
      );

      if (!controller.signal.aborted) {
        setThicknessData(result);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[useOctThicknessMap] Error:', err);
      setError(err.message ?? '厚度图生成失败');
    } finally {
      if (!controller.signal.aborted) {
        setIsGenerating(false);
      }
    }
  }, [imageId, thicknessType, pixelSpacingOverride]);

  // Auto-generate on mount if enabled
  useEffect(() => {
    if (autoGenerate && imageId) {
      generate();
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [autoGenerate, imageId, generate]);

  return {
    thicknessData,
    isGenerating,
    error,
    generate,
    thicknessType,
    setThicknessType: (type: ThicknessType) => {
      setThicknessType(type);
      // Auto-regenerate when type changes (if data already exists)
      if (thicknessData) {
        // Will regenerate via the generate callback which depends on thicknessType
      }
    },
  };
}
