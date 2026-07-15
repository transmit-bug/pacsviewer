import { useEffect, useRef, useState } from 'react';
import { useViewerStore } from '@/stores/viewerStore';
import { cn } from '@/lib/utils';

interface ImageViewerProps {
  imageId: string;
  className?: string;
}

export function ImageViewer({ imageId, className }: ImageViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    viewport,
    activeTool,
    setViewport,
  } = useViewerStore();

  // Load and render image
  useEffect(() => {
    if (!canvasRef.current || !imageId) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsLoading(true);
    setError(null);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      // Set canvas size to match container
      const container = containerRef.current;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Apply transformations
      ctx.save();
      
      // Move to center
      ctx.translate(canvas.width / 2, canvas.height / 2);
      
      // Apply zoom
      ctx.scale(viewport.zoom, viewport.zoom);
      
      // Apply rotation
      ctx.rotate((viewport.rotation * Math.PI) / 180);
      
      // Apply flip
      if (viewport.flipH) ctx.scale(-1, 1);
      if (viewport.flipV) ctx.scale(1, -1);
      
      // Apply pan
      ctx.translate(viewport.pan.x, viewport.pan.y);

      // Calculate image position to center it
      const scale = Math.min(
        canvas.width / img.width,
        canvas.height / img.height
      ) * 0.9; // 90% of available space

      const x = -img.width * scale / 2;
      const y = -img.height * scale / 2;

      // Draw image
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

      // Apply window/level (simplified - in real app this would be done via shaders)
      if (viewport.windowWidth !== 400 || viewport.windowLevel !== 40) {
        // This is a simplified version - real implementation would use WebGL
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        const min = viewport.windowLevel - viewport.windowWidth / 2;
        const max = viewport.windowLevel + viewport.windowWidth / 2;
        
        for (let i = 0; i < data.length; i += 4) {
          // Apply window/level to grayscale
          const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
          const normalized = ((gray - min) / (max - min)) * 255;
          const clamped = Math.max(0, Math.min(255, normalized));
          
          data[i] = clamped;     // R
          data[i + 1] = clamped; // G
          data[i + 2] = clamped; // B
        }
        
        ctx.putImageData(imageData, 0, 0);
      }

      // Apply invert
      if (viewport.invert) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255 - data[i];
          data[i + 1] = 255 - data[i + 1];
          data[i + 2] = 255 - data[i + 2];
        }
        
        ctx.putImageData(imageData, 0, 0);
      }

      ctx.restore();
      
      setIsLoading(false);
    };

    img.onerror = () => {
      setError('图像加载失败');
      setIsLoading(false);
    };

    // Load image from API
    img.src = `/api/images/${imageId}/file`;
  }, [imageId, viewport]);

  // Handle mouse events for tools
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const startPan = { ...viewport.pan };
    const startZoom = viewport.zoom;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      switch (activeTool) {
        case 'pan':
          setViewport({
            pan: {
              x: startPan.x + deltaX / viewport.zoom,
              y: startPan.y + deltaY / viewport.zoom,
            },
          });
          break;
        case 'zoom':
          const zoomDelta = deltaY > 0 ? 0.9 : 1.1;
          setViewport({
            zoom: Math.max(0.1, Math.min(10, startZoom * zoomDelta)),
          });
          break;
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setViewport({
      zoom: Math.max(0.1, Math.min(10, viewport.zoom * zoomFactor)),
    });
  };

  return (
    <div ref={containerRef} className={cn('relative w-full h-full bg-black', className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white">加载中...</div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-red-500">{error}</div>
        </div>
      )}
      
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
      />
      
      {/* Image info overlay */}
      <div className="absolute bottom-2 left-2 text-xs text-white/70">
        <div>缩放: {(viewport.zoom * 100).toFixed(0)}%</div>
        <div>窗宽: {viewport.windowWidth}</div>
        <div>窗位: {viewport.windowLevel}</div>
      </div>
    </div>
  );
}
