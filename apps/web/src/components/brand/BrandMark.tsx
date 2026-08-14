import { cn } from '@/lib/utils';

/**
 * 品牌 Logo — 瞳孔/光圈意象 (pure SVG, no image assets)。
 * 意象: 外圈光圈刻度(镜头) + 六瓣光圈叶片 + 虹膜渐变 + 瞳孔 + 高光。
 * 配色取品牌 teal (#2DD4BF → #14B8A6 系)。
 *
 * 由登录页内联 SVG 提取，供登录页 / 品牌加载页 / 空态复用。
 * uniqueId 用于避免同一页面多次渲染时 SVG 渐变 id 冲突。
 */
export function BrandMark({
  className,
  uniqueId = 'brand-iris',
  animate = false,
}: {
  className?: string;
  /** SVG 渐变 id 前缀（同页多处渲染时需区分） */
  uniqueId?: string;
  /** 外圈刻度是否带缓慢旋转动画（登录页/加载页使用） */
  animate?: boolean;
}) {
  // 六瓣光圈叶片 (梯形, 60° 旋转排布, 形成镜头虹膜)
  const blades = Array.from({ length: 6 }).map((_, i) => {
    const rad = (i * 60) * (Math.PI / 180);
    const a = rad - Math.PI / 6;
    const b = rad + Math.PI / 6;
    const pt = (r: number, ang: number) =>
      `${(48 + r * Math.sin(ang)).toFixed(1)},${(48 - r * Math.cos(ang)).toFixed(1)}`;
    return `${pt(13, a)} ${pt(13, b)} ${pt(31, b)} ${pt(31, a)}`;
  });

  return (
    <svg viewBox="0 0 96 96" className={cn('h-24 w-24', className)} fill="none" aria-hidden="true">
      <defs>
        <radialGradient id={`${uniqueId}-iris`} cx="40%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#2dd4bf" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 外圈光圈刻度 (缓慢旋转, 镜头环意象) */}
      {animate && (
        <g className="[transform-origin:48px_48px] animate-[spin_60s_linear_infinite]">
          {Array.from({ length: 24 }).map((_, i) => (
            <line
              key={i}
              x1="48"
              y1="6"
              x2="48"
              y2={i % 3 === 0 ? 12 : 10}
              stroke="#2dd4bf"
              strokeOpacity={i % 6 === 0 ? 0.7 : 0.28}
              strokeWidth={i % 6 === 0 ? 1.6 : 1}
              transform={`rotate(${i * 15} 48 48)`}
            />
          ))}
        </g>
      )}

      {/* 虹膜 */}
      <circle cx="48" cy="48" r="33" fill={`url(#${uniqueId}-iris)`} />
      <circle cx="48" cy="48" r="38" stroke="#2dd4bf" strokeOpacity="0.5" strokeWidth="1.2" />
      <circle cx="48" cy="48" r="30" stroke="#2dd4bf" strokeOpacity="0.22" strokeWidth="1" />

      {/* 光圈叶片 (镜头虹膜) */}
      {blades.map((pts, i) => (
        <polygon
          key={i}
          points={pts}
          fill="#14b8a6"
          fillOpacity="0.22"
          stroke="#2dd4bf"
          strokeOpacity="0.45"
          strokeWidth="0.8"
        />
      ))}

      {/* 瞳孔 + 高光 */}
      <circle cx="48" cy="48" r="9" fill="#0b0e13" stroke="#5eead4" strokeWidth="1.4" />
      <circle cx="44.5" cy="44.5" r="2.8" fill="#ffffff" fillOpacity="0.85" />
      <circle cx="41" cy="48" r="1.3" fill="#ffffff" fillOpacity="0.4" />
    </svg>
  );
}
