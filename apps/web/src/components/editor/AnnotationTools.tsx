import { useCallback, useState } from 'react';
import { useViewerStore } from '@/stores/viewerStore';
import { Button } from '@/components/ui/button';
import { 
  ArrowUpRight, 
  Type, 
  Pencil, 
  Square, 
  Circle, 
  Hexagon
} from 'lucide-react';

export interface Point {
  x: number;
  y: number;
}

export interface AnnotationData {
  id: string;
  type: 'arrow' | 'text' | 'freehand' | 'rect' | 'ellipse' | 'polygon';
  points: Point[];
  text?: string;
  style: {
    color: string;
    lineWidth: number;
    fontSize?: number;
    fill?: string;
  };
}

interface AnnotationToolsProps {
  onAnnotationComplete?: (annotation: AnnotationData) => void;
}

export function AnnotationTools(_props: AnnotationToolsProps) {
  const { activeTool, setActiveTool } = useViewerStore();

  const tools = [
    { id: 'arrow', icon: ArrowUpRight, label: '箭头' },
    { id: 'text', icon: Type, label: '文字' },
    { id: 'freehand', icon: Pencil, label: '画笔' },
    { id: 'rect-roi', icon: Square, label: '矩形ROI' },
    { id: 'ellipse-roi', icon: Circle, label: '椭圆ROI' },
    { id: 'polygon-roi', icon: Hexagon, label: '多边形ROI' },
  ];

  return (
    <div className="flex flex-col space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground">标注工具</h4>
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

export function useAnnotationHandler() {
  const { activeTool, addAnnotation } = useViewerStore();
  const [points, setPoints] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [textInput, setTextInput] = useState<string | null>(null);
  const [textPosition, setTextPosition] = useState<Point | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent, canvasRef: React.RefObject<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const point = { x, y };

    if (activeTool === 'text') {
      setTextPosition(point);
      setTextInput('');
      return;
    }

    if (activeTool === 'freehand') {
      setPoints([point]);
      setIsDrawing(true);
      return;
    }

    if (activeTool === 'arrow') {
      if (!isDrawing) {
        setPoints([point]);
        setIsDrawing(true);
      } else {
        const newPoints = [...points, point];
        
        addAnnotation({
          id: Date.now().toString(),
          type: 'arrow',
          geometry: { points: newPoints },
          style: { color: '#00ff00', lineWidth: 2 },
          label: '',
        });
        
        setPoints([]);
        setIsDrawing(false);
      }
      return;
    }

    if (activeTool === 'rect-roi' || activeTool === 'ellipse-roi') {
      if (!isDrawing) {
        setPoints([point]);
        setIsDrawing(true);
      } else {
        const newPoints = [...points, point];
        
        addAnnotation({
          id: Date.now().toString(),
          type: activeTool === 'rect-roi' ? 'rect' : 'ellipse',
          geometry: { points: newPoints },
          style: { 
            color: '#ffff00', 
            lineWidth: 2,
            fill: 'rgba(255,255,0,0.1)'
          },
          label: '',
        });
        
        setPoints([]);
        setIsDrawing(false);
      }
      return;
    }

    if (activeTool === 'polygon-roi') {
      if (!isDrawing) {
        setPoints([point]);
        setIsDrawing(true);
      } else {
        // Check if close to first point to complete polygon
        const firstPoint = points[0];
        const distance = Math.sqrt(
          Math.pow(point.x - firstPoint.x, 2) + 
          Math.pow(point.y - firstPoint.y, 2)
        );
        
        if (distance < 10 && points.length >= 3) {
          addAnnotation({
            id: Date.now().toString(),
            type: 'polygon',
            geometry: { points },
            style: { 
              color: '#ff00ff', 
              lineWidth: 2,
              fill: 'rgba(255,0,255,0.1)'
            },
            label: '',
          });
          
          setPoints([]);
          setIsDrawing(false);
        } else {
          setPoints([...points, point]);
        }
      }
      return;
    }
  }, [activeTool, isDrawing, points, addAnnotation]);

  const handleMouseMove = useCallback((e: React.MouseEvent, canvasRef: React.RefObject<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    
    if (activeTool === 'freehand') {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setPoints(prev => [...prev, { x, y }]);
    }
  }, [activeTool, isDrawing]);

  const handleMouseUp = useCallback(() => {
    if (activeTool === 'freehand' && isDrawing && points.length > 0) {
      addAnnotation({
        id: Date.now().toString(),
        type: 'freehand',
        geometry: { points },
        style: { color: '#00ffff', lineWidth: 3 },
        label: '',
      });
      
      setPoints([]);
      setIsDrawing(false);
    }
  }, [activeTool, isDrawing, points, addAnnotation]);

  const handleTextSubmit = useCallback((text: string) => {
    if (textPosition && text) {
      addAnnotation({
        id: Date.now().toString(),
        type: 'text',
        geometry: { points: [textPosition] },
        style: { color: '#ffffff', fontSize: 14 },
        label: text,
      });
    }
    setTextInput(null);
    setTextPosition(null);
  }, [textPosition, addAnnotation]);

  const resetDrawing = useCallback(() => {
    setPoints([]);
    setIsDrawing(false);
    setTextInput(null);
    setTextPosition(null);
  }, []);

  return {
    points,
    isDrawing,
    textInput,
    textPosition,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTextSubmit,
    resetDrawing,
  };
}
