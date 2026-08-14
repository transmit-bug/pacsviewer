# 报告 / 测量导出技术选型：PDF 路径、测量格式、导出目标

> Research ticket: transmit-bug/pacsviewer #128（只读调研，未修改任何代码）
> 调研范围：报告 → PDF 的三种路径（print CSS / jsPDF+html2canvas / react-pdf）、测量导出的三种格式（JSON / CSV / DICOM SR）、导出目标（浏览器下载 vs 服务端归档）。
> 结论基于仓库源码（file:line）与官方文档（URL 内联引用）。库能力声明均以官方文档或已安装包源码为准。
> 背景：本 repo 的"最后一公里"是给 demo 一个"漂亮的报告导出"。

---

## 0. 现状速览（决定选型的既有事实）

| 项 | 现状 | 位置 |
|---|---|---|
| 报告渲染 | 数据驱动模板渲染器：`TemplateRenderer` 按 `template.fields`（text/textarea/number/select/measurement/image 等）+ `layout.columns/sections` 动态渲染，Tailwind + shadcn/ui Card 布局 | `apps/web/src/components/report/TemplateRenderer.tsx`（`gridTemplateColumns: repeat(columns, 1fr)` 在 :115） |
| 报告 UI | `ReportPage` 已有 **预览 tab + `window.print()` 按钮 + 内联 `@media print` 样式**（`body * visibility:hidden` 技巧、`print:hidden` 类） | `apps/web/src/pages/ReportPage.tsx:217-218`（`handleExportPdf = window.print()`）、`:704-723`（print 样式块）、`:564`（`StatusBadge className="print:hidden"`） |
| 报告 API | `reports.ts` 走通用 `createCrudRouter` + status/versions/diff 路由，**无导出端点**；报告内容为 `content` JSON、`images` 为 imageId 数组（缩略图经 `/api/images/:id/thumbnail?token=` 同源加载） | `apps/server/src/routes/reports.ts`；`apps/server/src/db/schema.ts`（reports 表） |
| 测量数据 | 前端 `measurementStore` 持 `SerializedAnnotation[]` + `MeasurementResult[]`（`{value, unit, displayText, handles}`），**导出按钮已把 `measurements` 序列化为 JSON blob 下载**；后端有 `measurement_points` 表 + `measurement_definitions` 字典 + `/trends` 纵向序列端点 | `apps/web/src/stores/measurementStore.ts:28-37`（MeasurementResult 形状）；`apps/web/src/components/viewer/AnnotationToolbar.tsx:94-103`（JSON blob 导出）；`apps/server/src/routes/measurements.ts:182`（`/trends`） |
| 导出先例 | 全仓已有 **服务端 CSV 导出先例**：`audit-logs.ts` `/export` 返回 `'\uFEFF'` BOM CSV + `Content-Disposition: attachment`（"Add BOM for Excel UTF-8 support"）；前端多处 blob 下载（PNG/JSON/CSV） | `apps/server/src/routes/audit-logs.ts:95,130-134`；`apps/web/src/pages/SettingsPage.tsx:142-152,168-174` |
| 已装依赖 | 无 jsPDF / html2canvas / react-pdf；**已装 `@cornerstonejs/adapters@5.6.7`（含 dcmjs@0.52.0 传递依赖）**、`dicom-parser`、`cornerstone-wado-image-loader`、`recharts` | `apps/web/package.json`（dependencies） |

---

## 1. 报告 → PDF：三条路径对比

### 1.1 方案 A：打印 CSS（`window.print()` + `@media print` 样式）

**机制**：浏览器自己排版当前 DOM 并输出 PDF（"打印/另存为 PDF"对话框）。MDN 对 `@media print` 的定义即"用于分页材料和在打印预览模式下查看的文档"：

> `print` — *Intended for paged material and documents viewed on a screen in print preview mode.*
> — https://developer.mozilla.org/en-US/docs/Web/CSS/@media#print

