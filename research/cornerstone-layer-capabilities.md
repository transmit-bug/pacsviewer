# Cornerstone 图层/标注分组能力调研

> Research ticket: transmit-bug/pacsviewer #106（只读调研，未修改任何应用代码）
> 调研范围：Cornerstone 是否提供标注"图层"原生概念；按图层管理标注（显隐/锁定/透明度/排序）的可行实现；后端 `layers` 表 + `annotations.layerId` 与 Cornerstone 前端模型的对齐方案。
> 结论全部基于：官方文档（cornerstone3D docs 源码，main 分支）、已安装库源码（`node_modules/@cornerstonejs/core` v5.6.2、`@cornerstonejs/tools` v5.6.2，见 `apps/web/package.json`）、仓库源码（file:line）。
> 前序调研：`research/followup-measurements.md`（#86）确认了标注持久化链路曾为死代码；本调研复核时该链路已被 #99/#100 接通（见 §3.1）。

---

## 1. Cornerstone 有原生"图层"概念吗？

### 1.1 annotationState：按 FrameOfReference + toolName 分组，**没有** metadata 过滤

`annotation.state`（`FrameOfReferenceSpecificAnnotationManager`）内部存储结构为：

```ts
annotations[groupKey][toolName][]   // groupKey 默认 = element 的 FrameOfReferenceUID
```

- `annotation.state.getAnnotations(toolName, element)`（`node_modules/@cornerstonejs/tools/dist/esm/stateManagement/annotation/annotationState.js:10-16`，`addAnnotation` 在 :54）把 `element` 交给 manager 的 `getGroupKey`（`.../FrameOfReferenceSpecificAnnotationManager.js`）换算成 `enabledElement.FrameOfReferenceUID` 后按 `(groupKey, toolName)` 取数组。
- 官方文档 state.md：`cornerstone3DTools.annotation.state.getAnnotations(toolName, element)` —— "Returns the full annotations for a given Tool"；`addAnnotation(annotation, element)` 负责写入（`docs/.../annotation/state.md`）。
- **没有任何按 metadata 过滤的 API**：`getAnnotations(groupKey, toolName)` 只接受两个参数，第二个参数是 toolName 而非谓词。按任意 metadata（如自定义 `layerId`）过滤只能对返回数组手动 `filter`。
- 官方文档 annotationManager.md 明确：annotations 分组 key 即 `FrameOfReferenceUID`（"the groupKey is the `FrameOfReferenceUID`"）。

### 1.2 annotation.metadata 可扩展 —— 自定义 `layerId` 字段可行

`AnnotationMetadata` 类型定义为 `Types.ViewReference & { toolName, cameraPosition?, viewUp?, segmentColor?, enabledElement? }`（`.../types/AnnotationTypes.d.ts`），`ViewReference` 含 `FrameOfReferenceUID / referencedImageId / sliceIndex / volumeId ...`（`@cornerstonejs/core/dist/esm/types/IViewport.d.ts:33`）。metadata 是普通对象，**额外字段在运行时完全可用**（TS 侧按结构类型需在写入处断言）。仓库现有代码已在 metadata 里放自定义字段：`annotation-sync.ts` 的 `deserializeAnnotations` 写入 `{ toolName, FrameOfReferenceUID, referencedImageId }`。**给每标注增加 `metadata.layerId` 没有 API 障碍。**

### 1.3 toolGroup：是"工具+视口绑定"，不是图层；"一个 toolGroup = 一个图层"**不成立**

- toolGroup 语义：一组工具实例 + 一组视口 + 每工具一个 mode（`store/ToolGroupManager/ToolGroup.js`：`addTool / addViewport / setToolMode`）；工具渲染时按 `toolGroupId` 查样式（`stateManagement/annotation/config/ToolStyle.js`）与触发渲染。
- **硬约束**：`getToolGroupForViewport(viewportId, renderingEngineId)` 在同一个视口匹配到多个 toolGroup 时直接抛错：

  ```ts
  throw new Error(`Multiple tool groups found for ... You should only have one tool group per viewport in a renderingEngine.`);
  ```

  （`.../store/ToolGroupManager/getToolGroupForViewport.js:13-18`）。渲染与事件分发都走这个单例（`utilities/getToolsWithModesForElement.js` → `AnnotationRenderingEngine._triggerRender`）。
