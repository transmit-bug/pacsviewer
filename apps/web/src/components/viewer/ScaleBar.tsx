/**
 * ScaleBar — 校准比例尺 (遗留缺口 2, 查看器 HUD / OCT 工作台共用)。
 *
 * 图像有真实像素间距时, 基于 Cornerstone 视口 worldToCanvas 世界坐标测量
 * (px/mm 随缩放更新, 平移/旋转不影响长度); 无像素间距 (未校准上传图) 时
 * 回退 display-relative 固定 5mm (HUD 惯例)。
 */
import { useMemo } from 'react';
import { useViewerStore } from '@/stores/viewerStore';
import { computeScaleBar } from '@/lib/cornerstone/scale-bar';

interface ScaleBarProps {
  /** 主视口的 viewportId (默认 MAIN_VIEWPORT_ID 由调用方传入) */
  viewportId?: string;
}

export function ScaleBar({ viewportId }: ScaleBarProps) {
  const { viewport, dicomMetadata } = useViewerStore();

  // 校准比例尺: 图像有真实像素间距时按世界坐标测量 (随缩放更新);
  // 无像素间距 (未校准) 回退 display-relative 固定 5mm。
  const scaleBar = useMemo(() => {
    if (!viewportId || !dicomMetadata?.pixelSpacing) return null;
    return computeScaleBar(viewportId);
  }, [viewportId, dicomMetadata, viewport.zoom]);

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-end">
        <div className="h-1.5 w-px bg-white/80" />
        {/* 校准宽度用内联 style 覆盖 w-12 回退宽度 */}
        <div
          className="h-px w-12 bg-white/80"
          style={scaleBar ? { width: scaleBar.px } : undefined}
        />
        <div className="h-1.5 w-px bg-white/80" />
      </div>
      <span className="ws-hud-text hud-numeric mt-0.5 text-[9px] text-white/70">
        {scaleBar ? `${scaleBar.mm} mm` : '5 mm'}
      </span>
    </div>
  );
}
