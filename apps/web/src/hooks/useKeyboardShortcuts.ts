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
      onEscape,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// Keyboard shortcuts help content
export const KEYBOARD_SHORTCUTS = [
  { category: '工具', shortcuts: [
    { key: '1', description: '平移' },
    { key: '2', description: '缩放' },
    { key: '3', description: '窗宽窗位' },
    { key: '4', description: '长度测量' },
    { key: '5', description: '角度测量' },
    { key: '6', description: '像素探针' },
    { key: '7', description: '标注' },
    { key: '8', description: '画笔' },
  ]},
  { category: '视图', shortcuts: [
    { key: '+', description: '放大' },
    { key: '-', description: '缩小' },
    { key: '0', description: '适配窗口' },
    { key: 'R', description: '顺时针旋转' },
    { key: 'Shift+R', description: '逆时针旋转' },
    { key: 'H', description: '水平翻转' },
    { key: 'V', description: '垂直翻转' },
  ]},
  { category: '导航', shortcuts: [
    { key: '← / ↑', description: '上一张图像' },
    { key: '→ / ↓', description: '下一张图像' },
  ]},
  { category: '编辑', shortcuts: [
    { key: 'Delete', description: '删除选中标注' },
    { key: 'Ctrl+Z', description: '撤销' },
    { key: 'Ctrl+Shift+Z', description: '重做' },
  ]},
  { category: '其他', shortcuts: [
    { key: '?', description: '显示快捷键帮助' },
    { key: 'Esc', description: '取消当前操作' },
  ]},
];