- 结论：**同一视口只能有一个 toolGroup**。用"每个图层建一个 toolGroup"表达多图层，在共享视口场景（单 viewport 叠加多个标注图层）不成立；toolGroup 只能作为"整组工具/全局样式"的划分维度。

### 1.4 最接近"图层"的原生能力：`AnnotationGroup`（UID 集合 + 集体显隐）

本版本（5.6.2）新增 `AnnotationGroup` 类（`.../stateManagement/annotation/AnnotationGroup.js`），官方文档 annotationGroups.md 介绍：

- 用途："organizing related annotations together, enabling collective operations like toggling visibility and navigating between grouped annotations"。
- API：`new AnnotationGroup()` → `group.add(annotationUID, ...)` / `remove / clear / has`；`group.setVisible(isVisible, { viewportId, renderingEngineId }, filter?)` 把成员 `annotation.isVisible` 批量置位并触发 `ANNOTATION_MODIFIED`；`group.isVisible`；`findNearby(uid, direction)` 组内导航。
- `setVisible` 自带 filter 参数 + 默认过滤函数，支持**重叠 group**（仅当所有组都隐藏时才真正隐藏）——官方文档 annotationGroups.md 明示此语义。
- **局限**：AnnotationGroup 只存在于内存（不在持久化契约里），且只有显隐能力；锁定/透明度/排序仍需逐 UID 处理。

### 1.5 自定义 AnnotationManager：全局单例，不适合"每图层一个 store"

`annotation.state.setAnnotationManager(myManager)`（`annotationState.js`；文档 annotationManager.md）可以整体替换状态管理器（如按 `layerId` 定制 groupKey）。但 manager 是**全局单例**，同一时刻只有一个生效；同一视口内多个图层需要并存时无法切换。可行变体是把 groupKey 字符串直接传给 `getAnnotations`/`addAnnotation`（`AnnotationGroupSelector = HTMLDivElement | string`），但工具的 `renderAnnotation` 内部恒用 `getAnnotations(toolName, element)` 查询（按 FOR 分组），自定义 groupKey 的标注**不会被工具渲染** —— 因此该路线会破坏渲染管线，不推荐。

### 1.6 小结（Q1 结论）

| 诉求 | Cornerstone 原生支持？ |
|---|---|
| 按 metadata 过滤标注 | ❌ 无内置 API，需手动 `filter`（metadata 可扩展，能存 `layerId`） |
| 标注分组 | ✅ `AnnotationGroup`（显隐 + 导航） |
| 一个 toolGroup = 一个图层 | ❌ 同视口只允许一个 toolGroup（抛错） |
| 每图层独立存储 | ❌ manager 全局单例；改 groupKey 会脱离渲染管线 |

---

## 2. 按图层显隐 / 锁定 / 透明度 / 排序的可行实现

### 2.1 显隐 —— 原生支持（两条路）

- **逐标注**：`annotation.visibility.setAnnotationVisibility(annotationUID, false)`，内部维护 `globalHiddenAnnotationUIDsSet` 并写 `annotation.isVisible`（`.../annotationVisibility.js`）。渲染侧每工具 `renderAnnotation` 遍历时 `if (!isAnnotationVisible(annotationUID)) continue;`（如 `LengthTool.js` 的 renderAnnotation），即**隐藏的标注不绘制**。
- **按组**：`AnnotationGroup.setVisible(false, { viewportId, renderingEngineId })` 批量置位（§1.4）。
- 图层化做法：`getAnnotations(toolName, element).filter(a => a.metadata.layerId === X)` 得到图层成员 UID 集合，调 `setAnnotationVisibility`（或维护 `Map<layerId, AnnotationGroup>` 直接 `group.setVisible`），随后 `triggerAnnotationRender(element)`。

### 2.2 锁定 —— 原生支持（无组级 API，需遍历）

`annotation.locking.setAnnotationLocked(annotationUID, true)`，内部 `globalLockedAnnotationUIDsSet` + `annotation.isLocked`（`.../annotationLocking.js`）。渲染侧锁定标注不显示可拖拽手柄（`LengthTool.js` renderAnnotation：`if (!isAnnotationLocked(annotationUID) && ...)`），事件分发侧锁定标注不可编辑。**没有** group 级锁定 API —— 图层锁定时需遍历该层 UID 逐个调用。

