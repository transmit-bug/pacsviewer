# 图像滤镜的 Web 端实现路径调研

> Research ticket: transmit-bug/pacsviewer #107（只读调研，未修改任何应用代码）
> 调研范围：editorStore 的 9 种滤镜（sharpen / gaussian_blur / median / sobel / canny / histogram_eq / brightness / contrast / saturation）在 Web 端的最简可行实现路径。
> 结论全部基于：仓库源码（file:line）、已安装包源码（`node_modules/sharp` 0.35.3、`@cornerstonejs/core` 5.6.2、`@cornerstonejs/tools` 5.6.2）、MDN 文档、HTML Living Standard、sharp 官方文档（sharp.pixelplumbing.com）。
> 演示级标准：**简单可靠 > 性能**。

---

## 0. 结论摘要（TL;DR）

**推荐路径：客户端 Canvas2D ImageData 逐像素处理，全部 9 个滤镜。** 因为其中 **9/9 已经实现**在 `apps/web/src/lib/imageProcessing.ts` 里，且与 editorStore 的滤镜 schema 一一对应；缺的只是"渲染胶水"（~100 行：一个 FilterLayer 覆盖画布 + 订阅 editorStore.filters 变化）。WebGL 直接跳过；服务端 sharp 作为可选增强，不作为演示主路径。

| 滤镜 | Cornerstone 原生 | 客户端 Canvas2D | 服务端 sharp | **推荐（演示）** |
|---|---|---|---|---|
| brightness 亮度 | ✅ voiRange（窗口中心） | ✅ 已实现 | ✅ linear/modulate | **CS 原生**（WindowLevel） |
| contrast 对比度 | ✅ voiRange（窗宽） | ✅ 已实现 | ✅ linear | **CS 原生**（WindowLevel） |
| saturation 饱和度 | ❌ | ✅ 已实现 | ✅ modulate.saturation | Canvas2D |
| sharpen 锐化 | ⚠️ API 存在但 GPU-only，本仓库被禁用 | ✅ 已实现 | ✅ sharpen({sigma}) | Canvas2D |
| gaussian_blur 高斯模糊 | ⚠️ 同上（smoothing） | ✅ 已实现 | ✅ blur(sigma) | Canvas2D |
| median 中值 | ❌ | ✅ 已实现 | ✅ median(size) | Canvas2D（radius 上限 3） |
| sobel | ❌ | ✅ 已实现 | ⚠️ convolve 3×3 可行 | Canvas2D |
| canny | ❌ | ✅ 简化版已实现；完整 NMS 版在共享包 | ❌ sharp 无 Canny API | Canvas2D（直接用共享包版本） |
| histogram_eq 直方图均衡 | ❌ | ✅ 已实现 | ⚠️ 仅 normalise/clahe，非真 HE | Canvas2D |

关键事实：**这个仓库的滤镜不是"从零实现"问题，而是"接线"问题** —— UI（`ImageFilters.tsx`）、状态（`editorStore.ts`）、像素算法（`lib/imageProcessing.ts`）三件套都已存在且 schema 对齐，只是从未被挂载调用。

---

## 1. 现状盘点：三件套已齐，缺渲染胶水

### 1.1 状态层：`editorStore.ts` 定义 9 种滤镜类型

`apps/web/src/stores/editorStore.ts:14-17`：

```ts
type: 'sharpen' | 'gaussian_blur' | 'median' | 'sobel' | 'canny' | 'histogram_eq' | 'brightness' | 'contrast' | 'saturation';
params: Record<string, number>;
```

`defaultFilters` 默认只启用 3 个：brightness / contrast / saturation（editorStore.ts:28-32）。该 store 目前只被 `components/editor/LayerManager.tsx:3` 和 `components/editor/ImageFilters.tsx:3` 引用，且这两个组件**都没有被任何页面挂载**（grep `ImageFilters` 无调用点）——即整套编辑器 UI 处于孤儿状态，与 issue 描述一致。

### 1.2 UI 层：`ImageFilters.tsx` 参数范围已定义并与算法对齐

`apps/web/src/components/editor/ImageFilters.tsx:14-69` 的参数 schema：

