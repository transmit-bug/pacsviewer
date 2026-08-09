# 随访对比功能前置调研：测量标注几何数据的可靠性与格式

> Research ticket: transmit-bug/pacsviewer #86（只读调研，未修改任何代码）
> 调研范围：`annotations.geometry` 的实际结构、校准链路状态、`compareMeasurements()` 假设的有效性。
> 结论全部基于仓库源码（file:line）与已安装的 Cornerstone.js 库源码（`node_modules/@cornerstonejs/tools` v5.6.x）。

---

## 1. 测量几何数据结构：`value` / `unit` 字段是否存在？

### 1.1 表结构：`geometry` 是自由 JSON，无 `value`/`unit` 列

`annotations` 表定义于 `apps/server/src/db/schema.ts:178-197`：

```ts
type: text('type', { enum: ['measurement', 'arrow', 'text', 'freehand', 'roi', 'highlight'] }).notNull(),
geometry: text('geometry', { mode: 'json' }).notNull(),   // schema.ts:187
style:    text('style', { mode: 'json' }).notNull(),
label:    text('label'),                                  // 可空，无唯一约束、无受控词表
```

- `geometry` 是 `mode: 'json'` 的 TEXT 列 —— **没有任何 JSON schema 约束**，其内部结构完全取决于写入方（schema.ts:187）。
- 表上**不存在** `value` 或 `unit` 列；`label` 可空且无索引约束。

### 1.2 仓库中实际存在三种互不兼容的 geometry 形状

**a) 种子数据**（`apps/server/src/db/seed.ts:722-744`）写入：

```ts
geometry: { points: [ {x,y}, {x,y} ] },   // 纯像素坐标
studyId:  null,
label:    pick(['黄斑中心凹','视盘边缘','出血点','渗出灶','新生血管', null]),
```

- 无 `value`、无 `unit`、无 `cachedStats`；`studyId` 恒为 `null`（seed.ts:729）。

**b) `/annotations/sync` 批量端点**（`apps/server/src/routes/annotations.ts:186-201`）写入：

```ts
geometry: JSON.stringify({
  toolName: ann.toolName,
  handles:  ann.data?.handles || [],        // 世界坐标 [{x,y,z}]
  cachedStats: ann.data?.cachedStats,       // 数值藏在这里
}),
label: ann.data?.label || ann.data?.text || null,
```

- `type` 由 `mapToolNameToType()` 派生（annotations.ts:202-216）：`Length`/`Angle`/`Probe` → `'measurement'`；`EllipticalROI`/`RectangleROI`/`FreehandROI`/`SplineROI`/`PlanarFreehandROI` → `'roi'`。
- `studyId` 存为 `ann.studyId || null`（annotations.ts:196）—— 该端点按 imageId 批量同步，**正常情况下 studyId 为 null**。
- 读取侧对称处理：`GET /annotations/image/:imageId` 把 `geometry.toolName/handles/cachedStats` 还原为 Cornerstone `SerializedAnnotation`（annotations.ts:230-244）。

**c) 旧版 POST 路由**（`annotations.ts:53-78` 与 `images.ts:435-468`）：把客户端传来的 `body.geometry` 原样 JSON 化存储，无任何形状校验。

### 1.3 前端预期的 Cornerstone 形状（设计口径）

`apps/web/src/stores/measurementStore.ts:14-28` 定义 `SerializedAnnotation`：

```ts
{ id, toolName, data: { handles: Array<{x,y,z}>, cachedStats?, label?, text? }, style? }
```

`apps/web/src/lib/cornerstone/annotation-sync.ts:20-64`（`serializeAnnotations`）把 Cornerstone `annotationState` 序列化成上述形状，其中 `cachedStats: data.cachedStats` 原样透传（annotation-sync.ts:48）。数值与单位**不在顶层**，而在 Cornerstone 工具缓存的 `cachedStats` 里（见 1.4）。

### 1.4 Cornerstone 工具实际产生的 cachedStats 结构（已安装库源码）

从 `node_modules/@cornerstonejs/tools@5.6.2`（`apps/web/package.json:14-19`）源码确认：

- **LengthTool**：`_calculateCachedStats` 写入
  `cachedStats[targetId] = { length, unit, statsArray: [{ name:'length', value: length, unit, type: MeasurementType.Linear }] }`
  （`node_modules/@cornerstonejs/tools/dist/esm/tools/annotation/LengthTool.js`，`_calculateCachedStats` 尾部）
- **AngleTool**：`cachedStats[targetId] = { angle }`（`.../annotation/AngleTool.js`，`_calculateCachedStats` 尾部）
- **RectangleROITool**：`cachedStats[targetId] = { Modality, area, mean, stdDev, max, min, statsArray, pointsInShape, areaUnit, modalityUnit }`（`.../annotation/RectangleROITool.js`）