### 2.3 透明度 —— **基础标注渲染不支持**（重要发现）

- 基础工具样式管线 `getAnnotationStyle()`（`.../tools/base/AnnotationTool.js:197-221`）**硬编码**：

  ```js
  return { visibility, locked, color, lineWidth, lineDash,
           lineOpacity: 1, fillColor: color, fillOpacity: 0, ... };
  ```

  `lineOpacity` / `fillOpacity` 不从样式表读取（`lineOpacity: 1` 在 :216、`fillOpacity: 0` 在 :218）；`drawLineSvg` 虽支持 `strokeOpacity` 选项（`.../drawingSvg/drawLine.js:8` 的 options、:26 写入属性），但 renderAnnotation 从不传。`AnnotationStyle` 类型里虽有 `fillOpacity` 属性（`.../types/AnnotationStyle.d.ts`），但仅 `PlanarFreehandROITool` 等少数工具消费（`.../tools/annotation/planarFreehandROITool/renderMethods.js:13-25`，且默认 0）。
- 我核对了 cornerstone3D **main 分支**源码（`packages/tools/src/tools/base/AnnotationTool.ts` 的 `getAnnotationStyle`），**同样硬编码 `lineOpacity: 1, fillOpacity: 0`** —— 即"标注透明度"在可预见的未来版本里也不是一等能力。
- 图层透明度的三条现实出路：
  1. **RGBA 颜色**：`annotation.config.style.setAnnotationStyles(uid, { color: 'rgba(r,g,b,a)' })`（或 toolGroup 级样式），SVG stroke 接受 alpha —— 低成本近似透明度，但逐 UID 设置较繁琐，且 textBox/手柄颜色需一并处理。
  2. **自定义 renderAnnotation**：fork/包装工具（如 LengthTool），从 `annotation.metadata.layerId` 查图层 `opacity` 后把 `strokeOpacity` 传给绘制函数 —— 语义最完整，但需要覆盖每个工具（~10 个）。
  3. **图层级 CSS**：对整层做 `opacity` 过滤 —— 但 5.6.2 每个视口只有一个 `.svg-layer`（见 2.4），无法按图层分 SVG，故不适用（除非走 2.5 独立 overlay）。

### 2.4 z-order —— 无原生 z-index；顺序由"toolOptions 顺序 + 数组顺序"决定

- 每个视口元素内**只有一个 SVG overlay**（`.viewport-element > .svg-layer`，见 `.../drawingSvg/getSvgDrawingHelper.js` 的 `_getSvgLayer`），所有工具所有标注画进同一个 SVG。节点以 `(annotationUID, groupUID)` 为 key 复用（svgNodeCache），**没有 per-annotation 的 z-index**。
- 绘制顺序 = ① `getToolsWithModesForElement` 返回的工具顺序（= 该视口唯一 toolGroup 的 `toolOptions` 键插入序）→ ② 每工具 `renderAnnotation` 内标注数组顺序。
- 图层化做法：a) 图层间排序 → 调整 toolGroup `toolOptions` 键序（工具级，粗粒度）；b) 图层内排序 → 直接重排 manager 里的标注数组（`restoreAnnotations` 或直接操作数组）。两种都是"hack"，无干净 API。

### 2.5 独立 SVG overlay（第三选项）—— 可行，但脱离 Cornerstone 管线

- 在 viewport 元素上方自行叠加 `<svg>`，用 `viewport.worldToCanvas()` 把世界坐标转画布坐标绘制本层内容；缩放/平移时监听 `CAMERA_MODIFIED` 事件（`@cornerstonejs/core` enums）重绘。
- **优点**：图层间透明度/排序/显隐完全独立，不干扰 annotationState；适合 `ai_result` 这类服务端算好的、无需交互的叠加层（热图、AI 轮廓）。
- **缺点**：a) 手动维护坐标变换（zoom/pan/flip/旋转都要重算）；b) 无法复用 Cornerstone 的选中/锁定/编辑语义；c) 与 DICOM SR 导出链路（`@cornerstonejs/adapters`）无关联。

### 2.6 实现方式对比（Q2 结论）

