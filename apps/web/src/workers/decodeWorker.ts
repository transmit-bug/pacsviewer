/**
 * Image Decode Worker — decodes image data off the main thread.
 *
 * Receives ArrayBuffer via Transferable Objects, decodes using OffscreenCanvas,
 * and returns pixel data without blocking the UI thread.
 */

self.onmessage = async (event: MessageEvent) => {
  const { id, buffer, format } = event.data;

  try {
    // Create a Blob from the transferred buffer
    const blob = new Blob([buffer], { type: `image/${format || 'png'}` });
    
    // Decode using createImageBitmap (efficient, runs off main thread)
    const bitmap = await createImageBitmap(blob);

    // Create OffscreenCanvas for pixel extraction
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);

    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

    // Transfer pixel data back using Transferable Objects (zero-copy)
    const pixelData = new Uint8ClampedArray(imageData.data.buffer);

    self.postMessage(
      {
        id,
        success: true,
        width: bitmap.width,
        height: bitmap.height,
        pixelData,
      },
      [pixelData.buffer] as any // Transferable
    );

    bitmap.close();
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Decode failed',
    });
  }
};
