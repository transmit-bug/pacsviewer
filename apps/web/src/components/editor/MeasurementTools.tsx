import { useCallback, useState } from 'react';
import { useViewerStore } from '@/stores/viewerStore';
import { Button } from '@/components/ui/button';
import { Ruler, CircleDot, Square, Target } from 'lucide-react';

export interface Point {
  x: number;
  y: number;
}

export interface Measurement {
  id: string;
  type: 'length' | 'angle' | 'area' | 'probe';
  points: Point[];
  value: number;
  unit: string;
  label?: string;
}

interface MeasurementToolsProps {
  onMeasurementComplete?: (measurement: Measurement) => void;
}

export function MeasurementTools(_props: MeasurementToolsProps) {
  const { activeTool, setActiveTool } = useViewerStore();

  const tools = [
    { id: 'length', icon: Ruler, label: '长度测量' },
    { id: 'angle', icon: CircleDot, label: '角度测量' },
    { id: 'area', icon: Square, label: '面积测量' },
    { id: 'probe', icon: Target, label: '探针测量' },
  ];

  return (
    <div className="flex flex-col space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground">测量工具</h4>
      <div className="grid grid-cols-2 gap-1">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <Button
              key={tool.id}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              className="flex items-center space-x-1"
              onClick={() => setActiveTool(tool.id)}
            >
              <Icon className="h-4 w-4" />
              <span className="text-xs">{tool.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function calculateDistance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function calculateAngle(p1: Point, vertex: Point, p2: Point): number {
  const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
  const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
  
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
  
  const cosAngle = dot / (mag1 * mag2);
  const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
  return (angleRad * 180) / Math.PI;
}

export function calculateAreaRect(p1: Point, p2: Point): number {
  return Math.abs(p2.x - p1.x) * Math.abs(p2.y - p1.y);
}

export function calculateAreaEllipse(p1: Point, p2: Point): number {
  const rx = Math.abs(p2.x - p1.x) / 2;
  const ry = Math.abs(p2.y - p1.y) / 2;
  return Math.PI * rx * ry;
}

export function calculateAreaPolygon(points: Point[]): number {
  if (points.length < 3) return 0;
  
  let area = 0;
  const n = points.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  
  return Math.abs(area) / 2;
}

export function useMeasurementHandler() {
  const { activeTool, addAnnotation } = useViewerStore();
  const [points, setPoints] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent, canvasRef: React.RefObject<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const point = { x, y };

    if (activeTool === 'probe') {
      const measurement: Measurement = {
        id: Date.now().toString(),
        type: 'probe',
        points: [point],
        value: 0,
        unit: 'px',
        label: `(${Math.round(x)}, ${Math.round(y)})`,
      };
      
      addAnnotation({
        id: measurement.id,
        type: 'probe',
        geometry: { points: measurement.points },
        style: { color: '#00ff00' },
        label: measurement.label,
      });
      
      return;
    }

    if (!isDrawing) {
      setPoints([point]);
      setIsDrawing(true);
    } else {
      const newPoints = [...points, point];
      setPoints(newPoints);

      if (activeTool === 'length' && newPoints.length === 2) {
        const distance = calculateDistance(newPoints[0], newPoints[1]);
        const measurement: Measurement = {
          id: Date.now().toString(),
          type: 'length',
          points: newPoints,
          value: distance,
          unit: 'px',
          label: `${distance.toFixed(1)} px`,
        };
        
        addAnnotation({
          id: measurement.id,
          type: 'length',
          geometry: { points: newPoints },
          style: { color: '#ffff00', lineWidth: 2 },
          label: measurement.label,
        });
        
        setPoints([]);
        setIsDrawing(false);
      } else if (activeTool === 'angle' && newPoints.length === 3) {
        const angle = calculateAngle(newPoints[0], newPoints[1], newPoints[2]);
        const measurement: Measurement = {
          id: Date.now().toString(),
          type: 'angle',
          points: newPoints,
          value: angle,
          unit: '°',
          label: `${angle.toFixed(1)}°`,
        };
        
        addAnnotation({
          id: measurement.id,
          type: 'angle',
          geometry: { points: newPoints },
          style: { color: '#00ffff', lineWidth: 2 },
          label: measurement.label,
        });
        
        setPoints([]);
        setIsDrawing(false);
      } else if (activeTool === 'area' && newPoints.length >= 2) {
        let area = 0;
        let label = '';
        
        if (newPoints.length === 2) {
          area = calculateAreaRect(newPoints[0], newPoints[1]);
          label = `${area.toFixed(0)} px²`;
        } else if (newPoints.length >= 3) {
          area = calculateAreaPolygon(newPoints);
          label = `${area.toFixed(0)} px²`;
        }
        
        const measurement: Measurement = {
          id: Date.now().toString(),
          type: 'area',
          points: newPoints,
          value: area,
          unit: 'px²',
          label,
        };
        
        addAnnotation({
          id: measurement.id,
          type: 'area',
          geometry: { points: newPoints },
          style: { color: '#ff00ff', lineWidth: 2, fill: 'rgba(255,0,255,0.1)' },
          label: measurement.label,
        });
        
        setPoints([]);
        setIsDrawing(false);
      }
    }
  }, [activeTool, isDrawing, points, addAnnotation]);

  const handleMouseMove = useCallback((_e: React.MouseEvent, canvasRef: React.RefObject<HTMLCanvasElement>) => {
    // Preview line while drawing
    if (isDrawing && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx && points.length > 0) {
        // This would trigger a re-render with preview
      }
    }
  }, [isDrawing, points]);

  const resetDrawing = useCallback(() => {
    setPoints([]);
    setIsDrawing(false);
  }, []);

  return {
    points,
    isDrawing,
    handleMouseDown,
    handleMouseMove,
    resetDrawing,
  };
}
