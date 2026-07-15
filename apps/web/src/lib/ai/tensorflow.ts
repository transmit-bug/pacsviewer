/**
 * TensorFlow.js Setup and Utilities
 * 
 * Provides initialization, model loading, and inference utilities
 * for browser-based AI processing.
 */

import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

// ============================================================================
// Types
// ============================================================================

export interface ModelConfig {
  modelUrl: string;
  inputShape: [number, number];
  outputShape?: number[];
}

export interface InferenceResult {
  predictions: tf.Tensor;
  inferenceTime: number;
  shape: number[];
}

export interface ImageTensor {
  tensor: tf.Tensor4D;
  originalWidth: number;
  originalHeight: number;
}

// ============================================================================
// Initialization
// ============================================================================

let isInitialized = false;

/**
 * Initialize TensorFlow.js with the best available backend
 */
export async function initializeTensorFlow(): Promise<void> {
  if (isInitialized) return;

  try {
    // Set backend to WebGL for GPU acceleration
    await tf.setBackend('webgl');
    await tf.ready();
    
    console.log('TensorFlow.js initialized with backend:', tf.getBackend());
    isInitialized = true;
  } catch (error) {
    console.error('Failed to initialize TensorFlow.js:', error);
    // Fallback to CPU backend
    await tf.setBackend('cpu');
    await tf.ready();
    console.log('TensorFlow.js fallback to CPU backend');
    isInitialized = true;
  }
}

/**
 * Get current backend info
 */
export function getBackendInfo(): { backend: string; isInitialized: boolean } {
  return {
    backend: tf.getBackend(),
    isInitialized,
  };
}

// ============================================================================
// Model Loading
// ============================================================================

const modelCache = new Map<string, tf.LayersModel>();

/**
 * Load a TensorFlow.js model with caching
 */
export async function loadModel(config: ModelConfig): Promise<tf.LayersModel> {
  const cached = modelCache.get(config.modelUrl);
  if (cached) return cached;

  try {
    const model = await tf.loadLayersModel(config.modelUrl);
    modelCache.set(config.modelUrl, model);
    console.log('Model loaded:', config.modelUrl);
    return model;
  } catch (error) {
    console.error('Failed to load model:', error);
    throw new Error(`Model loading failed: ${error}`);
  }
}

/**
 * Load model from URL (supports both HTTP and local paths)
 */
export async function loadModelFromUrl(url: string): Promise<tf.LayersModel> {
  return loadModel({ modelUrl: url, inputShape: [224, 224] });
}

/**
 * Dispose a model from cache
 */
export function disposeModel(url: string): void {
  const model = modelCache.get(url);
  if (model) {
    model.dispose();
    modelCache.delete(url);
  }
}

/**
 * Clear all cached models
 */
export function clearModelCache(): void {
  modelCache.forEach((model) => model.dispose());
  modelCache.clear();
}

// ============================================================================
// Image Processing
// ============================================================================

/**
 * Convert HTML Image or Canvas to TensorFlow tensor
 */
export function imageToTensor(
  image: HTMLImageElement | HTMLCanvasElement,
  targetSize?: [number, number]
): ImageTensor {
  const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;

  // Create tensor from image
  let tensor = tf.browser.fromPixels(image, 3); // RGB
  
  // Resize if target size specified
  if (targetSize) {
    tensor = tf.image.resizeBilinear(tensor as tf.Tensor3D, targetSize);
  }

  // Normalize to [0, 1]
  const normalized = tensor.toFloat().div(255.0);
  
  // Add batch dimension [1, H, W, 3]
  const batched = normalized.expandDims(0) as tf.Tensor4D;

  // Clean up intermediate tensors
  tensor.dispose();
  normalized.dispose();

  return {
    tensor: batched,
    originalWidth: width,
    originalHeight: height,
  };
}

/**
 * Convert tensor back to canvas
 */
export async function tensorToCanvas(
  tensor: tf.Tensor3D | tf.Tensor4D,
  width: number,
  height: number
): Promise<HTMLCanvasElement> {
  // Remove batch dimension if present
  let processed = tensor;
  if (processed.rank === 4) {
    processed = processed.squeeze([0]) as tf.Tensor3D;
  }

  // Reshape to [H, W, 3] if needed
  if (processed.rank === 2) {
    // Grayscale - expand to RGB
    processed = tf.stack([processed, processed, processed], -1) as tf.Tensor3D;
  }

  // Scale to [0, 255] if normalized
  const max = processed.max();
  const maxValue = await max.data();
  max.dispose();

  let scaled = processed;
  if (maxValue[0] <= 1.0) {
    scaled = processed.mul(255).toInt() as tf.Tensor3D;
    processed.dispose();
  }

  // Convert to canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  await tf.browser.toPixels(scaled as tf.Tensor3D, canvas);
  scaled.dispose();

  return canvas;
}

/**
 * Convert canvas to ImageData
 */
export function canvasToImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Convert ImageData to canvas
 */
export function imageDataToCanvas(imageData: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ============================================================================
// Inference Utilities
// ============================================================================

/**
 * Run inference with timing
 */
export async function runInference(
  model: tf.LayersModel,
  input: tf.Tensor
): Promise<InferenceResult> {
  const startTime = performance.now();

  // Run prediction
  const predictions = model.predict(input) as tf.Tensor;
  
  const inferenceTime = performance.now() - startTime;

  return {
    predictions,
    inferenceTime,
    shape: predictions.shape,
  };
}

/**
 * Run inference and return as array
 */
export async function runInferenceAsArray(
  model: tf.LayersModel,
  input: tf.Tensor
): Promise<{ data: Float32Array; shape: number[]; inferenceTime: number }> {
  const result = await runInference(model, input);
  const data = await result.predictions.data() as Float32Array;
  const shape = result.predictions.shape;
  
  result.predictions.dispose();
  
  return {
    data,
    shape,
    inferenceTime: result.inferenceTime,
  };
}

// ============================================================================
// Memory Management
// ============================================================================

/**
 * Get current memory usage
 */
export function getMemoryUsage(): tf.MemoryInfo {
  return tf.memory();
}

/**
 * Dispose tensor safely
 */
export function disposeTensor(tensor: tf.Tensor | null | undefined): void {
  if (tensor && !tensor.isDisposed) {
    tensor.dispose();
  }
}

/**
 * Dispose multiple tensors
 */
export function disposeTensors(tensors: (tf.Tensor | null | undefined)[]): void {
  tensors.forEach(disposeTensor);
}

/**
 * Run operation with automatic tensor cleanup
 */
export async function withTensorScope<T>(
  fn: () => Promise<T>
): Promise<T> {
  const tensorsBefore = tf.memory().numTensors;
  try {
    const result = await fn();
    return result;
  } finally {
    const tensorsAfter = tf.memory().numTensors;
    if (tensorsAfter > tensorsBefore) {
      console.warn(
        `Tensor leak detected: ${tensorsAfter - tensorsBefore} tensors not disposed`
      );
    }
  }
}

// ============================================================================
// Export TF utilities for advanced usage
// export { tf }; // Uncomment to expose tf directly if needed