注意两点：`cachedStats` 以 `targetId`（图像 id）为 key 嵌套；`unit` 是 cachedStats 内部的字段，**不是顶层 `geometry.unit`**。

### 1.5 谁写 `geometry.value` / `geometry.unit`？—— 没有任何人

全仓库对 `geometry.value` / `geometry.unit` 只有**读**、没有**写**：

- 读：`apps/server/src/routes/follow-up.ts:288`（`const baselineValue = geometry.value`）、`:306`（`unit: geometry.unit || 'μm'`）；`apps/web/src/hooks/useReportAutofill.ts:99`（`if (typeof geometry.value === 'number') return geometry.value`，还幻想 `geometry.result.value` / `geometry.distance` / `geometry.area`）。
- 写：**零处**。三个写入路径（seed / sync / 旧 POST）产出的 geometry 都不含顶层 `value`/`unit`。

### 1.6 前端 → 后端整条保存链路是死代码

逐层验证：

1. `lib/cornerstone/annotation-sync.ts` **没有任何 import 方**（全仓 grep 仅文件自引用）；`serializeAnnotations` / `scheduleAutoSave` / `deserializeAnnotations` / `extractMeasurements` 均无外部调用者。
2. `deserializeAnnotations` 本身是占位实现，只打一行日志，不做 `annotationState.restore()`（annotation-sync.ts:71-79）。
3. `annotationApi.create / sync / update / delete`（`services/api.ts:143-159`）**从未被调用**。
4. `CornerstoneViewport.tsx`（共 323 行）只负责建引擎、建 toolGroup、加载图像 —— **没有任何** `ANNOTATION_*` 事件监听、没有保存、没有恢复。Cornerstone 库虽然提供 `ANNOTATION_COMPLETED` 事件（`node_modules/@cornerstonejs/tools/dist/esm/enums/Events.js:19`），但仓库里无人订阅。
5. 被 ADR-002 判死刑的旧 Canvas 2D 实现（`apps/web/src/components/editor/*`）同样无人 import（死代码）。其中 `MeasurementTools.tsx` 产生的 geometry 是 `{ points }` + label 存显示文本（如 `"123.4 px"`），数值/单位写在测量对象上而未落库。

**结论 1**：`annotations.geometry` 是自由 JSON；`value`/`unit` 字段**不存在于任何写入路径**。数值实际嵌套在 `cachedStats[targetId].length/.area/.angle`（含各自单位），或压根不存在（seed 只有 `points`）。Cornerstone 标注目前**根本没有被持久化** —— 前端从未调用保存接口。

---

## 2. 校准状态：PixelSpacing → mm 链路是否实现？

### 2.1 路线图状态：#51 未完成

`docs/L3-ROADMAP.md`：
- L1（"医学影像查看器，含校准测量"）状态为 🔜 Phase 1，未开始（L3-ROADMAP.md:11）。
- `#51 测量工具校准（像素 → mm）` 位于 L1 任务列表（L3-ROADMAP.md:25）。
- L1 验收标准全部未勾选，其中"测量值显示真实单位（mm）"未完成（L3-ROADMAP.md:109 附近）；L3 的"随访对比（纵向分析）"同样未勾选（L3-ROADMAP.md:129）。

### 2.2 底层能力已具备（Cornerstone 库层面），但存在两处断链

**已具备的部分：**

1. 服务端解析 DICOM `PixelSpacing (0028,0030)` 并落库：`apps/server/src/services/dicom/parser.ts:168-172,228`（`parsePixelSpacing`，`[row, col]` mm）→ 存入 images 表 `pixelSpacing` 列（`apps/server/src/services/dicom/storage.ts:104-112`；schema.ts:139）。
2. `@cornerstonejs/dicom-image-loader` 把该值暴露为 `image.rowPixelSpacing / columnPixelSpacing / hasPixelSpacing`。
3. LengthTool 的校准核心 `getCalibratedLengthUnitsAndScale`（`node_modules/@cornerstonejs/tools/dist/esm/utilities/getCalibratedUnits.js`）：

   ```ts
   let unit = hasPixelSpacing ? 'mm' : PIXEL_UNITS;   // 无像素间距时回退 'px'
   ```

   因此：**原生 DICOM 且带 PixelSpacing** 时，LengthTool 缓存的是 **mm** 值；否则是 **px**。AngleTool 输出 `degrees`；ROI 输出 `area`（mm²，`areaUnit` 由同函数给出）。

**断链处：**