| 滤镜 | 参数 | 范围 |
|---|---|---|
| brightness / contrast / saturation | `value` | -100..100 |
| sharpen | `strength` | 0..5 |
| gaussian_blur | `radius` | 1..20 |
| median | `radius` | 1..5 |
| sobel / histogram_eq | （无参数） | — |
| canny | `low` / `high` | 0..255 |

### 1.3 算法层：`lib/imageProcessing.ts` 已实现全部 9 个滤镜

`apps/web/src/lib/imageProcessing.ts`（369 行，纯 Canvas2D ImageData 操作，零依赖）：

- `applyBrightness`（:14）、`applyContrast`（:30）、`applySaturation`（:46）
- `applySharpen`（:63，3×3 Laplacian 核）、`applyGaussianBlur`（:75，生成高斯核全卷积）、`applyMedianFilter`（:84，逐像素排序中值）
- `applySobel`（:118）、`applyCanny`（:155，简化版：Gaussian→Sobel→阈值，**缺非极大值抑制**）、`applyHistogramEqualization`（:201，逐通道 CDF）
- `applyFilters(ctx, filters)`（:342）——分派器，switch 的 type 字符串与 editorStore 完全一致（`'brightness' | 'contrast' | ... | 'histogram_eq'`），直接消费 store 的 `filters` 数组。

**但 `applyFilters` 全仓库无任何调用点**（grep `imageProcessing` 在 lib 文件之外零匹配）。这是本次调研最重要的发现：**演示路径的工程量不是写算法，而是把 `applyFilters` 接到视口画布上。**

### 1.4 渲染链：Cornerstone CPU 渲染 + wadouri 加载

- `apps/web/src/lib/cornerstone/init.ts:47-49`：`csSetUseCPURendering(true)`，注释明确说明原因——headless/CI 浏览器里 WebGL（SwiftShader）会静默渲染成黑图，强制 CPU 渲染保证跨环境可靠。
- `apps/web/src/components/viewer/CornerstoneViewport.tsx:164-167`：`renderingEngine.enableElement({ viewportId, element })`，element 是普通 `div`；图像经 `toCornerstoneImageId()`（init.ts:71-87）以 `wadouri:` scheme 加载。
- 非 DICOM 图片走 `GET /api/images/:id/file?format=dicom`，由服务端即时转换（见 §3）。

### 1.5 既有叠加层范例：AnnotationLayer

`apps/web/src/components/editor/AnnotationLayer.tsx:17-40` 已经是"视口上叠一个 Canvas 覆盖层"的成熟模式（对齐父元素尺寸、清空、按 viewport 变换绘制）。滤镜层可以完全照抄这个结构：**FilterLayer = 覆盖画布 + 复制 CS 已渲染像素 + applyFilters + putImageData**。

---

## 2. 客户端 Canvas2D ImageData 路径

### 2.1 原语可用性（MDN 主源）