**对本代码库的适配度**：
- **保真度 = 像素级**。渲染的是真实 DOM，由浏览器引擎按 Tailwind 样式绘制，无需二次实现。`ReportPage` 预览 tab 已经是"报告成品"形态（结构化字段预览 + findings 富文本 + 图像网格 + 时间戳），`print:` Tailwind 变体 + 现有 print 样式块可直接打磨（ReportPage.tsx:704-723）。
- **中文字体零成本**：使用操作系统字体（macOS 苹方 PingFang SC、Windows 微软雅黑），demo 机器必然可用；文字是矢量、可选可复制。
- **分页**：浏览器原生处理跨页断行；长 textarea 内容自动断页。可用 `@page { size: A4; margin: ... }` 与 `break-inside: avoid` 精修（demo 只需少量 CSS）。
- **工作量**：最小。`window.print()` 按钮已存在（ReportPage.tsx:217-218），当前 print 样式用的是 `visibility:hidden` 技巧，建议改为 `display:none` + 专打印 DOM，并加 `@page` 规则。估算：半天。
- **demo 可靠性**：Chrome/Edge/Firefox/Safari 全支持；代价是"多一次对话框点击"（用户选"另存为 PDF"），非一键下载。临床影像行业（含 OHIF）普遍采用打印为 PDF 的路径。

### 1.2 方案 B：jsPDF + html2canvas（DOM → 位图 → PDF）

**官方能力声明**：
- jsPDF："A library to generate PDFs in JavaScript."（低层 API，本身不渲染 HTML/DOM）— https://github.com/parallax/jsPDF#readme
- html2canvas：*"The script traverses through the DOM ... does not actually take a screenshot of the page, but builds a representation of it based on the properties it reads from the DOM. As a result, it is only able to render correctly properties that it understands, meaning there are many CSS properties which do not work."* — https://html2canvas.hertzen.com/documentation
- 同源限制：*"All the images that the script uses need to reside under the same origin ... without the assistance of a proxy."* — https://html2canvas.hertzen.com/documentation（报告缩略图 `/api/images/:id/thumbnail?token=` 为同源，此项可通过）
- 仅浏览器端、不可用于 node：*"heavily dependent on the browser, this library is not suitable to be used in nodejs"* — https://github.com/niklasvh/html2canvas#readme

**对本代码库的适配度**：
- **保真度风险（核心）**：html2canvas 在 canvas 里"重建"页面，只支持它认识的 CSS 属性。本 repo 报告布局重度依赖 Tailwind 的 flexbox/grid（`TemplateRenderer.tsx:115` 的 `gridTemplateColumns`、ReportPage.tsx 图像 `grid grid-cols-2 md:grid-cols-4`），以及 shadcn Card 的圆角/阴影/border——不在其支持清单内的属性会退回默认渲染（元素堆叠）。必须逐项验证，demo 前极易翻车。
- **文字栅格化**：整页变成一张位图（默认 96dpi，需 `scale:2` 缓解），中文虽能画出来但非矢量、模糊风险、文件偏大、不可选中。
- **中文字体**：jsPDF README 明确："The 14 standard fonts in PDF are limited to the ASCII-codepage. If you want to use UTF-8 you have to integrate a custom font ... if you want to have for example Chinese text in your pdf, your font has to have the necessary Chinese glyphs ... or else it will show garbled characters." — https://github.com/parallax/jsPDF#readme（走 html2canvas 位图路径时此问题被绕过，但位图本身就是质量妥协）
- **工作量**：中。+2 依赖（html2canvas ~350KB、jsPDF ~200KB），~30 行管线代码，外加"排查不支持 CSS + 调 scale + 验证中文"的打磨时间。
- **demo 可靠性**：一键下载；但对本 repo 的 Tailwind 布局，渲染 artifact 风险是三条路径里最高的。

### 1.3 方案 C：react-pdf（用 react-pdf 原语重写模板）

**官方能力声明**：
- "React renderer for creating PDF files on the browser and server." — https://react-pdf.org/
- 核心用法是 `Document/Page/Text/View/StyleSheet` 等**专用原语**（README 示例），**不消费现有 HTML/Tailwind DOM** — https://github.com/diegomura/react-pdf#readme
- 分页需自行管理：react-pdf 的 `<Page>` 是"单页"，内容超出需借助 wrapping/断页机制（Advanced: "Page wrapping"）— https://react-pdf.org/advanced
- 中文字体需注册：`Font.register` 加载 CJK TTF（标准 14 字体仅覆盖拉丁字符）。

**对本代码库的适配度**：
- **保真度**：`TemplateRenderer` 是数据驱动的（任意 `fields`/`sections`/`columns` 组合），用 react-pdf 原语重写 = 重新实现整套布局引擎，且与 Tailwind 视觉体系（Card/边框/徽章/状态色）完全脱钩，需手工复刻样式 → 保真度取决于复刻投入。
- **中文字体**：必须内置 CJK 字体（如 Noto Sans SC 全量 ~10MB+，或做子集化），增加构建体积与工程复杂度。
- **工作量**：最高（重写渲染器 + 分页管理 + 字体打包）。
- **demo 可靠性**：输出稳定，但"漂亮"依赖从零搭建，投入产出比最低。

