/**
 * CornerstoneViewport — medical image viewer.
 *
 * All image types (DICOM, PNG, JPG) go through Cornerstone.js with CPU rendering.
 * CPU rendering uses Canvas2D internally — reliable, no VTK/WebGL dependency.
 * All Cornerstone tools (measurement, annotation, W/L, pan, zoom) work uniformly.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Enums, eventTarget } from '@cornerstonejs/core';
import {
  ToolGroupManager,
  Enums as ToolEnums,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  LengthTool,
  AngleTool,
  ProbeTool,
  ArrowAnnotateTool,
  EllipticalROITool,
  RectangleROITool,
  PlanarFreehandROITool,
  SplineROITool,
  StackScrollTool,
  MagnifyTool,
} from '@cornerstonejs/tools';
import { initCornerstone, getRenderingEngine, toCornerstoneImageId, RENDERING_ENGINE_ID, VIEWPORT_ID_PREFIX } from '@/lib/cornerstone/init';
import { utilities as ToolUtilities } from '@cornerstonejs/tools';
import { serializeAnnotations, deserializeAnnotations, scheduleAutoSave, cancelAutoSave } from '@/lib/cornerstone/annotation-sync';
import { annotationApi } from '@/services/api';
import { useViewerStore } from '@/stores/viewerStore';
import { cn } from '@/lib/utils';

interface CornerstoneViewportProps {
  imageId: string;
  imageFormat?: string;
  viewportId?: string;
  className?: string;
}

const TOOL_GROUP_ID = 'pacsviewer-toolgroup';

const TOOL_MAP: Record<string, string> = {
  pan: PanTool.toolName,
  zoom: ZoomTool.toolName,
  windowLevel: WindowLevelTool.toolName,
  length: LengthTool.toolName,
  angle: AngleTool.toolName,
  probe: ProbeTool.toolName,
  arrow: ArrowAnnotateTool.toolName,
  ellipticalROI: EllipticalROITool.toolName,
  rectangleROI: RectangleROITool.toolName,
  freehand: PlanarFreehandROITool.toolName,
  spline: SplineROITool.toolName,
  magnify: MagnifyTool.toolName,
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
  const { activeTool, setDicomMetadata, currentFrame, setTotalFrames, totalFrames } = useViewerStore();

  // ─── Annotation sync (save / restore) state ───────────────────────────────
  // True while restoring annotations so render-triggered ANNOTATION_MODIFIED
  // events don't schedule spurious saves.
  const restoringRef = useRef(false);
  const currentImageIdRef = useRef<string | null>(null);
  const currentCsImageIdRef = useRef<string | null>(null);

  /** Serialize the current element's annotations and sync them to the backend. */
  const saveAnnotations = useCallback(async (targetImageId: string) => {
    const element = elementRef.current;
    if (!element || !targetImageId) return;
    try {
      const annotations = serializeAnnotations(element);
      await annotationApi.sync(targetImageId, annotations);
    } catch (err) {
      console.warn('[CornerstoneViewport] 保存标注失败:', err);
    }
  }, []);

  /** Fetch saved annotations for an image and restore them into Cornerstone state. */
  const restoreAnnotations = useCallback(async (targetImageId: string, csImageId: string) => {
    const element = elementRef.current;
    if (!element) return;
    try {
      const resp = (await annotationApi.getForImage(targetImageId)) as any;
      const serialized = resp?.data;
      if (!Array.isArray(serialized) || serialized.length === 0) return;

      restoringRef.current = true;
      const added = deserializeAnnotations(csImageId, serialized, element);
      if (added > 0) {
        const renderingEngine = getRenderingEngine();
        const viewport = renderingEngine?.getViewport(viewportId) as any;
        viewport?.render();
        // Re-render the annotation SVG layer — viewport.render() only redraws
        // the image; annotation rendering is driven by triggerAnnotationRender.
        ToolUtilities.triggerAnnotationRenderForViewportIds([viewportId]);
      }
      // Ignore render-triggered ANNOTATION_MODIFIED events from the restore pass.
      setTimeout(() => {
        restoringRef.current = false;
      }, 0);
    } catch (err) {
      console.warn('[CornerstoneViewport] 恢复标注失败:', err);
    }
  }, [viewportId]);

  /** Entry point for ANNOTATION_* events: immediate or debounced save. */
  const handleAnnotationChange = useCallback((_evt: any, debounced: boolean) => {
    const targetImageId = currentImageIdRef.current;
    const element = elementRef.current;
    if (!targetImageId || !element || restoringRef.current) return;

    if (debounced) {
      scheduleAutoSave(targetImageId, element, saveAnnotations, 1500);
    } else {
      void saveAnnotations(targetImageId);
    }
  }, [saveAnnotations]);

  // Subscribe to Cornerstone annotation events once. Saves happen immediately
  // on completion/removal, debounced (1.5s) on modification.
  useEffect(() => {
    const onCompleted = (evt: any) => handleAnnotationChange(evt, false);
    const onModified = (evt: any) => handleAnnotationChange(evt, true);
    const onRemoved = (evt: any) => handleAnnotationChange(evt, false);

    eventTarget.addEventListener(ToolEnums.Events.ANNOTATION_COMPLETED, onCompleted);
    eventTarget.addEventListener(ToolEnums.Events.ANNOTATION_MODIFIED, onModified);
    eventTarget.addEventListener(ToolEnums.Events.ANNOTATION_REMOVED, onRemoved);

    return () => {
      eventTarget.removeEventListener(ToolEnums.Events.ANNOTATION_COMPLETED, onCompleted);
      eventTarget.removeEventListener(ToolEnums.Events.ANNOTATION_MODIFIED, onModified);
      eventTarget.removeEventListener(ToolEnums.Events.ANNOTATION_REMOVED, onRemoved);
      cancelAutoSave();
    };
  }, [handleAnnotationChange]);

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

          toolGroup.addTool(WindowLevelTool.toolName);
          toolGroup.addTool(PanTool.toolName);
          toolGroup.addTool(ZoomTool.toolName);
          toolGroup.addTool(LengthTool.toolName);
          toolGroup.addTool(AngleTool.toolName);
          toolGroup.addTool(ProbeTool.toolName);
          toolGroup.addTool(ArrowAnnotateTool.toolName);
          toolGroup.addTool(EllipticalROITool.toolName);
          toolGroup.addTool(RectangleROITool.toolName);
          toolGroup.addTool(PlanarFreehandROITool.toolName);
          toolGroup.addTool(SplineROITool.toolName);
          toolGroup.addTool(StackScrollTool.toolName);
          toolGroup.addTool(MagnifyTool.toolName);

          // Assign modes up-front: every tool Passive so annotation tools can
          // render (including annotations restored on load), with the current
          // active tool Active and pan/zoom/scroll on their dedicated buttons.
          const initialTool = TOOL_MAP[activeTool] ?? PanTool.toolName;
          for (const toolName of Object.values(TOOL_MAP)) {
            try { toolGroup.setToolPassive(toolName); } catch { /* ignore */ }
          }
          toolGroup.setToolActive(initialTool, {
            bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
          });
          toolGroup.setToolActive(ZoomTool.toolName, {
            bindings: [{ mouseButton: ToolEnums.MouseBindings.Secondary }],
          });
          toolGroup.setToolActive(StackScrollTool.toolName, {
            bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }],
          });
        }

        toolGroup.addViewport(viewportId, RENDERING_ENGINE_ID);

        // Debug: check CPU rendering state
        const debugVp = renderingEngine.getViewport(viewportId) as any;
        console.log('[CV] viewport useCPURendering:', debugVp?.useCPURendering, 'type:', debugVp?.constructor?.name);

        // Load initial image
        if (imageId) {
          setIsLoading(true);
          setError(null);

          const csImageId = toCornerstoneImageId(imageId, imageFormat);
          const viewport = renderingEngine.getViewport(viewportId) as any;

          if (viewport) {
            if (imageFormat === 'dicom') {
              try {
                const resp = await fetch(`/api/dicomweb/images/${imageId}/frames`);
                if (resp.ok) {
                  const frameData = await resp.json();
                  const nFrames = frameData.numberOfFrames || 1;
                  if (nFrames > 1) {
                    const base = toCornerstoneImageId(imageId, imageFormat);
                    const imageIds = Array.from({ length: nFrames }, (_, i) => `${base}#frame=${i}`);
                    await viewport.setStack(imageIds);
                    setTotalFrames(nFrames);
                  } else {
                    await viewport.setStack([csImageId]);
                    setTotalFrames(1);
                  }
                } else {
                  await viewport.setStack([csImageId]);
                  setTotalFrames(1);
                }
              } catch {
                await viewport.setStack([csImageId]);
                setTotalFrames(1);
              }
            } else {
              await viewport.setStack([csImageId]);
              setTotalFrames(1);
            }
            viewport.render();
          }

          // Track current image and restore saved annotations
          currentImageIdRef.current = imageId;
          currentCsImageIdRef.current = csImageId;
          void restoreAnnotations(imageId, csImageId);

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

    // Cancel any pending auto-save for the previous image
    cancelAutoSave();

    const loadNewImage = async () => {
      const renderingEngine = getRenderingEngine();
      if (!renderingEngine) return;

      const viewport = renderingEngine.getViewport(viewportId) as any;
      if (!viewport) return;

      try {
        setIsLoading(true);
        const csImageId = toCornerstoneImageId(imageId, imageFormat);

        if (imageFormat === 'dicom') {
          try {
            const resp = await fetch(`/api/dicomweb/images/${imageId}/frames`);
            if (resp.ok) {
              const frameData = await resp.json();
              const nFrames = frameData.numberOfFrames || 1;
              if (nFrames > 1) {
                const base = toCornerstoneImageId(imageId, imageFormat);
                const imageIds = Array.from({ length: nFrames }, (_, i) => `${base}#frame=${i}`);
                await viewport.setStack(imageIds);
                setTotalFrames(nFrames);
              } else {
                await viewport.setStack([csImageId]);
                setTotalFrames(1);
              }
            } else {
              await viewport.setStack([csImageId]);
              setTotalFrames(1);
            }
          } catch {
            await viewport.setStack([csImageId]);
            setTotalFrames(1);
          }
        } else {
          await viewport.setStack([csImageId]);
          setTotalFrames(1);
        }
        viewport.render();

        // Track current image and restore saved annotations
        currentImageIdRef.current = imageId;
        currentCsImageIdRef.current = csImageId;
        void restoreAnnotations(imageId, csImageId);

        // Extract DICOM metadata
        try {
          const image = viewport.getImage?.();
          if (image) {
            setDicomMetadata({
              pixelSpacing: image.rowPixelSpacing && image.columnPixelSpacing
                ? [image.rowPixelSpacing, image.columnPixelSpacing]
                : null,
              windowCenter: image.windowCenter ?? null,
              windowWidth: image.windowWidth ?? null,
              rescaleSlope: image.slope ?? 1,
              rescaleIntercept: image.intercept ?? 0,
              rows: image.rows ?? 0,
              columns: image.columns ?? 0,
              bitsAllocated: image.bitsAllocated ?? 8,
              photometricInterpretation: image.photometricInterpretation ?? '',
              numberOfFrames: image.numberOfFrames ?? 1,
              modality: (image.data?.string?.('x00080060')) ?? '',
              laterality: (image.data?.string?.('x00200062')) ?? '',
            });
          }
        } catch {
          setDicomMetadata(null);
        }

        setIsLoading(false);
      } catch (err) {
        console.error('[CornerstoneViewport] Failed to load image:', err);
        setError('图像加载失败');
        setIsLoading(false);
      }
    };

    loadNewImage();
  }, [imageId, viewportId, imageFormat, setDicomMetadata, restoreAnnotations]);

  // Update active tool
  useEffect(() => {
    const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
    if (!toolGroup) return;

    const csToolName = TOOL_MAP[activeTool];
    if (!csToolName) return;

    for (const toolName of Object.values(TOOL_MAP)) {
      try { toolGroup.setToolPassive(toolName); } catch { /* ignore */ }
    }

    toolGroup.setToolActive(csToolName, {
      bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
    });
  }, [activeTool]);

  // Navigate to frame (CinePlayer)
  useEffect(() => {
    if (totalFrames <= 1) return;

    const renderingEngine = getRenderingEngine();
    if (!renderingEngine) return;

    const viewport = renderingEngine.getViewport(viewportId) as any;
    if (!viewport) return;

    try {
      viewport.setImageIdIndex(currentFrame);
      viewport.render();
    } catch {
      // ignore
    }
  }, [currentFrame, totalFrames, viewportId]);

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
