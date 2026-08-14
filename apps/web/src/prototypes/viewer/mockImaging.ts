/**
 * 🧪 PROTOTYPE — 扔弃代码。wayfinder #123「查看器深色工作台原型」。
 *
 * Canvas 生成假眼底/OCT 图像（无真实 DICOM、无 Cornerstone）。
 * 每次渲染按 (seriesId, slice) 缓存 dataURL —— 切层只命中缓存，保证
 * 原型交互流畅。实现 #126 时整包丢弃，换成 Cornerstone 真实渲染。
 */

export interface MockSeries {
  id: string;
  name: string;
  modality: 'OCT' | 'CFP' | 'OCTA';
  eye: string;
  sliceCount: number;
  kind: 'oct' | 'fundus' | 'thickness';
}

export const MOCK_SERIES: MockSeries[] = [
  { id: 'oct-macula', name: '黄斑 OCT B-scan', modality: 'OCT', eye: '右眼 OD', sliceCount: 128, kind: 'oct' },
  { id: 'cfp-color', name: '眼底彩照', modality: 'CFP', eye: '右眼 OD', sliceCount: 1, kind: 'fundus' },
  { id: 'octa-thickness', name: '视网膜厚度图', modality: 'OCTA', eye: '右眼 OD', sliceCount: 1, kind: 'thickness' },
];

export const MOCK_PATIENT = {
  name: '王小明',
  gender: '男',
  age: 56,
  id: 'P-2025-0438',
  studyDate: '2025-11-03',
  studyDesc: '黄斑 OCT 随访',
  physician: '李医生',
  hospital: '明瞳眼科中心',
};

const cache = new Map<string, string>();

function seededRand(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** classic jet colormap, t ∈ [0,1] */
function jet(t: number): [number, number, number] {
  const r = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 3)));
  const g = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 2)));
  const b = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 1)));
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/* ─── 眼底彩照 ─────────────────────────────────────────── */

function drawFundus(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const rnd = seededRand(seed);

  // 近黑底 + 脉络膜红调微光
  ctx.fillStyle = '#07080b';
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.52, 20, w * 0.5, h * 0.52, w * 0.78);
  glow.addColorStop(0, 'rgba(74, 42, 36, 0.5)');
  glow.addColorStop(0.62, 'rgba(32, 22, 24, 0.28)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // 脉络膜噪声纹理
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(${52 + rnd() * 44 | 0}, ${38 + rnd() * 34 | 0}, ${34 + rnd() * 30 | 0}, ${0.04 + rnd() * 0.1})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1.6, 1.6);
  }

  const discX = w * 0.41;
  const discY = h * 0.44;

  // 视盘（边缘神经纤维环亮、中央视杯暗）
  const discR = w * 0.052;
  const disc = ctx.createRadialGradient(discX, discY, 2, discX, discY, discR);
  disc.addColorStop(0, '#0c0a08');
  disc.addColorStop(0.45, '#1a1410');
  disc.addColorStop(0.82, '#6b5844');
  disc.addColorStop(1, '#2c221a');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(discX, discY, discR, 0, Math.PI * 2);
  ctx.fill();
  // 视杯
  ctx.fillStyle = '#0a0806';
  ctx.beginPath();
  ctx.arc(discX, discY, discR * 0.5, 0, Math.PI * 2);
  ctx.fill();
  // 筛板小孔
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = discR * 0.14 * Math.sqrt(rnd());
    ctx.fillStyle = `rgba(40, 30, 22, ${0.35 + rnd() * 0.3})`;
    ctx.fillRect(discX + Math.cos(a) * r * 2.4, discY + Math.sin(a) * r * 2.4, 1.1, 1.1);
  }

  // 血管：主支从视盘发出，渐细 + 血柱高光
  const vessels: [number, number, number, number, number, number, number][] = [
    // [ax, ay, bx, by, cx, cy, width]  quadratic bezier + 起始宽
    [1.0, 0.2, 1.35, 0.05, 1.6, -0.3, 3.6],
    [1.0, 0.35, 1.5, 0.45, 2.0, 0.55, 2.9],
    [1.0, -0.25, 1.25, -0.6, 1.55, -0.95, 2.6],
    [1.0, -0.1, 1.35, -0.45, 1.75, -0.75, 2.2],
    [1.0, 0.6, 1.4, 0.95, 1.7, 1.35, 2.4],
    [-1.0, 0.15, -1.5, 0.3, -2.05, 0.5, 3.2],
    [-1.0, -0.3, -1.45, -0.7, -1.95, -1.05, 2.7],
    [-1.0, 0.55, -1.4, 0.9, -1.8, 1.25, 2.1],
  ];
  const drawVessel = (vx: number, vy: number, cx: number, cy: number, width: number) => {
    const px = (t: number) => (1 - t) * (1 - t) * discX + 2 * (1 - t) * t * (discX + cx * discR * 2.2) + t * t * (discX + vx * w * 0.42);
    const py = (t: number) => (1 - t) * (1 - t) * discY + 2 * (1 - t) * t * (discY + cy * discR * 2.2) + t * t * (discY + vy * h * 0.42);
    ctx.lineCap = 'round';
    for (let seg = 0; seg < 7; seg++) {
      const t0 = seg / 7;
      const t1 = (seg + 1) / 7;
      ctx.strokeStyle = `rgba(22, 13, 11, ${0.78 * (1 - t0 * 0.55)})`;
      ctx.lineWidth = Math.max(0.6, width * (1 - t0 * 0.82));
      ctx.beginPath();
      ctx.moveTo(px(t0), py(t0));
      ctx.lineTo(px(t1), py(t1));
      ctx.stroke();
    }
    // 血柱高光
    for (let seg = 0; seg < 7; seg++) {
      const t0 = seg / 7;
      const t1 = (seg + 1) / 7;
      ctx.strokeStyle = `rgba(150, 96, 80, ${0.16 * (1 - t0 * 0.5)})`;
      ctx.lineWidth = Math.max(0.3, width * 0.3 * (1 - t0 * 0.8));
      ctx.beginPath();
      ctx.moveTo(px(t0), py(t0) - 0.8);
      ctx.lineTo(px(t1), py(t1) - 0.8);
      ctx.stroke();
    }
  };
  for (const [vx, vy, cx, cy, _ex, _ey, width] of vessels) {
    void _ex; void _ey;
    drawVessel(vx, vy, cx, cy, width);
  }
  // 二次小分支
  for (let i = 0; i < 10; i++) {
    const base = vessels[i % vessels.length];
    const off = (rnd() - 0.5) * 0.8;
    drawVessel(base[0] + off * 0.4, base[1] + off * 0.3, base[2] + 0.35, base[3] - 0.25, 1.4);
  }

  // 黄斑（中心凹暗区 + 中央反光点）
  const mx = w * 0.6;
  const my = h * 0.5;
  const mac = ctx.createRadialGradient(mx, my, 2, mx, my, w * 0.09);
  mac.addColorStop(0, 'rgba(16, 13, 11, 0.5)');
  mac.addColorStop(0.7, 'rgba(26, 20, 17, 0.32)');
  mac.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = mac;
  ctx.beginPath();
  ctx.arc(mx, my, w * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(200, 170, 130, 0.35)';
  ctx.beginPath();
  ctx.arc(mx, my, w * 0.012, 0, Math.PI * 2);
  ctx.fill();

  // 暗角（模拟眼底镜头）
  const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.34, w / 2, h / 2, w * 0.82);
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.58)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