### 1.4 结论（问题 1）

**推荐方案 A：print CSS（`window.print()` 打磨版）。**

理由（结合本代码库）：
1. **保真度最高且零重实现**：报告就是 Tailwind 渲染的 React DOM，浏览器原生打印 = 与预览完全一致的成品；`ReportPage` 已具备 90% 的雏形（print 样式块 + 按钮）。
2. **中文字体**：走操作系统字体，demo 环境（macOS/Win）开箱即完美渲染 CJK，无字体打包、无乱码风险——这是 jsPDF（ASCII 字体限制）与 react-pdf（需注册 CJK 字体）都要额外解决的问题。
3. **demo 可靠性**：无第三方重渲染层，无 CSS 支持盲区；唯一交互成本是"打印对话框 → 另存为 PDF"，演示时可接受。
4. **工作量最小**：仅需把 print 样式从 `visibility` 技巧升级为 `display:none` + 独立打印 DOM + `@page` 规则。

> 备选结论：若未来要"一键下载 PDF 文件"（不出对话框），优先级为 打磨 print CSS 到极致（大部分浏览器支持在 print 对话框直接确认即下载）→ react-pdf（若接受重写与字体打包）→ html2canvas+jsPDF（本 repo 布局下最不可控）。

---

## 2. 测量导出：JSON / CSV / DICOM SR

### 2.1 数据现状

- 前端 `MeasurementResult`：`{id, toolName, label, value, unit, displayText, handles}`（measurementStore.ts:28-37）；导出 = `JSON.stringify(measurements)` 存 blob（AnnotationToolbar.tsx:94-103，`measurements-<ts>.json`）。旧 Canvas 编辑器有同类实现（MeasurementDisplay.tsx:115-121，死代码）。
- 后端落库：`measurement_points`（schema.ts:633-647）字段 `studyId/imageId/measurementKey/type/value/unit/calibrated/sourceAnnotationId/capturedAt`；`measurement_definitions`（schema.ts:609-628）含 `key/displayName/unit/trendDirection/referenceRange/modality` 字典。
- API：`measurements.ts` 提供 `/definitions` CRUD + `/trends`（按 (key, studyDate) 分组纵向序列，join `studies` 带 studyDate/studyTime，measurements.ts:182-240），**无导出端点**。

### 2.2 格式对比

**(a) JSON（现状，浏览器 blob）**
- 优点：无损往返、零成本（已实现）。
- 缺点：demo 观众打不开、不可表格化，说服力弱。

**(b) CSV（电子表格友好）**
- 优点：
  - **本 repo 已有完整先例**：`audit-logs.ts:95-134` `/export` 就是"服务端 join 后拼 CSV + `'\uFEFF'` BOM + `Content-Disposition: attachment`"，注释明言 "Add BOM for Excel UTF-8 support"（Excel 打开中文 CSV 不乱码的关键）；前端 SettingsPage.tsx:142-152、168-174 也有对应下载/预览实现可抄。
  - 服务端可一次 join 出演示表格：`measurement_points ⋈ measurement_definitions`（displayName、unit、referenceRange）⋈ `studies.studyDate`，输出 `检查日期,测量项,数值,单位,参考范围,是否校准`。
  - 零新依赖（纯字符串拼接，与 audit-logs 同款）。
- 缺点：无格式元数据（工具类型/坐标），不适合系统间精确交换——demo 不在乎。
- 工作量：小（一个 Hono 端点 + 前端下载按钮）。

**(c) DICOM SR（`@cornerstonejs/adapters`）— 库实际支持什么**

