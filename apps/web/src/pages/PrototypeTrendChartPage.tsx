// 🧪 PROTOTYPE — 扔弃代码。为 wayfinder 票 #90「纵向趋势图形态」做的交互原型。
// 问题: 趋势图应该长什么样?三个截然不同的变体,?variant=1|2|3 切换。
// 数据是内存假数据(某青光眼随访患者 5 次检查),无持久化。验证后删掉或收敛进正式实现。
import { useSearchParams } from 'react-router-dom';

// ─── 假数据 ────────────────────────────────────────────────
interface MeasurementDef {
  key: string;
  name: string;
  unit: string;
  dir: 'up' | 'down'; // 哪个方向是恶化
}
const DEFS: MeasurementDef[] = [
  { key: 'rnfl', name: 'RNFL 厚度', unit: 'μm', dir: 'down' },
  { key: 'fovea', name: '黄斑中心凹厚度', unit: 'μm', dir: 'down' },
  { key: 'cd', name: 'C/D 比', unit: '', dir: 'up' },
  { key: 'iop', name: '眼压', unit: 'mmHg', dir: 'up' },
];

interface Visit {
  date: string;
  label: string;
  values: Record<string, number>;
}
const VISITS: Visit[] = [
  { date: '2025-01', label: '基线', values: { rnfl: 92, fovea: 245, cd: 0.42, iop: 17 } },
  { date: '2025-03', label: '+2月', values: { rnfl: 88, fovea: 240, cd: 0.45, iop: 16 } },
  { date: '2025-05', label: '+4月', values: { rnfl: 85, fovea: 233, cd: 0.48, iop: 18 } },
  { date: '2025-08', label: '+7月', values: { rnfl: 79, fovea: 226, cd: 0.53, iop: 19 } },
  { date: '2025-11', label: '+10月', values: { rnfl: 72, fovea: 218, cd: 0.58, iop: 20 } },
];

const series = (key: string) => VISITS.map((v) => v.values[key]);

function trendOf(key: string): 'improving' | 'stable' | 'worsening' {
  const vals = series(key);
  const first = vals[0];
  const last = vals[vals.length - 1];
  const pct = first ? Math.abs((last - first) / first) * 100 : 0;
  if (pct <= 5) return 'stable';
  const def = DEFS.find((d) => d.key === key)!;
  const worse = def.dir === 'down' ? last < first : last > first;
  return worse ? 'worsening' : 'improving';
}

const TREND_META: Record<string, { label: string; color: string }> = {
  improving: { label: '好转', color: '#16a34a' },
  stable: { label: '稳定', color: '#64748b' },
  worsening: { label: '恶化', color: '#dc2626' },
};

const COLORS = ['#2563eb', '#7c3aed', '#ea580c', '#0891b2'];