/* ─── OCT B-scan（128 层，逐层相位/位置漂移） ───────────── */

function drawOctSlice(ctx: CanvasRenderingContext2D, w: number, h: number, slice: number, total: number, seed: number) {
  const rnd = seededRand(seed);
  const t = slice / Math.max(1, total - 1); // 0..1 扫描位置
  const phase = t * Math.PI * 2;

  ctx.fillStyle = '#04060a';
  ctx.fillRect(0, 0, w, h);

  // 玻璃体噪声 + 漂浮物（随层漂移）
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = `rgba(120, 140, 160, ${0.02 + rnd() * 0.05})`;
    ctx.fillRect(rnd() * w, rnd() * h * 0.34, 1.2, 1.2);
  }
  for (let i = 0; i < 5; i++) {
    const fx = ((rnd() + t * 0.22 + i * 0.21) % 1) * w;
    const fy = h * (0.05 + rnd() * 0.2 + Math.sin(phase + i * 2.1) * 0.02);
    const fr = 1.5 + rnd() * 3.5;
    const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
    fg.addColorStop(0, `rgba(200, 215, 230, ${0.35 + rnd() * 0.25})`);
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.fill();
  }

  // 扫描阴影伪影（随扫描位置漂移的暗柱）
  const shadowX = w * (0.12 + 0.76 * ((t * 1.7) % 1));
  const sh = ctx.createLinearGradient(shadowX - w * 0.05, 0, shadowX + w * 0.05, 0);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(0.5, 'rgba(0,0,0,0.35)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(shadowX - w * 0.05, 0, w * 0.1, h);

  // 层边界曲线（fovea 凹 + 波动 + 层间漂移）
  const foveaX = w * 0.52 + Math.sin(phase) * w * 0.06;
  const dip = (x: number) => Math.exp(-((x - foveaX) ** 2) / (2 * (w * 0.05) ** 2));
  const wave = (x: number, amp: number, k: number) => amp * Math.sin((x / w) * k * Math.PI * 2 + phase * 1.5);
  const ilmBase = h * 0.27 + wave(0, h * 0.008, 2.2);
  const rpeBase = h * 0.5 + wave(0, h * 0.01, 2.6);
  const ilmY = (x: number) => ilmBase + dip(x) * h * 0.085 + wave(x, h * 0.004, 3.4);
  const rpeY = (x: number) => rpeBase + dip(x) * h * 0.03 + wave(x, h * 0.006, 2.9);

  // 内层组织带（ILM→RPE 之间的分段填充）
  const bands: [number, number, string][] = [
    [0.02, 0.10, '#171d26'], // NFL+GCL
    [0.10, 0.20, '#10151d'], // IPL/INL
    [0.20, 0.34, '#0b0f16'], // OPL/ONL
    [0.34, 0.46, '#141b25'], // IS/OS（高反射区）
    [0.46, 0.96, '#0a0e14'], // RPE 下/脉络膜上
  ];
  for (const [a, b, color] of bands) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 3) {
      const y = ilmY(x) + (rpeY(x) - ilmY(x)) * a;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    for (let x = w; x >= 0; x -= 3) {
      const y = ilmY(x) + (rpeY(x) - ilmY(x)) * b;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  // 组织纹理（低频颗粒）
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * w;
    const y = ilmY(x) + rnd() * (rpeY(x) - ilmY(x));
    ctx.fillStyle = `rgba(140, 160, 180, ${0.02 + rnd() * 0.06})`;
    ctx.fillRect(x, y, 1.3, 1.3);
  }

  // 视网膜厚度测线（ILM/RPE 高亮描线，模拟分割层）
  ctx.lineWidth = 1.1;
  for (const [yf, color] of [
    [ilmY, 'rgba(140, 200, 210, 0.75)'],
    [rpeY, 'rgba(196, 208, 216, 0.9)'],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const y = yf(x);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // RPE 亮线下缘微光
  ctx.strokeStyle = 'rgba(230, 240, 245, 0.35)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const y = rpeY(x) + 2.2;
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  // 脉络膜噪声
  for (let i = 0; i < 3200; i++) {
    const x = rnd() * w;
    const y = rpeY(x) + 2 + rnd() * (h - rpeY(x) - 4);
    ctx.fillStyle = `rgba(90, 110, 130, ${0.02 + rnd() * 0.05})`;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
}

/* ─── 视网膜厚度图（en-face 伪彩 + ETDRS 环） ───────────── */

function drawThickness(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const rnd = seededRand(seed);
  const fx = w * 0.55;
  const fy = h * 0.5;
  const img = ctx.createImageData(w, h);
  const data = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - fx) / (w * 0.44);
      const dy = (y - fy) / (h * 0.44);
      const r = Math.sqrt(dx * dx + dy * dy);
      // 厚度剖面：中心凹薄 → 旁中心厚 → 周边略降 + 噪声
      let v = Math.exp(-((r * 2.4) ** 2)) * 0.25 + Math.exp(-(((r - 0.42) * 2.1) ** 2)) * 0.85 + 0.12;
      v += (rnd() - 0.5) * 0.09;
      v = Math.max(0, Math.min(1, v));
      const [cr, cg, cb] = jet(v);
      const i = (y * w + x) * 4;
      data[i] = cr; data[i + 1] = cg; data[i + 2] = cb; data[i + 3] = 235;
    }
  }
  ctx.putImageData(img, 0, 0);

  // ETDRS 网格：1/3/6mm 环 + 十字线
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 1;
  for (const [mm, rr] of [[1, 1], [3, 3], [6, 6]] as const) {
    void mm;
    ctx.beginPath();
    ctx.arc(fx, fy, (rr / 6) * w * 0.3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.beginPath();
  ctx.moveTo(fx, 0); ctx.lineTo(fx, h);
  ctx.moveTo(0, fy); ctx.lineTo(w, fy);
  ctx.stroke();

  // 暗角
  const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.36, w / 2, h / 2, w * 0.85);
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

/* ─── 对外入口 ─────────────────────────────────────────── */

export function getMockImageUrl(seriesId: string, slice: number): string {
  const key = `${seriesId}:${slice}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const series = MOCK_SERIES.find((s) => s.id === seriesId) ?? MOCK_SERIES[0];
  const w = series.kind === 'oct' ? 640 : 512;
  const h = series.kind === 'oct' ? 420 : 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  if (series.kind === 'fundus') drawFundus(ctx, w, h, 7);
  else if (series.kind === 'oct') drawOctSlice(ctx, w, h, slice, series.sliceCount, slice + 11);
  else drawThickness(ctx, w, h, 3);

  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** OCT 某层的信号强度（模拟，随层波动） */
export function mockSignalStrength(slice: number): number {
  return Math.round(58 + 8 * Math.sin(slice * 0.37) + 4 * Math.cos(slice * 0.13));
}