已安装包 `@cornerstonejs/adapters@5.6.7` 实测：
- `adapters.Cornerstone3D.MeasurementReport.generateReport(toolState, metadataProvider, options)` **确实存在且可生成 SR**（node_modules `.../Cornerstone3D/MeasurementReport.js:354`；官方源码同名方法，注释明言 *"Assume Cornerstone metadata provider has access to Study / Series / Sop Instance UID"* — https://github.com/cornerstonejs/cornerstone3D/blob/main/packages/adapters/src/adapters/Cornerstone3D/MeasurementReport.ts）。
- 输出为 dcmjs `StructuredReport` 的 `dataset`；dcmjs@0.52.0 是 adapters 的直接依赖（`node_modules/@cornerstonejs/adapters/package.json:97`），运行时验证 `dcmjs.data.DicomMessage.write` 与 `data.datasetToBlob` 可用 → 可客户端序列化出 `.dcm` 文件。
- SOP Class：2D 测量 → **Comprehensive SR**（`1.2.840.10008.5.1.4.1.1.88.33`，dcmjs 内置映射）；3D 测量 → **Comprehensive 3D SR**（`.88.34`，MeasurementReport.js:400 分支）。官方 API 参考：https://cornerstonejs.org/docs/api/adapters/variables/adaptersSR；标准定义见 DICOM PS3.3 A.35（https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_A.35.html）。
- 工具覆盖：Length/Angle/Probe/ArrowAnnotate/EllipticalROI/RectangleROI/PlanarFreehandROI/Bidirectional/CobbAngle/CircleROI/UltrasoundDirectional（index.js 导出清单）——本 repo 工具条（length/angle/probe/arrow/ellipticalROI/rectangleROI/freehand/spline）基本被覆盖（spline 走 ControlPointPolyline）。

**但要落地 SR 的成本与风险**：
1. `generateReport` 需要 **Cornerstone 原生 toolState**（`{ imageId: { toolType: [annotationState...] } }`）与 **metadataProvider**（Study/Series/SOP 元数据）。本 repo 的标注持久化链路是死代码（见 #86 调研：`annotation-sync.ts` 无调用方、`deserializeAnnotations` 为占位实现），`measurementStore` 里只有序列化副本，**没有可用的 Cornerstone 工具态**；需先把 store/真实 annotationState 组装成 toolState，并保证加载图像的 metadataProvider 有完整 DICOM 元数据。
2. 转换图像（PNG/JPG → DICOM，`image-to-dicom.ts`）元数据稀疏，SR 引用 SOPInstanceUID/参考帧可能缺项。
3. 官方文档当前并无完整"导出 SR"教程页（sitemap 实测仅 API 参考页），可参考实现少。

**demo 价值**：SR 是"能被 PACS 摄入的互操作数据文件"，对 demo 观众**不可视**，不满足"漂亮报告"诉求；但作为"临床互操作性"加分项有说服力。

### 2.3 结论（问题 2）

**推荐：CSV（服务端生成 + BOM），作为 demo 首选；JSON 保留为前端内部往返格式；DICOM SR 列入二期亮点。**

- CSV 与"测量 → 表格 → Excel 打开"的 demo 叙事最匹配，且复用 audit-logs 的成熟模式，工作量最小（约一个路由 + 一个按钮），零新依赖。
- SR 的投入产出比在"最后冲刺 demo"阶段不划算：需要接通 Cornerstone toolState/metadataProvider（本 repo 尚未打通），且产物不可视。若二期要"测量可导入其他 PACS"再上。

---

## 3. 导出目标：浏览器下载 vs 服务端归档

**现状证据（全部指向浏览器下载更便宜）**：
- 全仓所有导出都是浏览器侧下载：AnnotationToolbar（测量 JSON）、SettingsPage（CSV，服务端生成后 `responseType:'blob'` 下载）、ThicknessMap / VisualFieldViewer / CornealTopography / SegmentationPanel（PNG canvas 下载）——无一例外。
- 图像/标注 API 完全面向浏览器前端服务：`images.ts`（`/:id/thumbnail` 带 token 鉴权、`/:id/file`、upload、pyramid）、`annotations.ts`（CRUD + `/sync` + `/image/:imageId`）、`measurements.ts`（definitions/trends）——**没有任何服务端导出/归档表或路由**（index.ts:63-87 路由清单全貌）。
- 服务端唯一导出端点 `audit-logs.ts /export` 也是"流式返回 CSV 让浏览器下载"，而非写入归档存储。

**结论（问题 3）**：**浏览器下载**。理由：与全仓模式一致、零新 schema/存储/路由、demo 即时可见；服务端归档（新表 + 存储 + 列表/下载 UI）只在需要"导出留痕/合规审计"时再引入，且届时可复用 `auditLogs` 的 audit 事件模型。

---

## 4. 结论汇总

