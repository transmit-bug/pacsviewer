import { useEffect, useRef, useCallback } from 'react';
import { useViewerStore } from '@/stores/viewerStore';
import { cn } from '@/lib/utils';

interface Point {
  x: number;
  y: number;
}

interface AnnotationLayerProps {
  className?: string;
  previewPoints?: Point[];
  previewStyle?: {
    color: string;
    lineWidth: number;
    fill?: string;
  };
}

export function AnnotationLayer({ 
  className, 
  previewPoints = [],
  previewStyle = { color: '#ffffff', lineWidth: 1 }
}: AnnotationLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { annotations, viewport } = useViewerStore();

  const renderAnnotations = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to parent
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply viewport transformations
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(viewport.zoom, viewport.zoom);
    ctx.rotate((viewport.rotation * Math.PI) / 180);
    if (viewport.flipH) ctx.scale(-1, 1);
    if (viewport.flipV) ctx.scale(1, -1);
    ctx.translate(viewport.pan.x, viewport.pan.y);

    // Render each annotation
    annotations.forEach((annotation) => {
      const { type, geometry, style, label } = annotation;
      const points = geometry.points as Point[];
      
      if (!points || points.length === 0) return;

      ctx.strokeStyle = style.color || '#ffff00';
      ctx.lineWidth = style.lineWidth || 2;
      ctx.fillStyle = style.fill || 'transparent';
      ctx.font = `${style.fontSize || 12}px sans-serif`;

      switch (type) {
        case 'length':
          drawLength(ctx, points, label || '', style);
          break;
        case 'angle':
          drawAngle(ctx, points, label || '', style);
          break;
        case 'area':
          drawArea(ctx, points, label || '', style);
          break;
        case 'probe':
          drawProbe(ctx, points[0], label || '', style);
          break;
        case 'arrow':
          drawArrow(ctx, points, style);
          break;
        case 'text':
          drawText(ctx, points[0], label || '', style);
          break;
        case 'freehand':
          drawFreehand(ctx, points, style);
          break;
        case 'rect':
          drawRect(ctx, points, style);
          break;
        case 'ellipse':
          drawEllipse(ctx, points, style);
          break;
        case 'polygon':
          drawPolygon(ctx, points, style);
          break;
      }
    });

    // Draw preview
    if (previewPoints.length > 0) {
      ctx.strokeStyle = previewStyle.color;
      ctx.lineWidth = previewStyle.lineWidth;
      ctx.setLineDash([5, 5]);
      
      ctx.beginPath();
      ctx.moveTo(previewPoints[0].x, previewPoints[0].y);
      for (let i = 1; i < previewPoints.length; i++) {
        ctx.lineTo(previewPoints[i].x, previewPoints[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }, [annotations, viewport, previewPoints, previewStyle]);

  useEffect(() => {
    renderAnnotations();
  }, [renderAnnotations]);

  // Re-render on resize
  useEffect(() => {
    const handleResize = () => renderAnnotations();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderAnnotations]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('absolute inset-0 pointer-events-none', className)}
    />
  );
}

function drawLength(ctx: CanvasRenderingContext2D, points: Point[], label: string, style: any) {
  if (points.length < 2) return;
  
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  ctx.lineTo(points[1].x, points[1].y);
  ctx.stroke();

  // Draw endpoints
  [points[0], points[1]].forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = style.color;
    ctx.fill();
  });

  // Draw label
  if (label) {
    const midX = (points[0].x + points[1].x) / 2;
    const midY = (points[0].y + points[1].y) / 2;
    
    ctx.fillStyle = style.color;
    ctx.font = `${style.fontSize || 12}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, midX, midY - 10);
  }
}

function drawAngle(ctx: CanvasRenderingContext2D, points: Point[], label: string, style: any) {
  if (points.length < 3) return;
  
  // Draw two lines from vertex
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  ctx.lineTo(points[1].x, points[1].y);
  ctx.lineTo(points[2].x, points[2].y);
  ctx.stroke();

  // Draw vertex
  ctx.beginPath();
  ctx.arc(points[1].x, points[1].y, 3, 0, Math.PI * 2);
  ctx.fillStyle = style.color;
  ctx.fill();

  // Draw label at vertex
  if (label) {
    ctx.fillStyle = style.color;
    ctx.font = `${style.fontSize || 12}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, points[1].x + 15, points[1].y - 15);
  }
}

