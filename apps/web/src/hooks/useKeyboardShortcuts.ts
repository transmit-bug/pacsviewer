import { useEffect, useCallback } from 'react';

interface KeyboardShortcuts {
  onToolSelect?: (tool: string) => void;
  onDeleteSelected?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitToWindow?: () => void;
  onRotateCW?: () => void;
  onRotateCCW?: () => void;
  onFlipH?: () => void;
  onFlipV?: () => void;
  onNextImage?: () => void;
  onPrevImage?: () => void;
  onToggleHelp?: () => void;
  onToggleEditor?: () => void;
  onEscape?: () => void;
}

const TOOL_SHORTCUTS: Record<string, string> = {
  '1': 'pan',
  '2': 'zoom',
  '3': 'windowLevel',
  '4': 'length',
  '5': 'angle',
  '6': 'probe',
  '7': 'annotate',
  '8': 'freehand',
};

export function useKeyboardShortcuts({
  onToolSelect,
  onDeleteSelected,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onFitToWindow,
  onRotateCW,
  onRotateCCW,
  onFlipH,
  onFlipV,
  onNextImage,
  onPrevImage,
  onToggleHelp,
  onToggleEditor,
  onEscape,
}: KeyboardShortcuts) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // Tool shortcuts (1-8)
      if (TOOL_SHORTCUTS[key] && !ctrl && !shift) {
        e.preventDefault();
        onToolSelect?.(TOOL_SHORTCUTS[key]);
        return;
      }

      // Delete
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        onDeleteSelected?.();
        return;
      }

      // Undo/Redo
      if (ctrl && key === 'z') {
        e.preventDefault();
        if (shift) {
          onRedo?.();
        } else {
          onUndo?.();
        }
        return;
      }

      if (ctrl && key === 'y') {
        e.preventDefault();
        onRedo?.();
        return;
      }

      // Zoom
      if (key === '+' || key === '=') {
        e.preventDefault();
        onZoomIn?.();
        return;
      }
      if (key === '-') {
        e.preventDefault();
        onZoomOut?.();
        return;
      }

      // Fit to window
      if (key === '0') {
        e.preventDefault();
        onFitToWindow?.();
        return;
      }

      // Rotate
      if (key === 'r' && !ctrl) {
        e.preventDefault();
        if (shift) {
          onRotateCCW?.();
        } else {
          onRotateCW?.();
        }
        return;
      }

      // Flip
      if (key === 'h' && !ctrl) {
        e.preventDefault();
        onFlipH?.();
        return;
      }
      if (key === 'v' && !ctrl) {
        e.preventDefault();
        onFlipV?.();
        return;
      }

      // Image navigation
      if (key === 'arrowright' || key === 'arrowdown') {
        e.preventDefault();
        onNextImage?.();
        return;
      }
      if (key === 'arrowleft' || key === 'arrowup') {
        e.preventDefault();
        onPrevImage?.();
        return;
      }

      // Help
      if (key === '?' || (key === '/' && shift)) {
        e.preventDefault();
        onToggleHelp?.();
        return;
      }

      // 编辑工作区 (⌘E) — 图层/滤镜/测量面板开关.
      // NOTE: ⌘K 已被全局搜索(GlobalSearch)占用,故用 ⌘E (#109 决议"⌘K 可达"的
      // 实现注记:工具栏"编辑"分组为主入口,⌘E 为键盘入口).
      if (ctrl && key === 'e') {
        e.preventDefault();
        onToggleEditor?.();
        return;
      }

      // Escape
      if (key === 'escape') {
        e.preventDefault();
        onEscape?.();
        return;
      }
    },
    [
      onToolSelect,
      onDeleteSelected,
      onUndo,
      onRedo,
      onZoomIn,
      onZoomOut,
      onFitToWindow,
      onRotateCW,
      onRotateCCW,
      onFlipH,
      onFlipV,
      onNextImage,
      onPrevImage,
      onToggleHelp,
      onToggleEditor,
      onEscape,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// Keyboard shortcuts help content
// categoryKey / descriptionKey are i18n keys (viewer.keyboard.*), translated
// at render time by KeyboardShortcutsHelp.
export const KEYBOARD_SHORTCUTS: {
  categoryKey: string;
  shortcuts: { key: string; descriptionKey: string }[];
}[] = [
  { categoryKey: 'viewer.keyboard.catTools', shortcuts: [
    { key: '1', descriptionKey: 'viewer.keyboard.descPan' },
    { key: '2', descriptionKey: 'viewer.keyboard.descZoom' },
    { key: '3', descriptionKey: 'viewer.keyboard.descWindowLevel' },
    { key: '4', descriptionKey: 'viewer.keyboard.descLength' },
    { key: '5', descriptionKey: 'viewer.keyboard.descAngle' },
    { key: '6', descriptionKey: 'viewer.keyboard.descProbe' },
    { key: '7', descriptionKey: 'viewer.keyboard.descAnnotate' },
    { key: '8', descriptionKey: 'viewer.keyboard.descBrush' },
  ]},
  { categoryKey: 'viewer.keyboard.catView', shortcuts: [
    { key: '+', descriptionKey: 'viewer.keyboard.descZoomIn' },
    { key: '-', descriptionKey: 'viewer.keyboard.descZoomOut' },
    { key: '0', descriptionKey: 'viewer.keyboard.descFit' },
    { key: 'R', descriptionKey: 'viewer.keyboard.descRotateCW' },
    { key: 'Shift+R', descriptionKey: 'viewer.keyboard.descRotateCCW' },
    { key: 'H', descriptionKey: 'viewer.keyboard.descFlipH' },
    { key: 'V', descriptionKey: 'viewer.keyboard.descFlipV' },
  ]},
  { categoryKey: 'viewer.keyboard.catNavigation', shortcuts: [
    { key: '← / ↑', descriptionKey: 'viewer.keyboard.descPrevImage' },
    { key: '→ / ↓', descriptionKey: 'viewer.keyboard.descNextImage' },
  ]},
  { categoryKey: 'viewer.keyboard.catEdit', shortcuts: [
    { key: '⌘E', descriptionKey: 'viewer.keyboard.descEditor' },
    { key: 'Delete', descriptionKey: 'viewer.keyboard.descDelete' },
    { key: 'Ctrl+Z', descriptionKey: 'viewer.keyboard.descUndo' },
    { key: 'Ctrl+Shift+Z', descriptionKey: 'viewer.keyboard.descRedo' },
  ]},
  { categoryKey: 'viewer.keyboard.catOther', shortcuts: [
    { key: '?', descriptionKey: 'viewer.keyboard.descHelp' },
    { key: 'Esc', descriptionKey: 'viewer.keyboard.descEscape' },
  ]},
];
