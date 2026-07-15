/**
 * TensorFlow.js Stub
 *
 * This module previously provided TensorFlow.js initialization and model loading.
 * The deep learning code path has been replaced by pure local image processing
 * algorithms in detection.ts.
 *
 * This stub is retained for backward compatibility with any modules that
 * import types or utilities from this file.
 */

// ============================================================================
// Types
// ============================================================================

export interface ModelConfig {
  modelUrl: string;
  inputShape: [number, number];
  outputShape?: number[];
}

// ============================================================================
// Initialization
// ============================================================================

let isInitialized = false;

/**
 * Initialize the AI subsystem.
 * No longer requires TensorFlow.js - always succeeds immediately.
 */
export async function initializeTensorFlow(): Promise<void> {
  if (isInitialized) return;
  console.log('AI subsystem initialized (local image processing mode)');
  isInitialized = true;
}

/**
 * Get current backend info
 */
export function getBackendInfo(): { backend: string; isInitialized: boolean } {
  return {
    backend: 'local',
    isInitialized,
  };
}