1. **转换图像无像素间距**：PNG/JPG 上传后由服务端转 DICOM 渲染，转换代码里 `pixelSpacing: null`（`apps/server/src/services/image-to-dicom.ts:194`）→ 这些图像上 Length 测量单位恒为 `px`，不是 mm。
2. **即使算出了 mm 也存不下来**：见 1.6，前端从不调用保存接口，Cornerstone 内存中的测量值从未写入 `annotations.geometry`。因此"已存储测量值"的校准状态实际为：**无任何带单位的存储值**（seed 只有像素点）。

**结论 2**：路线图层面 #51（校准）**未实施**（L1 验收全未勾选）。Cornerstone 库内置的校准链（PixelSpacing → mm）技术上可用，但 (a) 仅对带 PixelSpacing 的原生 DICOM 生效，(b) 转换图像无像素间距，(c) 计算结果因保存链路未接而从不落库。当前 `geometry` 里若有数值，单位只能是像素（且现实中只有坐标点，连像素距离都没有）。

---

## 3. 后端假设有效性：`compareMeasurements()` 能否工作？

`compareMeasurements()` 位于 `apps/server/src/routes/follow-up.ts:255-311`。逐条对照：

### 3.1 假设 1：按 `studyId` + `type='measurement'` 查到标注

```ts
where: and(eq(annotations.studyId, baselineStudyId), eq(annotations.type, 'measurement'))   // follow-up.ts:260-264, 268-272
```

- 现实：seed 写入的标注 `studyId` 恒为 `null`（seed.ts:729）；`/annotations/sync` 也写 `ann.studyId || null`（annotations.ts:196）。只有显式用 `POST /annotations` 建的 study 级标注（imageId 为 null）才带 studyId。**按 studyId 过滤会漏掉所有按图像保存的测量。**

### 3.2 假设 2：`geometry.value` 存在

```ts
if (!geometry?.value) continue;          // follow-up.ts:279
const baselineValue = geometry.value;    // follow-up.ts:288
```

- 现实：**任何路径都不写 `geometry.value`**（见 1.5）。sync 格式数值在 `geometry.cachedStats[targetId].length/.area`；seed 格式只有 `points`。**每一条基线标注都会在 279 行被 `continue` 跳过，结果恒为空数组。**

### 3.3 假设 3：`label` 完全相等即匹配

```ts
const matching = comparisonAnnotations.find(a => a.label === baseline.label);   // follow-up.ts:282
```

- 现实：
  - `label` 可空（schema.ts:189），seed 里就有 `null`。
  - 工具侧：Length/Angle/ROI 工具默认**不设置** `data.label`（仅 ArrowAnnotate 有 `data.text`）；工具条（`AnnotationToolbar.tsx`）只有绘图按钮，**没有任何 label 输入 UI**。
  - 现有 label 内容是解剖部位（'黄斑中心凹'）或工具生成的显示文本（'123.4 px'），既非稳定标识符，也无受控词表。两次检查间产生"完全相同的 label"几乎不可能。
  - 即便 label 相同，若不含 `iop/rnfl/c-d/厚度/thickness` 等关键词，`determineTrend` 落到默认分支"数值增大=好转"（follow-up.ts:313-339），对厚度类测量是**反的**。

### 3.4 假设 4：`geometry.unit`，默认 'μm'

```ts
unit: geometry.unit || 'μm',   // follow-up.ts:306
```

- 现实：`geometry.unit` 不存在；Cornerstone 实际单位是 **mm**（Length）**°**（Angle）**mm²**（ROI）**HU**（Probe，见 annotation-sync.ts:94-131 的提取逻辑，虽然该函数也是死代码）。后端默认 'μm' 与任何真实单位都对不上，且把长度/角度/面积/探针值当作同一标量比较，语义混乱。

### 3.5 其他

- `isSignificant = |deltaPercent| > 5`（follow-up.ts:298）硬编码，无置信区间；`studies.studyDate`（schema.ts:85）未被用于排序/时间间隔，随访记录创建时也不校验基线早于对比。
- 前端 **没有任何页面调用 follow-up API**（apps/web 全仓 grep 无 `followUp*` 调用）；`ComparisonPage.tsx` 不涉及 follow-up。服务端 `follow-up.ts` **无任何测试**（apps/server 测试目录无对应文件）。
- 唯一"看起来像"的消费方 `useReportAutofill.ts:93-107` 读取 `geometry.value/result.value/distance/area`，同样与真实存储结构不符 —— 三套代码各自幻想了不同的 geometry 形状。

**结论 3**：`compareMeasurements()` 的三个核心假设（studyId 过滤、`geometry.value`、`label` 精确匹配）与当前数据现实**全部不符**。在现有代码与数据下该函数恒返回空比较结果，或在 label 碰巧相同时产生语义错误（单位错、趋势方向错）的趋势。

---