| 决策点 | 推荐 | 核心理由 |
|---|---|---|
| 报告 → PDF | **print CSS（`window.print()` 打磨）** | 渲染真实 DOM 保真度最高；OS 中文字体零成本；无新依赖、已有一半实现；demo 最稳 |
| 测量导出格式 | **CSV（服务端 + BOM）**，JSON 保留、SR 二期 | 复用 audit-logs CSV 先例；Excel 直接打开中文不乱码；零新依赖；SR 需先打通 toolState/metadataProvider 且不可视 |
| 导出目标 | **浏览器下载** | 全仓唯一模式；无归档表/路由先例；demo 即时可用 |

### 建议的最小实施包（后续工单）
1. `ReportPage`：把内联 print 样式从 `visibility` 技巧升级为独立打印 DOM + `display:none` + `@page { size: A4; margin: 12mm }`，隐藏 Tab/操作区（部分已用 `print:hidden`）。
2. 新增 `GET /api/measurements/export?studyIds=...`（或 `/trends/export?patientId=`）：按 `measurement_points ⋈ definitions ⋈ studies` 拼 CSV，`'\uFEFF'` BOM + `Content-Disposition: attachment`（完全对照 audit-logs.ts:95-134）。
3. 前端在测量/趋势页加"导出 CSV"按钮，`responseType:'blob'` 下载（对照 SettingsPage.tsx:142-152）。

---

## 5. 引用摘要（primary sources）

| 事实 | 来源 |
|---|---|
| `@media print` 语义："分页材料与打印预览模式" | https://developer.mozilla.org/en-US/docs/Web/CSS/@media#print |
| ReportPage 已有 `window.print()` + print 样式块 | `apps/web/src/pages/ReportPage.tsx:217-218,704-723,564` |
| 模板渲染为 Tailwind + `gridTemplateColumns` 数据驱动布局 | `apps/web/src/components/report/TemplateRenderer.tsx:115` |
| jsPDF "A library to generate PDFs in JavaScript"；14 标准字体仅 ASCII，中文需自定义 TTF 否则乱码 | https://github.com/parallax/jsPDF#readme |
| html2canvas "重建" DOM 而非截图；"many CSS properties which do not work"；同源图片限制；仅浏览器端 | https://html2canvas.hertzen.com/documentation ；https://github.com/niklasvh/html2canvas#readme |
| react-pdf "React renderer for creating PDF files on the browser and server"；原语 Document/Page/Text/View/StyleSheet，不消费现有 HTML | https://react-pdf.org/ ；https://github.com/diegomura/react-pdf#readme ；分页 https://react-pdf.org/advanced |
| 测量 JSON blob 导出（现状） | `apps/web/src/components/viewer/AnnotationToolbar.tsx:94-103` |
| 服务端 CSV 导出先例（BOM + attachment） | `apps/server/src/routes/audit-logs.ts:95,130-134` |
| 前端 CSV blob 下载先例 | `apps/web/src/pages/SettingsPage.tsx:142-152,168-174` |
| `measurement_points` / `measurement_definitions` 表结构 | `apps/server/src/db/schema.ts:633-647,609-628` |
| `/trends` 纵向序列端点（join studies） | `apps/server/src/routes/measurements.ts:182-240` |
| adapters 支持 SR 生成：`MeasurementReport.generateReport(toolState, metadataProvider, options)` | 已装 `node_modules/@cornerstonejs/adapters/dist/esm/adapters/Cornerstone3D/MeasurementReport.js:354`；官方源码 https://github.com/cornerstonejs/cornerstone3D/blob/main/packages/adapters/src/adapters/Cornerstone3D/MeasurementReport.ts |
| generateReport 依赖 dcmjs；dcmjs@0.52.0 为 adapters 直接依赖；`DicomMessage.write`/`datasetToBlob` 可用 | `MeasurementReport.js:2,23`；`node_modules/@cornerstonejs/adapters/package.json:97`；运行时验证 |
| SR SOP Class：Comprehensive SR .88.33 / Comprehensive 3D SR .88.34 | `MeasurementReport.js:400`；dcmjs 内置映射；标准 https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_A.35.html |
| adaptersSR 官方 API 参考 | https://cornerstonejs.org/docs/api/adapters/variables/adaptersSR |
| 标注持久化链路为死代码（影响 SR 落地成本） | 见 `research/followup-measurements.md`（#86） |
| 图像/标注 API 全为浏览器前端服务，无导出/归档端点 | `apps/server/src/routes/images.ts`、`annotations.ts`、`apps/server/src/index.ts:63-87` |
