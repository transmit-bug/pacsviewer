import { BrandMark } from '@/components/brand/BrandMark';

/**
 * 品牌加载页 — 全屏首帧产品标识 (明瞳 mark + 缓慢光圈旋转 + 细加载条)。
 * 深色 cinematic 风: 近黑底 + 低照度 teal 辉光, 与登录页同源。
 * 用于应用启动 boot / 路由级 Suspense fallback。
 */
export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      {/* 环境氛围: 近黑底 + 低照度 teal 辉光 (cinematic) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-400/[0.07] blur-[110px]" />
      </div>

      <div className="relative flex flex-col items-center">
        <div className="drop-shadow-[0_0_28px_hsl(var(--primary)/0.45)]">
          <BrandMark className="h-20 w-20" animate uniqueId="boot-iris" />
        </div>

        <h1 className="mt-5 text-3xl font-bold leading-none tracking-tight text-foreground">
          明瞳
        </h1>
        <p className="mt-2.5 text-[10px] font-medium uppercase tracking-[0.42em] text-muted-foreground">
          PACS Viewer
        </p>
        <div className="mx-auto mt-4 h-px w-14 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        {/* 细加载条: 品牌色扫过 */}
        <div className="mt-8 h-0.5 w-40 overflow-hidden rounded-full bg-muted">
          <div className="loading-bar h-full w-1/2 rounded-full bg-primary/80" />
        </div>
      </div>
    </div>
  );
}
