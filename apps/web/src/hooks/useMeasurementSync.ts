/**
 * useMeasurementSync — keep the measurement store in sync with Cornerstone's
 * live annotation state.
 *
 * CornerstoneViewport saves annotations to the backend on events, but nothing
 * populated the in-memory measurementStore (its `annotations`/`measurements`
 * were always empty). This hook bridges that gap: it serializes the viewport's
 * annotations and refreshes the store on mount, on image change, on Cornerstone
 * annotation events, and on every render. MeasurementDisplay and the annotation
 * list in ImageToolsToolbar therefore show REAL measurements.
 *
 * It subscribes to viewport-element registrations because React may run a
 * parent effect before the child (CornerstoneViewport) has registered its
 * element — see viewportRegistry.ts.
 */

import { useEffect, useRef } from 'react';
import { annotation, utilities as ToolUtilities, Enums as ToolEnums } from '@cornerstonejs/tools';
import { Enums as CoreEnums, eventTarget } from '@cornerstonejs/core';
import { useMeasurementStore } from '@/stores/measurementStore';
import { useViewerStore } from '@/stores/viewerStore';
import { serializeAnnotations, extractMeasurements } from '@/lib/cornerstone/annotation-sync';
import {
  getViewportElement,
  subscribeViewportElement,
  MAIN_VIEWPORT_ID,
} from '@/lib/cornerstone/viewportRegistry';

export function useMeasurementSync(viewportId: string = MAIN_VIEWPORT_ID): void {
  const imageId = useViewerStore((s) => s.currentImageId);
  const imageIdRef = useRef<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];

    const teardown = () => {
      while (cleanups.length) cleanups.pop()!();
    };

    const setup = () => {
      if (disposed) return;
      const element = getViewportElement(viewportId);
      if (!element) return; // retried when the viewport registers

      const refresh = () => {
        if (disposed) return;
        const serialized = serializeAnnotations(element);
        useMeasurementStore.getState().setAnnotations(serialized);
        useMeasurementStore.getState().setMeasurements(extractMeasurements(serialized));
      };

      const onAnnotationEvent = () => refresh();
      const onRendered = () => refresh();

      element.addEventListener(CoreEnums.Events.IMAGE_RENDERED, onRendered);
      eventTarget.addEventListener(ToolEnums.Events.ANNOTATION_COMPLETED, onAnnotationEvent);
      eventTarget.addEventListener(ToolEnums.Events.ANNOTATION_MODIFIED, onAnnotationEvent);
      eventTarget.addEventListener(ToolEnums.Events.ANNOTATION_REMOVED, onAnnotationEvent);

      cleanups.push(() => {
        element.removeEventListener(CoreEnums.Events.IMAGE_RENDERED, onRendered);
        eventTarget.removeEventListener(ToolEnums.Events.ANNOTATION_COMPLETED, onAnnotationEvent);
        eventTarget.removeEventListener(ToolEnums.Events.ANNOTATION_MODIFIED, onAnnotationEvent);
        eventTarget.removeEventListener(ToolEnums.Events.ANNOTATION_REMOVED, onAnnotationEvent);
      });

      // Initial + on image change (the element may have been re-created).
      if (imageIdRef.current !== imageId) {
        imageIdRef.current = imageId;
        refresh();
      }
    };

    setup();
    const unsubscribe = subscribeViewportElement(viewportId, () => {
      teardown();
      setup();
    });

    return () => {
      disposed = true;
      unsubscribe();
      teardown();
    };
  }, [viewportId, imageId]);
}

/** Select/deselect a Cornerstone annotation (highlights it on the viewport). */
export function highlightAnnotation(viewportId: string, annotationUID: string, selected: boolean): void {
  const element = getViewportElement(viewportId);
  try {
    if (selected) {
      annotation.selection.setAnnotationSelected(annotationUID, true);
    } else {
      annotation.selection.deselectAnnotation(annotationUID);
    }
    if (element) {
      ToolUtilities.triggerAnnotationRenderForViewportIds([viewportId]);
    }
  } catch (err) {
    console.warn('[measurementSync] highlight failed:', err);
  }
}

/** Remove a Cornerstone annotation (state + render). Backend syncs via ANNOTATION_REMOVED. */
export function removeCsAnnotation(viewportId: string, annotationUID: string): void {
  try {
    annotation.state.removeAnnotation(annotationUID);
    ToolUtilities.triggerAnnotationRenderForViewportIds([viewportId]);
  } catch (err) {
    console.warn('[measurementSync] remove failed:', err);
  }
}