## 4. 结论：测量值能否可靠地喂养纵向趋势？差距在哪？

**不能。** 当前测量数据既不存在（前端不保存），格式也不对（`value`/`unit` 无写入方），单位也未校准（#51 未做）。`compareMeasurements()` 是建立在空想数据模型上的实现。

### 具体差距清单（按优先级）

1. **持久化链路未接通（阻断级）**：`annotation-sync.ts` 是死代码，无人监听 `ANNOTATION_COMPLETED`，`annotationApi.sync` 无人调用，`deserializeAnnotations` 是占位空实现。前端画出的测量只存在于内存，随视口销毁丢失。→ 需接通 保存(serialize → POST /annotations/sync) 与 恢复(GET /annotations/image/:id → annotationState.restore) 两条链路。
2. **geometry 形状契约缺失（阻断级）**：三种写入形状（`{points}` / `{toolName,handles,cachedStats}` / 任意 JSON）互不兼容；`compareMeasurements` 读 `geometry.value`，实际数值在 `cachedStats[targetId].length/.area/.angle`。→ 需统一 schema（建议约定 `{ toolName, handles, cachedStats }` 为标准），并让后端读取器适配 cachedStats 嵌套结构，或落库前把数值/单位提升为顶层字段。
3. **校准链路未完成**：#51 未实施，L1 验收未过；转换图像（PNG/JPG→DICOM）无 PixelSpacing → 单位为 px。→ 需为转换图像提供像素间距来源（如 Sharp 提取的物理尺寸/已知设备参数），并至少在落库时把 Cornerstone 计算出的 `cachedStats[targetId].unit`（mm/px）一并持久化。
4. **无跨次随访的身份标识**：`label` 可空、无输入 UI、无受控词表，精确匹配不可行。→ 需引入测量标识体系（如固定的解剖测量点位/标签字典，或按语义锚点匹配），供两次检查对齐。
5. **单位/语义不一致**：后端默认 'μm' 与前端 'mm'、'°'、'mm²' 冲突；趋势方向依赖 label 关键词，对未知类型默认"增大=好转"，对厚度类（减小=恶化）是错的。→ 趋势判断应基于 `type`+`unit` 或受控测量定义，而非自由文本关键词。
6. **无验证**：`compareMeasurements` 无单元测试，前端无 follow-up UI，需要按上述修复后补测试与端到端数据验证（含 seed 中真实测量样例）。

### 引用摘要（primary sources）

| 事实 | 来源 |
|---|---|
| annotations 表：geometry 为自由 JSON，无 value/unit 列，label 可空 | `apps/server/src/db/schema.ts:178-197` |
| seed 写 `{points}`、studyId=null、label 为解剖部位或 null | `apps/server/src/db/seed.ts:722-744` |
| /sync 写 `{toolName,handles,cachedStats}`，studyId=null | `apps/server/src/routes/annotations.ts:186-201` |
| 前端 SerializedAnnotation 设计口径 | `apps/web/src/stores/measurementStore.ts:14-28` |
| serializeAnnotations 序列化实现 | `apps/web/src/lib/cornerstone/annotation-sync.ts:20-64` |
| 保存/恢复/提取函数均无调用方（死代码） | 全仓 grep（仅文件自引用） |
| deserializeAnnotations 为占位空实现 | `apps/web/src/lib/cornerstone/annotation-sync.ts:71-79` |
| CornerstoneViewport 无任何标注事件/保存/恢复 | `apps/web/src/components/viewer/CornerstoneViewport.tsx`（全文 323 行） |
| LengthTool cachedStats = {length, unit, statsArray} | `node_modules/@cornerstonejs/tools/dist/esm/tools/annotation/LengthTool.js`（`_calculateCachedStats`） |
| AngleTool cachedStats = {angle}；RectangleROITool = {area, areaUnit, ...} | 同目录 `AngleTool.js`、`RectangleROITool.js` |
| 校准函数 `unit = hasPixelSpacing ? 'mm' : 'px'` | `node_modules/@cornerstonejs/tools/dist/esm/utilities/getCalibratedUnits.js` |
| 服务端解析 PixelSpacing 并落库 | `apps/server/src/services/dicom/parser.ts:168-172,228`；`storage.ts:104-112` |
| 转换图像 pixelSpacing=null | `apps/server/src/services/image-to-dicom.ts:194` |
| #51 测量校准未完成；L1/L3 验收未勾选 | `docs/L3-ROADMAP.md:11,25,109,129` |
| compareMeasurements 假设与实现 | `apps/server/src/routes/follow-up.ts:255-311`（279/282/288/306 行为关键） |
| 前端无 follow-up API 调用、无测试 | 全仓 grep；`apps/server/tests/` 无对应文件 |