- `ImageData`：`data` 是 RGBA 顺序、行优先的 `Uint8ClampedArray`（[MDN ImageData](https://developer.mozilla.org/en-US/docs/Web/API/ImageData)，Baseline，2015-07 起全浏览器可用；且**可在 Web Worker 中使用**）。getImageData / putImageData 同为 Baseline。
- `putImageData` 不受画布变换矩阵影响，直接按原始像素写入（[MDN putImageData](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/putImageData)）；HTML Living Standard 明确："The current path, transformation matrix, shadow attributes, global alpha, the clipping region, and current compositing and blending operator **must not affect the methods described in this section**"（[HTML Spec canvas.html, Pixel manipulation](https://html.spec.whatwg.org/multipage/canvas.html)，检索"Due to the lossy nature of converting"段落）。
- 即：**putImageData 写入的是原始像素值，不经过任何滤镜/合成**。这保证了"算法处理后的 ImageData → putImageData"是确定性的，但反过来也意味着下面的 `ctx.filter` 捷径对 putImageData 不生效（见 2.2）。

### 2.2 捷径：`ctx.filter` 属性（不建议依赖）

Canvas2D 有内置 `filter` 属性，接受与 CSS filter 相同的函数串：`blur()`、`brightness()`、`contrast()`、`saturate()`、`grayscale()`、`hue-rotate()`、`invert()`、`opacity()`、`sepia()`、`drop-shadow()`、`url()`（SVG 滤镜）（[MDN CanvasRenderingContext2D.filter, Value 段](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/filter)）。`blur()` 即高斯模糊（标准差由 length 定义）、`brightness()` 即线性乘子、`saturate()` 即饱和度百分比。

**两个坑**：

1. **非 Baseline**。MDN 标注 "Limited availability / not Baseline"（[MDN filter 页顶部](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/filter)）——历史上 Safari 长期不支持，浏览器一致性差，与仓库"CPU 渲染保证跨环境可靠"的取舍相悖。
2. **只在光栅化时生效**。`ctx.filter` 作用于后续 `drawImage`/`fillRect` 等绘制调用，而 `putImageData` 直接写像素（见 2.1 的 spec 引用）。要用 filter 必须走"源画布 drawImage 到目标画布"的间接路径。

**结论**：`ctx.filter` 可做 gaussian_blur / brightness / contrast / saturation 的无代码捷径，但非 Baseline + 与现有 putImageData 管线不兼容，演示项目不采用；若将来要做"实时拖动滑块预览"，可在 Worker 里用 `OffscreenCanvas` + ImageData 继续走手工算法，或再评估 filter。

### 2.3 逐滤镜复杂度（按已实现的 lib/imageProcessing.ts 评估）

| 滤镜 | 算法 | 复杂度/像素 | 演示级评估 |
|---|---|---|---|
| brightness | 加性偏移 `data[i]+factor` | O(1) | ✅ 无问题 |
| contrast | `factor*(v-128)+128` | O(1) | ✅ 无问题 |
| saturation | 亮度加权混合 | O(1) | ✅ 无问题 |
| sharpen | 3×3 卷积 | O(9) | ✅ 无问题 |
| gaussian_blur | 生成核全卷积 | O(k²)，k=2r+1 | ⚠️ UI 允许 radius≤20 → 41×41 核 = 1681 乘/像素，2K 图约数百 ms；演示可限制 radius≤5，或用**可分离高斯**降为 O(2k) |
| median | 窗口排序 | O(k²·log k²)，k=2r+1 | ⚠️ UI 允许 radius≤5 → 11×11=121 值排序×3 通道；演示建议 radius≤3（3×3/5×5 可接受） |
| sobel | 3×3 双核 | O(9) | ✅ 无问题 |
| canny | 现有版 = blur+sobel+双阈值（缺 NMS） | O(k²+9) | ⚠️ 简化版可用；**更完整版（含非极大值抑制 :131 + 滞后阈值 :188 + 完整管线 `cannyEdgeDetection` :254）已在 `packages/image-processing/src/utils/edge-detection.ts`，并可从 `@pacsviewer/image-processing/browser` 入口导入**（browser.ts:20-24），建议演示直接复用它 |
| histogram_eq | 直方图+CDF 重映射 | O(n)+O(256) | ✅ 无问题 |

典型量级：1024×1024 RGBA（4MB ImageData），3×3 卷积 ≈ 9.4M 浮点乘加 ≈ 20-50ms JS —— 演示级交互（拖动滑块 + 防抖重算）完全够用。OCT B-scan（512×1024）和眼底照片（~2000×3000）都在可接受范围；唯一要防的是大 radius 的 gaussian/median。

### 2.4 与 Cornerstone 渲染链的接线方式

演示最小方案（在 CornerstoneViewport 的 element 之上叠一个 `<canvas>`，参照 AnnotationLayer 模式）：

1. 监听 CS 渲染完成事件（CPU 渲染路径渲染完成会触发 `IMAGE_RENDERED`，见 `node_modules/@cornerstonejs/core/dist/esm/RenderingEngine/GenericViewport/Planar/CpuImageSliceRenderPath.js:179`）与 editorStore `filters` 订阅。
2. 取已渲染像素：`getEnabledElement(element)` → 渲染后的显示 canvas 直接 `getImageData()`；或 `StackViewport.getImageData()`（CPU 路径有 `getImageData(rendering)`，同上文件 :165）。
3. `applyFilters(ctx, filters)`（lib/imageProcessing.ts:342）处理 → `putImageData` 到覆盖层画布。
4. 滤镜关闭/重置时清空覆盖层。

注意：处理的是**渲染后的屏幕像素（8-bit RGBA）**，不是原始 DICOM 灰度值——对演示而言这是特性（与所见一致），但意味着：处理在 CS 的窗宽窗位之后进行，若同时用 CS 原生窗宽窗位 + Canvas2D brightness 会叠加，需要产品决策（见 §6 推荐：brightness/contrast 走 CS 原生，其余走 Canvas2D，避免重复实现同一种调节）。

### 2.5 WebGL 着色器路径（跳过）

- 依赖：需要 WebGL/WebGL2 context、shader 编译、render-to-texture 管线；若用现成库（如 glfx.js）则多一个依赖且其着色器质量参差。
- **与仓库现状冲突**：init.ts:47-49 刻意 `setUseCPURendering(true)`，因为 WebGL 在 headless/CI（SwiftShader）下会静默黑屏——同一理由同样适用于独立 WebGL 滤镜管线，除非对 WebGL 缺失做完整回退（= 等于再写一遍 Canvas2D 路径）。
- 性能收益：9 个滤镜里 6 个是 O(1)/小核卷积，JS 已够演示；只有大 radius 卷积和大图实时滑块需要 GPU。演示项目不值得引入这份复杂度与回退成本。
- 结论：**跳过**。若未来需要，天然升级路径是"Worker + OffscreenCanvas ImageData"（保持同一套算法代码），而不是 WebGL。

---

## 3. 服务端 sharp 路径

### 3.1 sharp 对 9 种滤镜的支持（官方文档 + 已装 0.35.3 源码）

`apps/server/package.json` 依赖 `sharp ^0.35.0`，实际安装 `node_modules/sharp/package.json` version 0.35.3。

| 滤镜 | sharp API | 依据 |
|---|---|---|
| brightness | `modulate({ brightness })`（乘子）或 `linear(a, b)` 的 b（加性偏移） | sharp 官方文档 [modulate](https://sharp.pixelplumbing.com/api-operation#modulate)、[linear](https://sharp.pixelplumbing.com/api-operation#linear)；`node_modules/sharp/lib/index.d.ts:625`、:609 |
| contrast | `linear(a)`（乘子） | 同上 |
| saturation | `modulate({ saturation })` | 同上 :625 |
| sharpen | `sharpen({ sigma, m1, m2, x1, y2, y3 })`，无参=快速轻度锐化，带 sigma=LAB 空间 L 通道锐化 | 官方 [sharpen](https://sharp.pixelplumbing.com/api-operation#sharpen)；index.d.ts:471 |
| gaussian_blur | `blur(sigma)`（sigma 0.3-1000 高斯；无参=3×3 box blur） | 官方 [blur](https://sharp.pixelplumbing.com/api-operation#blur)；index.d.ts:490 |
| median | `median(size)`（默认 3×3） | 官方 [median](https://sharp.pixelplumbing.com/api-operation#median)；index.d.ts:479 |
| sobel | ⚠️ 无专用 API，可用 `convolve(3×3 核)` | index.d.ts:580（`convolve(kernel: Kernel)`） |
| canny | ❌ **sharp/libvips 无 Canny API**；需手工管线（可用仓库 `packages/image-processing/src/utils/edge-detection.ts` 的 `cannyEdgeDetection`，纯 JS 在 Bun 可直接跑） | 官方文档全文检索无 canny；libvips 无该算子 |
| histogram_eq | ⚠️ **无真正的直方图均衡**。最接近：`normalise({lower,upper})`（百分位拉伸，默认 1%-99%，本质是 auto-contrast）与 `clahe({width,height,maxSlope})`（CLAHE 自适应均衡，since 0.28.3） | 官方 [normalise](https://sharp.pixelplumbing.com/api-operation#normalise)、[clahe](https://sharp.pixelplumbing.com/api-operation#clahe)；index.d.ts:553、:572 |

结论：sharp 原生覆盖 **7/9**（brightness、contrast、saturation、sharpen、gaussian_blur、median、+closest-to-HE 的 normalise/clahe）；sobel 需 convolve 手工核；canny 完全不可用（服务端做 canny = 移植仓库已有的纯 JS 实现）。

### 3.2 输入限制：sharp 不能直接读 DICOM

`node_modules/sharp/lib/index.d.ts:37`：输入格式为 "JPEG, PNG, WebP, AVIF, GIF, SVG, TIFF **or raw pixel image data**"——**没有 DICOM**。

仓库现有转换链路是反方向（`apps/server/src/services/image-to-dicom.ts`：sharp 解码普通图 → raw → dcmjs 包成 DICOM）。若要做服务端滤镜：

- **非 DICOM 图（PNG/JPG 上传）**：原生支持，直接 `sharp(原文件).sharpen()...`。
- **原生 DICOM 图**：需先用 dcmjs 解析提取 PixelData（仓库已有 `apps/server/src/services/dicom/parser.ts` 解析器）再喂给 sharp——额外工作量，且灰度窗宽窗位语义要重新处理。演示期不建议。

### 3.3 集成点与往返延迟

现状：`apps/server/src/routes/images.ts:226-255` 的 `GET /:id/file?format=dicom` 已对非 DICOM 图即时转换（`convertImageToDicom`）并返回，且带 `Cache-Control: public, max-age=31536000, immutable`（images.ts:253-254）。滤镜版集成点自然是同端点加查询参数（如 `&filters=sharpen:2,median:3`）或新端点 `/api/images/:id/filtered`。

**延迟账**（演示关键考量）：

1. 每次滤镜参数变化 = 一次 HTTP 往返（本地部署 ~ms 级网络 + sharp 原生 libvips 处理 ms 级 + 重新包 DICOM + 客户端重新解码）。**拖动滑块的实时预览会明显滞后**，需防抖（~200ms）。
2. 服务端不缓存转换结果（每次即时转换），但浏览器侧 URL 不变则命中 `immutable` 缓存——带滤镜参数后 URL 每次变化会击穿缓存。要缓存需服务端加"滤镜参数键 → 产物"的 LRU/磁盘缓存。
3. 与现有 wadouri 加载链天然兼容：服务端产出仍是 DICOM，客户端无需任何改动即可显示。

**结论**：服务端 sharp 是"功能上可行、交互上尴尬"的路径。它真正的适用场景是**批量处理/导出**（如导出滤镜后的大图），而不是编辑器内的实时预览。演示主路径不用它；若要秀 sharp，做一个"导出滤镜后图片"按钮即可（10 行端点）。

---

## 4. Cornerstone 原生覆盖（voiLUT / WindowLevel）

### 4.1 窗宽窗位 = brightness + contrast（已确认原生可用）

CPU 渲染管线（本仓库强制 CPU，init.ts:47-49）对灰度和彩色都应用窗宽窗位 LUT：

- 灰度：`RenderingEngine/helpers/cpuFallback/rendering/renderGrayscaleImage.js:32-34` → `getLut()`（generateLut.js）→ `storedPixelDataToCanvasImageData` → `putImageData`。
- 彩色：`renderColorImage.js:12-13` → `generateColorLUT`（windowWidth/windowCenter/invert 相同才复用缓存 LUT）；当 ww=256/255 且 wc=128/127 且非 invert 时走原图直通（renderColorImage.js:29-35）。
- LUT 映射：`getVOILut.js` 线性公式 `((v - (wc - 0.5)) / (ww - 1) + 0.5) * 255`，钳制 [0,255]；非 pre-scaled 图还会先过 modality LUT（slope/intercept，generateLut.js:15-32）。
- `WindowLevelTool`（`@cornerstonejs/tools` 5.6.2）：鼠标拖动 → 计算新 `voiRange` → `setViewportVOIProperties(viewport, { voiRange })`（tools/dist/esm/tools/WindowLevelTool.js:53-95）→ StackViewport `setProperties({ voiRange })`（core StackViewport.js:690-725）。**本仓库已注册该工具**（init.ts:81），且已有 `components/viewer/WindowLevel.tsx` 组件。

所以 **brightness ≈ 移动窗口中心（voiRange 中心），contrast ≈ 改变窗宽（voiRange 上下界）**，零代码、对灰度 DICOM 语义正确（作用于原始存储值而非屏幕像素）。这是唯一建议走 CS 原生的两个滤镜。

### 4.2 sharpen / blur：API 存在但被 CPU 渲染禁用（重要发现）

`StackViewport.setProperties({ ..., sharpening, smoothing })`（core StackViewport.js:690）与 `setSharpening/setSmoothing`（:72-78）在 5.6.2 中存在，渲染时经 `getRenderPasses()`（:81-98）构造 vtk.js 卷积 pass（`renderPasses/smoothingRenderPass.js`：15×15 高斯核；`sharpeningRenderPass.js`）。

**但 `shouldUseCustomRenderPass() { return !this.useCPURendering; }`（StackViewport.js:563-565）** —— 这些 pass 是 OpenGL（vtk.js `vtkConvolution2DPass`）专属。本仓库强制 `useCPURendering=true`，因此 `getRenderPasses()` 恒返回 null，**sharpening/smoothing 在演示配置下是死代码**。结论：sharpen/gaussian_blur 不能指望 CS 原生，必须走像素处理。

### 4.3 其余 5 个滤镜：CS 无任何原生路径

saturation（无色彩空间变换）、median、sobel、canny、histogram_eq 在 core 5.6.2 渲染管线中均无对应能力（渲染管线只有 LUT/colormap/invert/插值/锐化平滑 pass，见 StackViewport.js:690 的 setProperties 签名）。全部必须走像素处理。

---

## 5. 每滤镜归属矩阵 + 演示推荐路径

| 滤镜 | CS 原生 | Canvas2D（已有代码） | sharp（服务端） | **演示最终归属** |
|---|---|---|---|---|
| brightness | ✅ voiRange 中心 | ✅ imageProcessing.ts:14 | ✅ linear b / modulate | **CS 原生**（复用 WindowLevel；零代码） |
| contrast | ✅ voiRange 宽度 | ✅ imageProcessing.ts:30 | ✅ linear a | **CS 原生** |
| saturation | ❌ | ✅ imageProcessing.ts:46 | ✅ modulate.saturation | **Canvas2D** |
| sharpen | ❌（GPU-only 被禁） | ✅ imageProcessing.ts:63 | ✅ sharpen({sigma}) | **Canvas2D** |
| gaussian_blur | ❌（GPU-only 被禁） | ✅ imageProcessing.ts:75 | ✅ blur(sigma) | **Canvas2D**（限制 radius≤5） |
| median | ❌ | ✅ imageProcessing.ts:84 | ✅ median(size) | **Canvas2D**（限制 radius≤3） |
| sobel | ❌ | ✅ imageProcessing.ts:118 | ⚠️ convolve | **Canvas2D** |
| canny | ❌ | ✅ 简化版 imageProcessing.ts:155；完整版在共享包 edge-detection.ts:254 | ❌ 无 API | **Canvas2D**（建议换用共享包 `cannyEdgeDetection`） |
| histogram_eq | ❌ | ✅ imageProcessing.ts:201 | ⚠️ 仅 normalise/clahe | **Canvas2D** |

**演示整体路径（推荐）**：

1. **主路径 = 客户端 Canvas2D**：把 `lib/imageProcessing.ts` 的 `applyFilters` 接上 —— 新增 FilterLayer 覆盖画布（照抄 AnnotationLayer 结构），订阅 editorStore.filters + CS `IMAGE_RENDERED`，brightness/contrast 之外的 7 个滤镜全部走它。工程量 ≈ 100 行，零新依赖。
2. **brightness / contrast 走 CS 原生 WindowLevel**（voiRange / setProperties），复用已注册的 WindowLevelTool 与 `components/viewer/WindowLevel.tsx`，不做重复实现。
3. **跳过 WebGL**（§2.5）。**服务端 sharp 不做主路径**（§3.3），如要展示可加"导出滤镜后图片"端点。
4. 性能护栏：gaussian_blur radius 上限压到 ~5、median radius 上限压到 ~3（或接受 demo 级卡顿）；大图时先降采样再处理（sharp 的 thumbnail 路径已有先例：packages/image-processing/src/index.ts 的 generateThumbnail）。
5. 可选：canny 换用 `@pacsviewer/image-processing/browser` 导出的 `cannyEdgeDetection`（含 NMS + 滞后阈值，browser.ts:20-24），比现简版更"真"。

---

## 6. 派生任务（后续会话可建 ticket）

- **[实现] 滤镜渲染胶水**：FilterLayer 覆盖画布 + editorStore.filters 订阅 + CS IMAGE_RENDERED 联动 + 挂载 ImageFilters 组件到 ViewerPage/编辑模式。预计 1 个 issue，~100-200 行。
- **[决策] brightness/contrast 双通道去重**：CS 原生 WindowLevel 与 Canvas2D brightness/contrast 语义重复，需定"编辑器内窗宽窗位与滤镜条的关系"（演示可简单选择：滤镜条里不放 brightness/contrast，或在 Canvas2D 侧复用同一 voiRange）。
- **[可选] sharp 导出端点**：`GET /api/images/:id/filtered?filters=...` 返回滤镜后 PNG/DICOM，浏览器缓存键 = 完整 URL（含参数）。
- **[可选] 性能护栏**：gaussian/median 的 radius 上限调整 + 大图预降采样。

---

## 7. 参考资料（primary sources）

**仓库源码**
- `apps/web/src/stores/editorStore.ts`（滤镜类型/默认值）
- `apps/web/src/components/editor/ImageFilters.tsx`（参数 schema）
- `apps/web/src/lib/imageProcessing.ts`（9 滤镜全部实现 + applyFilters 分派器）
- `apps/web/src/lib/cornerstone/init.ts`（setUseCPURendering(true)，:47-49；WindowLevelTool 注册 :81；toCornerstoneImageId :71-87）
- `apps/web/src/components/viewer/CornerstoneViewport.tsx`（enableElement :164-167）
- `apps/web/src/components/editor/AnnotationLayer.tsx`（覆盖层范例 :17-40）
- `apps/server/src/routes/images.ts:226-255`（`/:id/file?format=dicom` 即时转换）
- `apps/server/src/services/image-to-dicom.ts`（sharp 解码 → dcmjs 封装）
- `packages/image-processing/src/utils/edge-detection.ts`（gaussianBlur :19 / sobelEdgeDetection :73 / nonMaxSuppression :131 / hysteresisThreshold :188 / cannyEdgeDetection :254）；`src/browser.ts`（浏览器安全导出）
- `apps/server/package.json`、`packages/image-processing/package.json`（sharp ^0.35.0）

**已安装包源码（node_modules）**
- `sharp` 0.35.3：`lib/index.d.ts`（:471 sharpen / :479 median / :490 blur / :553 normalise / :572 clahe / :580 convolve / :609 linear / :625 modulate；:37 输入格式无 DICOM）
- `@cornerstonejs/core` 5.6.2：`init.js:134-141`（setUseCPURendering）；`RenderingEngine/StackViewport.js:563-565`（shouldUseCustomRenderPass = !useCPURendering）、:690（setProperties 含 sharpening/smoothing）、:81-98（getRenderPasses）；`helpers/cpuFallback/rendering/renderGrayscaleImage.js:32-34`、`renderColorImage.js:12-13,29-35`、`generateLut.js`、`getVOILut.js`（线性 W/L 公式）；`RenderingEngine/renderPasses/smoothingRenderPass.js`（15×15 高斯）；`RenderingEngine/GenericViewport/Planar/CpuImageSliceRenderPath.js:165`（getImageData）、:179（IMAGE_RENDERED 事件）
- `@cornerstonejs/tools` 5.6.2：`tools/WindowLevelTool.js:53-95`（voiRange 策略）

**官方文档**
- MDN：https://developer.mozilla.org/en-US/docs/Web/API/ImageData ；.../CanvasRenderingContext2D/filter（非 Baseline；Value 段含 blur/brightness/contrast/saturate）；.../CanvasRenderingContext2D/putImageData（不受变换矩阵影响）；.../CanvasRenderingContext2D/getImageData
- HTML Living Standard：https://html.spec.whatwg.org/multipage/canvas.html （Pixel manipulation 段："The current path, transformation matrix, shadow attributes, global alpha, the clipping region, and current compositing and blending operator must not affect the methods described in this section"）
- sharp 官方文档：https://sharp.pixelplumbing.com/api-operation （sharpen / median / blur / clahe / normalise / linear / modulate / recomb）
- Cornerstone.js 官方：https://www.cornerstonejs.org/docs/concepts/cornerstone-core/rendering （渲染概念页）
