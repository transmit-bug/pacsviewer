/**
 * FundusOverlay — Canvas overlay for fundus annotations.
 *
 * Renders:
 * - Optic disc boundary (yellow ellipse)
 * - Optic cup boundary (red ellipse)
 * - C/D ratio text
 * - Lesion markers (color-coded circles)
 * - Vessel segments (arteries red, veins blue)
 *
 * This is a pointer-events-none overlay positioned on top of the viewport.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useFundusStore, LESION_COLORS } from '@/stores/fundusStore';
import { cn } from '@/lib/utils';

interface FundusOverlayProps {
  className?: string;
}

export function FundusOverlay({ className }: FundusOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { cupDiscMeasurements, lesions } = useFundusStore();

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw cup/disc boundaries
    cupDiscMeasurements.forEach((m) => {
      // Disc boundary (yellow)
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(m.discCenterX, m.discCenterY, m.discRadiusX, m.discRadiusY, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Cup boundary (red)
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(m.cupCenterX, m.cupCenterY, m.cupRadiusX, m.cupRadiusY, 0, 0, Math.PI * 2);
      ctx.stroke();

      // C/D ratio label
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const label = `C/D: ${m.cdRatio.toFixed(2)}`;
      ctx.font = '12px sans-serif';
      const metrics = ctx.measureText(label);
      const labelX = m.discCenterX + m.discRadiusX + 5;
      const labelY = m.discCenterY - 5;
      ctx.fillRect(labelX - 2, labelY - 12, metrics.width + 4, 16);
      ctx.fillStyle = '#ffff00';
      ctx.fillText(label, labelX, labelY);
    });

    // Draw lesions
    lesions.forEach((l) => {
      const color = LESION_COLORS[l.type] || '#888888';

      // Outer ring
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Semi-transparent fill
      ctx.fillStyle = color + '40';
      ctx.fill();
    });
  }, [cupDiscMeasurements, lesions]);

  useEffect(() => {
    render();
    const handleResize = () => render();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [render]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('absolute inset-0 pointer-events-none', className)}
    />
  );
}