| 能力 | metadata 过滤（A） | 渲染样式（B） | 独立 SVG overlay（C） |
|---|---|---|---|
| 显隐 | ✅ `setAnnotationVisibility` / `AnnotationGroup.setVisible` | 无样式级显隐 | ✅ 自绘逻辑 |
| 锁定 | ✅ `setAnnotationLocked`（遍历） | ❌ | ❌（无交互语义） |
| 透明度 | ⚠️ 仅 RGBA color 近似 / 需自定义 renderAnnotation | ❌ 5.6.2 与 main 均硬编码 opacity | ✅ 原生 SVG opacity |
| z-order | ⚠️ 数组/toolOptions 重排 hack | ❌ | ✅ SVG 叠加顺序 |
| 世界坐标同步 | ✅ 自动 | ✅ 自动 | ❌ 需手动 |
| 标注持久化/SR | ✅ annotationState 契约 | ✅ 同左 | ❌ 分离 |
| 实现成本 | 低（一个 lib 模块） | 中（每工具覆盖） | 中（但需常驻事件监听） |

**推荐**：标注类图层（annotation）走 A（metadata 过滤为主，配 `AnnotationGroup` 做显隐、RGBA 颜色近似透明度）；AI 结果图层（ai_result）走 C（独立 SVG overlay）。B 只作为 A 的补充（每标注颜色）。

---

## 3. 后端模型与 Cornerstone 前端如何对齐

### 3.1 现状盘点

- **后端**：`layers` 表（`apps/server/src/db/schema.ts:200-212`：`id, imageId, name, type[image|annotation|ai_result], visible, opacity, locked, sortOrder, createdAt`）；`annotations.layerId` 外键（schema.ts:183）。CRUD 路由 `apps/server/src/routes/layers.ts`（`GET/POST /api/layers`、`PUT/DELETE /api/layers/:id`，已挂载 `apps/server/src/index.ts:74`），参数校验很弱（POST 只检查必填三字段，PUT 无 schema 校验），无鉴权。
- **前端（孤儿代码）**：`editorStore.ts`（Layer 类型：`type/visible/opacity/locked/order`，与后端字段几乎一一对应，仅 `order` vs `sortOrder` 命名差异）与 `LayerManager.tsx` 只被同目录 `ImageFilters.tsx` 引用，`components/editor/` 整体无人 import —— **未接入任何 Cornerstone API**。
- **已接通的标注同步闭环（#99/#100 之后）**：`annotation-sync.ts` 的 `serializeAnnotations / deserializeAnnotations / scheduleAutoSave` 已由 `CornerstoneViewport.tsx:30,82,99,124` 真实调用（保存：`serializeAnnotations → annotationApi.sync`；恢复：`annotationApi.getForImage → deserializeAnnotations → annotation.state.addAnnotation`；`ANNOTATION_COMPLETED` 立即保存、`ANNOTATION_MODIFIED` 1.5s 防抖）。—— 注意：这推翻了 `followup-measurements.md` 中"annotation-sync 是死代码"的旧结论，那是 #86 时点的状态。

### 3.2 关键断链：`layerId` 写路径存在、读路径丢失

逐层核对"标注 ↔ 图层"的往返：

1. **序列化（前端→后端）**：`serializeAnnotations`（`annotation-sync.ts:20-64`）只输出 `{ id, toolName, data: { handles, cachedStats?, label?, text? } }` —— **不含 metadata，也不含 layerId**。`SerializedAnnotation` 类型（`measurementStore.ts:15-28`）同样没有 `layerId` 字段。
2. **后端落库**：`POST /annotations/sync` 支持 `layerId: ann.layerId || null`（`apps/server/src/routes/annotations.ts:231`），`validateAnnotationContract` 不拒绝多余字段 —— **后端能力已具备**，只是前端从不发送。
3. **后端读出**：`GET /annotations/image/:imageId`（annotations.ts:269-282）序列化返回 `{ id, toolName, data, style }` —— **不返回 layerId**。即即使写入端补上，读端也会丢弃。
4. **反序列化（后端→前端）**：`deserializeAnnotations`（annotation-sync.ts）构造的 `csAnnotation.metadata` 只有 `{ toolName, FrameOfReferenceUID, referencedImageId }`，没有 layerId。

**结论：图层归属信息在持久化链路上是断的** —— 前端不写、后端可存、读端丢、恢复不还原。要做图层，第一步就是把 `layerId` 贯通这条链路（见 §3.4 派生工单）。

### 3.3 三个可选图层模型（与 Cornerstone 兼容）

