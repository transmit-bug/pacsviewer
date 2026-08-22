// 🧪 PROTOTYPE — 扔弃代码。为 wayfinder 票 #88「对比视图 MVP 交互形态」做的交互原型。
// 回答: 并排/叠加/滑块三种模式 + 多视口同步(缩放/平移/窗宽窗位)+ 叠加混合 + 对比中标注,交互手感如何?
// 无 Cornerstone、无后端 —— 占位图像 + 内存状态,全部交互在浏览器内模拟。验证后删掉或收敛进正式实现。
import { useState, useCallback, useRef } from 'react';

type Mode = 'side' | 'overlay' | 'slider';
type Blend = 'normal' | 'difference' | 'lighten' | 'darken';
interface Line {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const MODES: { id: Mode; name: string; desc: string }[] = [
  { id: 'side', name: '并排', desc: '双面板,同步或异步' },
  { id: 'overlay', name: '叠加', desc: '单面板半透明混合' },
  { id: 'slider', name: '滑块', desc: '拖动擦除分割线' },
];
const BLENDS: { id: Blend; name: string }[] = [
  { id: 'normal', name: '正常' },
  { id: 'difference', name: '差值' },
  { id: 'lighten', name: '变亮' },
  { id: 'darken', name: '变暗' },
];

// 占位"图像": CSS 图案区分基线/对比
function MockImage({ kind }: { kind: 'base' | 'comp' }) {
  const base =
    'repeating-radial-gradient(circle at 30% 40%, rgba(255,255,255,.35) 0 6px, transparent 6px 18px), radial-gradient(circle at 65% 55%, rgba(120,180,255,.5) 0 40px, transparent 60px)';
  const comp =
    'repeating-radial-gradient(circle at 30% 40%, rgba(255,255,255,.3) 0 8px, transparent 8px 22px), radial-gradient(circle at 65% 55%, rgba(255,140,120,.55) 0 30px, transparent 50px)';
  return <div className="absolute inset-0" style={{ background: kind === 'base' ? base : comp }} />;
}

export default function PrototypeComparisonPage() {
  const [mode, setMode] = useState<Mode>('side');
  const [sync, setSync] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [wl, setWl] = useState(0); // 窗位 -100..100
  const [ww, setWw] = useState(100); // 窗宽 0..200
  const [opacity, setOpacity] = useState(0.5);
  const [blend, setBlend] = useState<Blend>('normal');
  const [split, setSplit] = useState(50); // 滑块分割位置 %
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drawing, setDrawing] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [status, setStatus] = useState('');
  const nextId = useRef(1);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const drawRef = useRef<{ x: number; y: number } | null>(null);