function drawArea(ctx: CanvasRenderingContext2D, points: Point[], label: string, style: any) {
  if (points.length < 2) return;
  
  if (points.length === 2) {
    // Rectangle
    const x = Math.min(points[0].x, points[1].x);
    const y = Math.min(points[0].y, points[1].y);
    const w = Math.abs(points[1].x - points[0].x);
    const h = Math.abs(points[1].y - points[0].y);
    
    if (style.fill) {
      ctx.fillStyle = style.fill;
      ctx.fillRect(x, y, w, h);
    }
    ctx.strokeRect(x, y, w, h);
  } else {
    // Polygon
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    
    if (style.fill) {
      ctx.fillStyle = style.fill;
      ctx.fill();
    }
    ctx.stroke();
  }

  // Draw label
  if (label) {
    const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    
    ctx.fillStyle = style.color;
    ctx.font = `${style.fontSize || 12}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, centerX, centerY);
  }
}

function drawProbe(ctx: CanvasRenderingContext2D, point: Point, label: string, style: any) {
  // Draw crosshair
  ctx.strokeStyle = style.color;
  ctx.lineWidth = 1;
  
  ctx.beginPath();
  ctx.moveTo(point.x - 10, point.y);
  ctx.lineTo(point.x + 10, point.y);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(point.x, point.y - 10);
  ctx.lineTo(point.x, point.y + 10);
  ctx.stroke();

  // Draw label
  if (label) {
    ctx.fillStyle = style.color;
    ctx.font = `${style.fontSize || 10}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(label, point.x + 12, point.y - 5);
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, points: Point[], _style: any) {
  if (points.length < 2) return;
  
  const start = points[0];
  const end = points[1];
  
  // Draw line
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  // Draw arrowhead
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headLen = 15;
  
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLen * Math.cos(angle - Math.PI / 6),
    end.y - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLen * Math.cos(angle + Math.PI / 6),
    end.y - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

function drawText(ctx: CanvasRenderingContext2D, point: Point, text: string, style: any) {
  ctx.fillStyle = style.color || '#ffffff';
  ctx.font = `${style.fontSize || 14}px sans-serif`;
  ctx.textAlign = 'left';
  
  // Draw background
  const metrics = ctx.measureText(text);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(
    point.x - 2, 
    point.y - (style.fontSize || 14) - 2, 
    metrics.width + 4, 
    (style.fontSize || 14) + 4
  );
  
  ctx.fillStyle = style.color || '#ffffff';
  ctx.fillText(text, point.x, point.y);
}

function drawFreehand(ctx: CanvasRenderingContext2D, points: Point[], _style: any) {
  if (points.length < 2) return;
  
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  
  ctx.stroke();
}

function drawRect(ctx: CanvasRenderingContext2D, points: Point[], style: any) {
  if (points.length < 2) return;
  
  const x = Math.min(points[0].x, points[1].x);
  const y = Math.min(points[0].y, points[1].y);
  const w = Math.abs(points[1].x - points[0].x);
  const h = Math.abs(points[1].y - points[0].y);
  
  if (style.fill) {
    ctx.fillStyle = style.fill;
    ctx.fillRect(x, y, w, h);
  }
  ctx.strokeRect(x, y, w, h);
}

function drawEllipse(ctx: CanvasRenderingContext2D, points: Point[], style: any) {
  if (points.length < 2) return;
  
  const cx = (points[0].x + points[1].x) / 2;
  const cy = (points[0].y + points[1].y) / 2;
  const rx = Math.abs(points[1].x - points[0].x) / 2;
  const ry = Math.abs(points[1].y - points[0].y) / 2;
  
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  
  if (style.fill) {
    ctx.fillStyle = style.fill;
    ctx.fill();
  }
  ctx.stroke();
}

function drawPolygon(ctx: CanvasRenderingContext2D, points: Point[], style: any) {
  if (points.length < 3) return;
  
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  
  ctx.closePath();
  
  if (style.fill) {
    ctx.fillStyle = style.fill;
    ctx.fill();
  }
  ctx.stroke();
}