**模型 A：metadata 标签图层（推荐基线）——"图层 = metadata.layerId + 逐 UID 操作"**

- 前端：`addAnnotation` 时把当前激活图层写入 `annotation.metadata.layerId`（在 `ANNOTATION_COMPLETED` 监听里 stamp）；`serializeAnnotations` 契约扩展 `layerId`；后端 `annotations.layerId` 已就绪，读端补返回。
- 图层操作：显隐 → `AnnotationGroup` 每层一个 + `setVisible`（或 `setAnnotationVisibility` 遍历）；锁定 → `setAnnotationLocked` 遍历；透明度 → 层色用 `rgba` 或自定义 renderAnnotation；排序 → 数组重排（接受 hack）。
- 取舍：实现成本最低、完全走官方 API 与现有同步闭环；代价是"图层"是逻辑概念，透明度/排序是近似实现。
- **与现有后端 schema 100% 对齐**：`layers` 表 = 元数据目录，`annotations.layerId` = 归属，`layers.visible/locked/opacity/sortOrder` = 图层级 UI 状态（操作时下发到逐 UID 调用）。

**模型 B：AnnotationGroup 为骨干（显隐语义最正）**

- 每个图层一个 `AnnotationGroup`（layerId → group 的 Map），加载标注后重建分组；显隐/重叠组语义由官方类保证（含 ANNOTATION_MODIFIED 事件）。
- 取舍：显隐体验最好，但 group 不持久化（每次 restore 后要重建）、锁定/透明度仍逐 UID；适合作为模型 A 中"显隐"子模块的实现而非替代整体模型。

**模型 C：AI 结果走独立 SVG overlay**

- `layers.type='ai_result'` 的图层不进 annotationState，前端自维护 overlay（§2.5）。服务端返回的 AI 标注（点/多边形/热图）直接画入自建 SVG，透明度/排序/显隐全自主。
- 取舍：交互与 SR 导出受限，但图层语义最完整；与模型 A 互补，覆盖 `type` 枚举的 `ai_result` 一翼。

**关于 `type='image'` 图层**：Cornerstone core 5.6.2 **没有图像级 addLayer/合成 API**（全 core dist 无 `addLayer`，`StackViewport` 只有 `setStack/addImages` 用于多帧切换）。"图像图层"要么退回单背景图 + 标注层，要么用多 viewport/多渲染引擎平铺；**不建议在 `layers` 模型里把 image 类做成可叠加图层**，应明确其为背景占位。

### 3.4 推荐组合与派生工单

推荐 **A + C**：annotation 层用 metadata.layerId（模型 A），ai_result 层用独立 overlay（模型 C），`AnnotationGroup` 作为 A 的显隐实现（模型 B 的子集）。

后续实现前应先开的派生工单（本调研不实现）：

1. **贯通 layerId 持久化链路**：`SerializedAnnotation` + `serializeAnnotations` 增加 `layerId`（metadata 透传）；`GET /annotations/image/:id` 读端补 `layerId`；`deserializeAnnotations` 还原 `metadata.layerId`。（阻断级，§3.2）
2. **图层状态接入 Cornerstone**：新建 `layerStore`（替换孤儿 `editorStore`），维护 `layerId → { AnnotationGroup, color(rgba), visible, locked, opacity, order }`；在 `ANNOTATION_COMPLETED` 时 stamp 激活层；显隐/锁定调官方 API + `triggerAnnotationRender`。
3. **透明度方案定型**：在"RGBA 层色"与"自定义 renderAnnotation 传 strokeOpacity"之间选一（建议先 RGBA，成本低）；如未来上游支持 opacity 再迁移。
4. **AI 结果 overlay 组件**：服务端 AI 标注渲染为独立 SVG overlay（含 CAMERA_MODIFIED 重绘），不进入 annotationState。
5. **`layers` 路由加固**：`zod` 校验、鉴权、（可选）`imageId` 归属校验；`type='image'` 语义文档化（单背景图）。
6. **z-order 决策**：接受"数组重排" hack 或按工具分层；文档化限制。

---

## 引用摘要（primary sources）