  // 面板拖拽: 同步时平移镜像;测量模式下画线
  const onPanelMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (drawing) {
        const r = e.currentTarget.getBoundingClientRect();
        drawRef.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
      } else {
        dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      }
    },
    [drawing, pan]
  );
  const onPanelMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (drawRef.current) {
        const r = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        const id = nextId.current++;
        setLines((ls) => [...ls, { id, x1: drawRef.current!.x, y1: drawRef.current!.y, x2: x, y2: y }]);
        drawRef.current = { x, y };
      } else if (dragRef.current) {
        const nx = dragRef.current.panX + (e.clientX - dragRef.current.x);
        const ny = dragRef.current.panY + (e.clientY - dragRef.current.y);
        setPan({ x: nx, y: ny });
      }
    },
    []
  );
  const endDrag = useCallback(() => {
    dragRef.current = null;
    drawRef.current = null;
  }, []);

  const panelStyle = (layer: 'base' | 'comp') => {
    const brightness = 100 + wl;
    const contrast = 100 + (ww - 100) / 2;
    const blendCss: React.CSSProperties =
      layer === 'comp'
        ? { mixBlendMode: blend === 'normal' ? 'normal' : blend, opacity: blend === 'normal' ? opacity : 1 }
        : {};
    return {
      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
      filter: `brightness(${brightness}%) contrast(${contrast}%)`,
      ...blendCss,
    } as React.CSSProperties;
  };

  const state = { mode, sync, zoom, wl, ww, opacity, blend, split, pan, drawing, lines: lines.length };
  const stateJson = JSON.stringify(state, null, 2);

  return (
    <div className="min-h-screen bg-slate-100 p-6 pb-32">
      <div className="max-w-4xl mx-auto mb-3">
        <div className="inline-block bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded">
          🧪 PROTOTYPE — wayfinder #88 对比视图交互(扔弃代码)
        </div>
        <h1 className="text-xl font-semibold mt-2">对比视图:三种模式 + 同步交互手感</h1>
        <p className="text-sm text-slate-500">占位图模拟基线(2025-01)vs 对比(2025-11)。拖拽平移 / 滚轮缩放 / 滑杆调窗宽窗位 / 同步开关 / 测量模式画线。</p>
      </div>

      {/* 模式切换 */}
      <div className="max-w-4xl mx-auto flex gap-2 mb-3 flex-wrap">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              setMode(m.id);
              setStatus(`切换到「${m.name}」`);
            }}
            className={`px-3 py-1.5 rounded-full text-sm ${mode === m.id ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border'}`}
            title={m.desc}
          >
            {m.name}
          </button>
        ))}
        <span className="text-xs text-slate-400 self-center ml-1">{MODES.find((m) => m.id === mode)?.desc}</span>
      </div>

      {/* 控制条 */}
      <div className="max-w-4xl mx-auto bg-white border rounded-xl p-3 mb-3 flex flex-wrap gap-x-5 gap-y-2 text-xs items-center">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} />
          同步操作
        </label>
        <label className="flex items-center gap-1.5">
          缩放 {zoom.toFixed(2)}x
          <input type="range" min={0.5} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5">
          窗位 {wl}
          <input type="range" min={-100} max={100} value={wl} onChange={(e) => setWl(+e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5">
          窗宽 {ww}
          <input type="range" min={20} max={200} value={ww} onChange={(e) => setWw(+e.target.value)} />
        </label>
        {mode === 'overlay' && (
          <>
            <label className="flex items-center gap-1.5">
              透明度 {Math.round(opacity * 100)}%
              <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} />
            </label>
            <select value={blend} onChange={(e) => setBlend(e.target.value as Blend)} className="border rounded px-1 py-0.5">
              {BLENDS.map((b) => (
                <option key={b.id} value={b.id}>
                  混合: {b.name}
                </option>
              ))}
            </select>
          </>
        )}
        <button
          onClick={() => {
            setDrawing((d) => !d);
            setStatus(drawing ? '退出测量' : '测量模式: 在面板上拖拽画长度线(镜像到两个面板)');
          }}
          className={`px-2 py-1 rounded ${drawing ? 'bg-rose-600 text-white' : 'bg-slate-100'}`}
        >
          {drawing ? '⏹ 测量中…' : '📏 测量'}
        </button>
        <button
          onClick={() => {
            setLines([]);
            setPan({ x: 0, y: 0 });
            setZoom(1);
            setStatus('已重置');
          }}
          className="px-2 py-1 rounded bg-slate-100"
        >
          重置
        </button>
      </div>

      {/* 视图区 */}
      <div className="max-w-4xl mx-auto">
        <div className="relative aspect-[16/9] bg-black rounded-xl overflow-hidden select-none" style={{ touchAction: 'none' }}>
          {mode === 'side' && (
            <div className="absolute inset-0 flex">
              <div
                className="relative w-1/2 h-full overflow-hidden cursor-grab active:cursor-grabbing"
                onMouseDown={onPanelMouseDown}
                onMouseMove={onPanelMouseMove}
                onMouseUp={endDrag}
                onMouseLeave={endDrag}
              >
                <MockImage kind="base" />
                <div style={panelStyle('base')} className="absolute inset-0">
                  <MockImage kind="base" />
                </div>
                <span className="absolute top-2 left-2 text-xs text-white/80 bg-black/40 rounded px-1.5 py-0.5">基线 2025-01</span>
              </div>
              <div
                className="relative w-1/2 h-full overflow-hidden cursor-grab active:cursor-grabbing"
                onMouseDown={onPanelMouseDown}
                onMouseMove={onPanelMouseMove}
                onMouseUp={endDrag}
                onMouseLeave={endDrag}
              >
                <MockImage kind="comp" />
                <div style={panelStyle('comp')} className="absolute inset-0">
                  <MockImage kind="comp" />
                </div>
                <span className="absolute top-2 left-2 text-xs text-white/80 bg-black/40 rounded px-1.5 py-0.5">对比 2025-11</span>
              </div>
            </div>
          )}

          {mode === 'overlay' && (
            <div
              className="absolute inset-0 cursor-grab active:cursor-grabbing"
              onMouseDown={onPanelMouseDown}
              onMouseMove={onPanelMouseMove}
              onMouseUp={endDrag}
              onMouseLeave={endDrag}
            >
              <MockImage kind="base" />
              <div style={panelStyle('base')} className="absolute inset-0">
                <MockImage kind="base" />
              </div>
              <div style={panelStyle('comp')} className="absolute inset-0">
                <MockImage kind="comp" />
              </div>
              <span className="absolute top-2 left-2 text-xs text-white/80 bg-black/40 rounded px-1.5 py-0.5">
                叠加 · {BLENDS.find((b) => b.id === blend)?.name} · {Math.round(opacity * 100)}%
              </span>
            </div>
          )}

          {mode === 'slider' && (
            <div
              className="absolute inset-0 cursor-grab active:cursor-grabbing"
              onMouseDown={onPanelMouseDown}
              onMouseMove={onPanelMouseMove}
              onMouseUp={endDrag}
              onMouseLeave={endDrag}
            >
              <MockImage kind="base" />
              <div style={{ ...panelStyle('base'), clipPath: `inset(0 ${100 - split}% 0 0)` }} className="absolute inset-0">
                <MockImage kind="base" />
              </div>
              <div style={{ ...panelStyle('comp'), clipPath: `inset(0 0 0 ${split}%)` }} className="absolute inset-0">
                <MockImage kind="comp" />
              </div>
              {/* 分割线 */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-amber-400 cursor-ew-resize z-10"
                style={{ left: `${split}%` }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const move = (ev: MouseEvent) => setSplit(Math.max(2, Math.min(98, (ev.clientX / (e.currentTarget.parentElement!.getBoundingClientRect().width)) * 100)));
                  const up = () => {
                    window.removeEventListener('mousemove', move);
                    window.removeEventListener('mouseup', up);
                  };
                  window.addEventListener('mousemove', move);
                  window.addEventListener('mouseup', up);
                }}
              />
              <span className="absolute top-2 left-2 text-xs text-white/80 bg-black/40 rounded px-1.5 py-0.5">← 基线 | 对比 → 拖动分割线</span>
            </div>
          )}

          {/* 标注层(镜像到全屏坐标) */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
            {lines.map((l) => (
              <g key={l.id}>
                <line
                  x1={`${l.x1 * 100}%`}
                  y1={`${l.y1 * 100}%`}
                  x2={`${l.x2 * 100}%`}
                  y2={`${l.y2 * 100}%`}
                  stroke="#fbbf24"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}
          </svg>
        </div>

        {/* 状态展示 */}
        <div className="mt-3">
          <details open={false} className="text-xs">
            <summary className="cursor-pointer text-slate-500 select-none">完整状态(每次交互后更新)</summary>
            <pre className="mt-1 bg-slate-900 text-emerald-300 rounded p-3 overflow-auto">{stateJson}</pre>
          </details>
          {status && <div className="text-xs text-slate-500 mt-1">ℹ️ {status}</div>}
        </div>
      </div>

      {/* 说明 */}
      <div className="max-w-4xl mx-auto mt-4 text-xs text-slate-500 space-y-1">
        <div>🧪 原型聚焦交互手感,占位图为 CSS 图案,非真实影像。同步开关仅演示: 关闭后平移/缩放各自独立(当前版本缩放/窗宽窗位是共享滑杆,模拟"同步",真实实现需双向镜像)。</div>
        <div>要验证的问题: ① 三种模式切换流畅吗? ② 同步的粒度(缩放/平移/窗宽窗位哪些该同步、哪些不该) ③ 叠加的混合模式够吗? ④ 对比中测量是否需要? ⑤ 滑块分割线的交互手感。</div>
      </div>
    </div>
  );
}
