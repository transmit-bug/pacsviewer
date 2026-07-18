/**
 * CornerstoneViewport — replaces the hand-written Canvas ImageViewer.
 *
 * Uses Cornerstone.js RenderingEngine for medical image rendering with
 * built-in support for zoom, pan, window/level, and measurement tools.
 */

import { useEffect, useRef, useState } from 'react';
import { Enums } from '@cornerstonejs/core';
import {
  ToolGroupManager,
  Enums as ToolEnums,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  LengthTool,
  AngleTool,
  ProbeTool,
} from '@cornerstonejs/tools';
import { initCornerstone, getRenderingEngine, toCornerstoneImageId, RENDERING_ENGINE_ID, VIEWPORT_ID_PREFIX } from '@/lib/cornerstone/init';
import { useViewerStore } from '@/stores/viewerStore';
import { cn } from '@/lib/utils';

interface CornerstoneViewportProps {
  imageId: string;
  imageFormat?: string;  // 'dicom' | 'jpeg' | 'png' etc.
  viewportId?: string;
  className?: string;
}

// Unique tool group ID
const TOOL_GROUP_ID = 'pacsviewer-toolgroup';

// Tool name mapping from our store tool IDs to Cornerstone tool names
const TOOL_MAP: Record<string, string> = {
  pan: PanTool.toolName,
  zoom: ZoomTool.toolName,
  windowLevel: WindowLevelTool.toolName,
  length: LengthTool.toolName,
  angle: AngleTool.toolName,
  probe: ProbeTool.toolName,
};

export function CornerstoneViewport({
  imageId,
  imageFormat,
  viewportId = `${VIEWPORT_ID_PREFIX}main`,
  className,
}: CornerstoneViewportProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { activeTool } = useViewerStore();

  // Initialize Cornerstone and set up the viewport
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    let cancelled = false;

    const setupViewport = async () => {
      try {
        await initCornerstone();

        const renderingEngine = getRenderingEngine();
        if (!renderingEngine || cancelled) return;

        // Create viewport
        renderingEngine.enableElement({
          viewportId,
          type: Enums.ViewportType.STACK,
          element: element as HTMLDivElement,
          defaultOptions: {
            background: [0, 0, 0] as [number, number, number],
          },
        });

        // Set up tool group
        let toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
        if (!toolGroup) {
          toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID)!;

          // Add tools
          toolGroup.addTool(WindowLevelTool.toolName);
          toolGroup.addTool(PanTool.toolName);
          toolGroup.addTool(ZoomTool.toolName);
          toolGroup.addTool(LengthTool.toolName);
          toolGroup.addTool(AngleTool.toolName);
          toolGroup.addTool(ProbeTool.toolName);

          // Set default active tools
          toolGroup.setToolActive(PanTool.toolName, {
            bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
          });
          toolGroup.setToolActive(ZoomTool.toolName, {
            bindings: [{ mouseButton: ToolEnums.MouseBindings.Secondary }],
          });
        }

        // Add viewport to tool group
        toolGroup.addViewport(viewportId, RENDERING_ENGINE_ID);

        // Load initial image
        if (imageId) {
          setIsLoading(true);
          setError(null);

          const csImageId = toCornerstoneImageId(imageId, imageFormat);
          const viewport = renderingEngine.getViewport(viewportId) as any;

          if (viewport) {
            await viewport.setStack([csImageId]);
            viewport.render();
          }
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[CornerstoneViewport] Error:', err);
        if (!cancelled) {
          setError('图像加载失败');
          setIsLoading(false);
        }
      }
    };

    setupViewport();

    return () => {
      cancelled = true;
      const renderingEngine = getRenderingEngine();
      if (renderingEngine) {
        try { renderingEngine.disableElement(viewportId); } catch { /* ignore */ }
      }
    };
  }, [viewportId]);

  // Update image when imageId changes
  useEffect(() => {
    if (!imageId) return;

    const loadNewImage = async () => {
      const renderingEngine = getRenderingEngine();
      if (!renderingEngine) return;

      const viewport = renderingEngine.getViewport(viewportId) as any;
      if (!viewport) return;

      try {
        setIsLoading(true);
        const csImageId = toCornerstoneImageId(imageId, imageFormat);
        await viewport.setStack([csImageId]);
        viewport.render();
        setIsLoading(false);
      } catch (err) {
        console.error('[CornerstoneViewport] Failed to load image:', err);
        setError('图像加载失败');
        setIsLoading(false);
      }
    };

    loadNewImage();
  }, [imageId, viewportId]);

  // Update active tool
  useEffect(() => {
    const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
    if (!toolGroup) return;

    const csToolName = TOOL_MAP[activeTool];
    if (!csToolName) return;

    // Deactivate all measurement/annotation tools (set passive)
    for (const toolName of Object.values(TOOL_MAP)) {
      try { toolGroup.setToolPassive(toolName); } catch { /* ignore */ }
    }

    // Activate selected tool
    toolGroup.setToolActive(csToolName, {
      bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
    });
  }, [activeTool]);

  return (
    <div className={cn('relative w-full h-full bg-black', className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-white text-sm bg-black/60 px-3 py-1.5 rounded">加载中...</div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-red-500 text-sm bg-black/60 px-3 py-1.5 rounded">{error}</div>
        </div>
      )}

      <div
        ref={elementRef}
        className="w-full h-full"
        style={{ outline: 'none' }}
      />
    </div>
  );
}