| 事实 | 来源 |
|---|---|
| annotationState 按 (groupKey, toolName) 存储；getAnnotations/addAnnotation 签名 | `node_modules/@cornerstonejs/tools@5.6.2/dist/esm/stateManagement/annotation/annotationState.js:17-24`；`.../FrameOfReferenceSpecificAnnotationManager.js`（getGroupKey：element→FrameOfReferenceUID） |
| 无 metadata 过滤 API；分组 key = FrameOfReferenceUID | 官方文档 `docs/concepts/cornerstone-tools/annotation/state.md`、`annotationManager.md`（cornerstone3D main，`packages/docs/docs/...`） |
| AnnotationMetadata = ViewReference & {toolName,...}（可扩展） | `.../tools/dist/esm/types/AnnotationTypes.d.ts`；`@cornerstonejs/core/dist/esm/types/IViewport.d.ts:33`（ViewReference） |
| 同视口只允许一个 toolGroup（抛错） | `.../tools/dist/esm/store/ToolGroupManager/getToolGroupForViewport.js:14-18` |
| toolGroup = 工具+视口+mode；渲染按 toolGroup 单例取工具 | `.../tools/dist/esm/utilities/getToolsWithModesForElement.js`；`.../tools/dist/esm/stateManagement/annotation/AnnotationRenderingEngine.js`（_triggerRender） |
| AnnotationGroup：add/setVisible/filter/重叠组语义 | `.../tools/dist/esm/stateManagement/annotation/AnnotationGroup.js`；官方文档 `annotationGroups.md` |
| setAnnotationManager 为全局单例 | `.../tools/dist/esm/stateManagement/annotation/annotationState.js`；官方文档 `annotationManager.md` |
| 显隐：globalHiddenAnnotationUIDsSet + isVisible；渲染侧 continue 跳过 | `.../tools/dist/esm/stateManagement/annotation/annotationVisibility.js`；`.../tools/dist/esm/tools/annotation/LengthTool.js`（renderAnnotation） |
| 锁定：globalLockedAnnotationUIDsSet + isLocked；无组级 API | `.../tools/dist/esm/stateManagement/annotation/annotationLocking.js` |
| 透明度硬编码 lineOpacity:1 / fillOpacity:0（5.6.2 与 main 均如此） | `.../tools/dist/esm/tools/base/AnnotationTool.js:197-221`；cornerstone3D main `packages/tools/src/tools/base/AnnotationTool.ts` |
| drawLine 支持 strokeOpacity 选项但不被 renderAnnotation 传递 | `.../tools/dist/esm/drawingSvg/drawLine.js` |
| fillOpacity 仅个别工具消费（PlanarFreehandROI，默认 0） | `.../tools/dist/esm/tools/annotation/planarFreehandROITool/renderMethods.js:13-25` |
| 每视口单一 .svg-layer；无 per-annotation z-index；绘制序=工具序+数组序 | `.../tools/dist/esm/drawingSvg/getSvgDrawingHelper.js`（_getSvgLayer）；`.../tools/dist/esm/drawingSvg/draw.js` |
| 样式层级 annotationUID→viewport→toolGroup→default；setAnnotationStyles(:39)/setToolGroupToolStyles(:61) | `.../tools/dist/esm/stateManagement/annotation/config/ToolStyle.js`；官方文档 `config.md` |
| core 5.6.2 无图像级 addLayer API | `@cornerstonejs/core/dist/esm/RenderingEngine/*`（全 dist grep 无 addLayer；StackViewport.d.ts 仅 setStack/addImages） |
| layers 表 + annotations.layerId | `apps/server/src/db/schema.ts:200-212`、`:183`；路由 `apps/server/src/routes/layers.ts`（挂载 index.ts:74） |
| editorStore / LayerManager 为孤儿代码（无人 import） | 全仓 grep：`components/editor/` 仅被自身引用 |
| 同步闭环已接通（save/restore/debounce） | `apps/web/src/components/viewer/CornerstoneViewport.tsx:30,82,99,124`；`apps/web/src/lib/cornerstone/annotation-sync.ts` |
| SerializedAnnotation 无 layerId；serialize 不输出 metadata | `apps/web/src/stores/measurementStore.ts:15-28`；`annotation-sync.ts:20-64` |
| 后端 sync 接受并落库 layerId；GET 读端丢弃 layerId | `apps/server/src/routes/annotations.ts:231`（写）、`:269-282`（读，序列化不含 layerId） |
| ADR-002：废弃 Canvas 标注、全面迁移 Cornerstone annotation API | `docs/adr/ADR-002-annotation-system-redesign.md` |