// ─── SVG 折线工具 ──────────────────────────────────────────
function polyPoints(vals: number[], w: number, h: number, pad = 6): string {
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  return vals
    .map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function Sparkline({ vals, color }: { vals: number[]; color: string }) {
  return (
    <svg viewBox="0 0 120 36" className="w-full h-9">
      <polyline points={polyPoints(vals, 120, 36)} fill="none" stroke={color} strokeWidth="2" />
      {vals.map((_, i) => {
        const pts = polyPoints(vals, 120, 36).split(' ').map((p) => p.split(','));
        return <circle key={i} cx={pts[i][0]} cy={pts[i][1]} r="2.4" fill={color} />;
      })}
    </svg>
  );
}

// ─── 变体 1: 经典复合折线(所有测量叠一张图,各自归一化) ────────
function VariantAllInOne() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-sm text-slate-500 mb-1">所有测量叠加一张图(各系列独立归一化缩放)</div>
      <div className="border rounded-xl p-4 bg-white">
        <svg viewBox="0 0 640 300" className="w-full">
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1="36" x2="620" y1={30 + i * 60} y2={30 + i * 60} stroke="#e2e8f0" />
          ))}
          {VISITS.map((v, i) => {
            const x = 36 + (i / (VISITS.length - 1)) * 584;
            return (
              <text key={i} x={x} y="292" textAnchor="middle" fontSize="11" fill="#64748b">
                {v.date}
              </text>
            );
          })}
          {DEFS.map((def, di) => (
            <polyline
              key={def.key}
              points={polyPoints(series(def.key), 640, 300, 30)}
              fill="none"
              stroke={COLORS[di]}
              strokeWidth="2.5"
            />
          ))}
        </svg>
        <div className="flex flex-wrap gap-3 mt-2">
          {DEFS.map((def, di) => (
            <span key={def.key} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <span className="w-3 h-1 rounded" style={{ background: COLORS[di] }} />
              {def.name} ({def.unit}) · {TREND_META[trendOf(def.key)].label}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
        ⚠️ 问题: RNFL(μm)、C/D(比值)、眼压(mmHg)量纲不同,硬叠一张图只能各自归一化,纵轴失去意义 —— 这正是变体 2 要解决的。
      </div>
    </div>
  );
}

// ─── 变体 2: 分面网格(每项测量一张小图,真实单位) ────────────
function VariantFacets() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-sm text-slate-500 mb-1">分面网格 —— 每项测量独立小图,真实单位 + 基线虚线 + 趋势标记</div>
      <div className="grid grid-cols-2 gap-3">
        {DEFS.map((def, di) => {
          const vals = series(def.key);
          const t = trendOf(def.key);
          const baseline = vals[0];
          const last = vals[vals.length - 1];
          const delta = ((last - baseline) / baseline) * 100;
          const w = 300;
          const h = 130;
          const pts = polyPoints(vals, w, h, 24);
          const baseY = 24 + (1 - (baseline - Math.min(...vals)) / (Math.max(...vals) - Math.min(...vals) || 1)) * (h - 48);
          const dotPts = pts.split(' ').map((p) => p.split(',').map(Number));
          return (
            <div key={def.key} className="border rounded-xl p-3 bg-white">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{def.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full text-white" style={{ background: TREND_META[t].color }}>
                  {TREND_META[t].label}
                </span>
              </div>
              <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
                <line x1="24" x2={w - 6} y1={baseY} y2={baseY} stroke="#94a3b8" strokeDasharray="4 3" strokeWidth="1" />
                <text x={w - 6} y={baseY - 3} textAnchor="end" fontSize="9" fill="#94a3b8">基线</text>
                <polyline points={pts} fill="none" stroke={COLORS[di]} strokeWidth="2.2" />
                {dotPts.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={COLORS[di]} />
                ))}
              </svg>
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>
                  {VISITS[0].date} {baseline} → {VISITS[VISITS.length - 1].date} {last} {def.unit}
                </span>
                <span className={Math.abs(delta) > 5 ? 'font-semibold' : ''}>
                  {delta >= 0 ? '+' : ''}
                  {delta.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 变体 3: KPI 卡 + 迷你趋势(报告/一览风格) ───────────────
function VariantKpis() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-sm text-slate-500 mb-1">KPI 卡 —— 当前值 + 相对基线变化 + 迷你趋势(一眼扫完,适合报告页)</div>
      <div className="grid grid-cols-2 gap-3">
        {DEFS.map((def, di) => {
          const vals = series(def.key);
          const t = trendOf(def.key);
          const baseline = vals[0];
          const last = vals[vals.length - 1];
          const pct = ((last - baseline) / baseline) * 100;
          return (
            <div key={def.key} className="border rounded-xl p-4 bg-white">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{def.name}</span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full text-white"
                  style={{ background: TREND_META[t].color }}
                >
                  {TREND_META[t].label}
                </span>
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-semibold tabular-nums">{last}</span>
                <span className="text-sm text-slate-400">{def.unit}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className={pct > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                  {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% vs 基线({baseline})
                </span>
              </div>
              <Sparkline vals={vals} color={COLORS[di]} />
              <div className="text-[10px] text-slate-400 text-center -mt-1">{VISITS.map((v) => v.date).join(' → ')}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 页面: 变体切换 + 状态展示 ──────────────────────────────
const VARIANTS = [
  { id: '1', name: '复合折线', desc: '所有测量一张图' },
  { id: '2', name: '分面网格', desc: '每项独立小图+真实单位' },
  { id: '3', name: 'KPI 卡', desc: '当前值+变化+迷你趋势' },
];

export default function PrototypeTrendChartPage() {
  const [params, setParams] = useSearchParams();
  const variant = params.get('variant') || '1';

  return (
    <div className="min-h-screen bg-slate-100 p-6 pb-24">
      <div className="max-w-3xl mx-auto mb-4">
        <div className="inline-block bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded">
          🧪 PROTOTYPE — wayfinder #90 趋势图形态(扔弃代码)
        </div>
        <h1 className="text-xl font-semibold mt-2">随访趋势图:哪个形态对?</h1>
        <p className="text-sm text-slate-500">假数据: 青光眼随访 5 次检查(2025-01 → 2025-11)。底部条切换变体,下方展示驱动数据的完整状态。</p>
      </div>

      {variant === '1' && <VariantAllInOne />}
      {variant === '2' && <VariantFacets />}
      {variant === '3' && <VariantKpis />}

      {/* 完整状态(规则: 变体切换即展示状态) */}
      <div className="max-w-3xl mx-auto mt-6">
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer select-none">显示底层数据(测量点状态)</summary>
          <table className="w-full mt-2 border-collapse">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="border p-1">检查</th>
                {DEFS.map((d) => (
                  <th key={d.key} className="border p-1">
                    {d.name}({d.unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VISITS.map((v, i) => (
                <tr key={i}>
                  <td className="border p-1 font-medium">{v.date} {i === 0 ? '(基线)' : ''}</td>
                  {DEFS.map((d) => (
                    <td className="border p-1 tabular-nums" key={d.key}>
                      {v.values[d.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1">
            趋势判定: {DEFS.map((d) => `${d.name}=${TREND_META[trendOf(d.key)].label}`).join(', ')} · 阈值 5%
          </div>
        </details>
      </div>

      {/* 浮动底部切换条 */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white border shadow-lg rounded-full px-2 py-1.5 flex gap-1">
        {VARIANTS.map((v) => (
          <button
            key={v.id}
            onClick={() => setParams({ variant: v.id })}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              variant === v.id ? 'bg-purple-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={v.desc}
          >
            {v.name}
          </button>
        ))}
      </div>
    </div>
  );
}
