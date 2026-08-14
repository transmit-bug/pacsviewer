# 多帧 DICOM 在 Cornerstone wadouri 下的加载链路调研

> Research ticket: transmit-bug/pacsviewer #105（只读调研，未修改任何代码）
> 调研范围：已安装库源码 `node_modules/@cornerstonejs/dicom-image-loader@5.6.2`、`@cornerstonejs/core@5.6.2`、`@cornerstonejs/tools@5.6.2`、`@cornerstonejs/metadata`（与 `apps/web/package.json` 声明的 ^5.6.2 一致）；仓库源码（file:line）；Hono 中间件/路由语义经最小复现程序实测。
> 结论全部可追溯到主源（库源码 / DICOM 标签 / 仓库代码）。

---

## 1. Cornerstone 侧：wadouri 多帧 DICOM 的加载机制

### 1.1 imageId 的 `#frame=N` 参数语义（parseImageId）

wadouri 多帧的 imageId 形如 `wadouri:http://host/xxx.dcm?frame=3`（也接受 `#frame=3` / `&frame=3`）。解析函数是
`dist/esm/imageLoader/wadouri/parseImageId.js`（全文 22 行）：

```js
const frameIndex = url.indexOf('frame=');
if (frameIndex !== -1) {
    const frameStr = url.substring(frameIndex + 6);
    frame = parseInt(frameStr, 10);          // 1-based
    url = url.substring(0, frameIndex - 1);  // 剥掉 '?'/'#' 前缀及之后的内容
}
...
pixelDataFrame: frame !== undefined ? frame - 1 : undefined,   // 转 0-based
```

- 用子串查找 `frame=`（不区分 `?`/`&`/`#` 前缀），取出的 `frame` 是 **1-based**，loader 内部统一转成 0-based 的 `pixelDataFrame`。
- `url.substring(0, frameIndex - 1)` 同时把 `frame=` 之前紧邻的 `?`/`#` 与后面全部内容剥掉，得到"无帧号"的基础 URL。
- 库内规范形式是 `?frame=N`：`dataSetCacheManager.get()` 用正则 `/[?&]frame=/` 判定多帧（`wadouri/dataSetCacheManager.js:15`）；metadata provider 取到带帧 imageId 后把帧号重序列化为 `&frame=N`（`wadouri/metaData/metaDataProvider.js:63-66`）。`#frame=N` 能被解析，但不是库的规范书写；`#` 是 URL fragment，不会随请求发给服务器——对本仓库"整文件取回、客户端切帧"的 wadouri 全文件路径没有影响。
- **陷阱**：`frame` 是 1-based。若生成 `frame=0`（例如 `#frame=${i}` 且 i 从 0 起），则 `pixelDataFrame = -1`，帧提取会读到错误偏移（见 1.2、2.3）。

### 1.2 帧提取：单文件多帧 → 单帧 pixel data

wadouri 的加载入口（`wadouri/loadImage.js`，v5.6.2 默认注册的是 `loadImageFromNaturalizedMetadata`，`useLegacyMetadataProvider: true` 时回退到 `loadImage`；两者实现同一契约）：

1. **整文件只取一次，按"无帧号 URL"缓存**：`dataSetCacheManager.load(parsedImageId.url, schemeLoader, imageId)`（`wadouri/loadImage.js:102-108`、`wadouri/dataSetCacheManager.js:38-84`）。每个 `?frame=N` imageId 复用同一个已解析 dataSet。
2. **按帧切片**：`getPixelData(dataSet, frameIndex)`（`wadouri/getPixelData.js`）：
   - 封装压缩像素（`encapsulatedPixelData`）→ `getEncapsulatedImageFrame`：`dicomParser.readEncapsulatedImageFrame(dataSet, elements.x7fe00010, frameIndex)`；多片帧（fragments）时用 Basic Offset Table 定位（`wadouri/getEncapsulatedImageFrame.js:7-30`）。
   - 原生未压缩像素 → `getUncompressedImageFrame`：`frameOffset = pixelDataOffset + frameIndex * pixelsPerFrame * (bitsAllocated/8)` 字节偏移后 `buffer.slice()`（`wadouri/getUncompressedImageFrame.js:16-43`）。
3. **只解码这一帧**：`createImage(imageId, pixelData, transferSyntax, options)`（`imageLoader/createImage.js`），产出独立的 Cornerstone Image。
4. 大文件另有一条 partial-content（Range 请求）路径：`dataSetCacheManager.get()` 命中 `[?&]frame=` 时走 `retrieveMultiframeDataset` + `combineFrameInstanceDataset`（按帧从 PerFrameFunctionalGroupsSequence 合成该帧数据集，`wadouri/dataSetCacheManager.js:14-24`、`wadouri/retrieveMultiframeDataset.js`、`wadouri/combineFrameInstanceDataset.js:49-67`）——本仓库未启用（xhrRequest 整文件取回，见 1.5）。

### 1.3 帧数从哪来：`NumberOfFrames (0028,0008)` + 每帧 imageId 数组

- loader 从 DICOM 标签读取帧数：`dataSet.uint16('x00280008')`（`wadouri/metaData/metaDataProvider.js:97`）。官方文档将 dicom-image-loader 的能力描述为 "Supports multi-frame DICOM instances"（cornerstone3D 文档 `docs/concepts/cornerstone-core/imageLoader.md` 的 Image Loader 对照表）。
- **应用负责**根据 `numberOfFrames` 生成逐帧 imageId 数组交给视口；loader 只负责"给我一个带 `frame=N` 的 imageId，我就返回那一帧的图像"。元数据侧对 `imagePixelModule`（rows/columns/PhotometricInterpretation 等）来自整份数据集，帧级差异（ImagePositionPatient 等）经 MULTIFRAME 模块/`combineFrameInstanceDataset` 提供（`wadouri/metaDataProvider.js:39-48`）。

### 1.4 与 StackViewport.setImageIdIndex / CinePlayer 的契约

`@cornerstonejs/core` 的 StackViewport（`dist/esm/RenderingEngine/StackViewport.js`）：

- `imageIds: string[]` 是"每帧/每切片一条 imageId"的数组（:54、:1306-1310 `setStack(imageIds, currentImageIdIndex = 0)`）。
- `setImageIdIndex(imageIdIndex)` → `_setImageIdIndex` → `_loadAndDisplayImage(this.imageIds[imageIdIndex], ...)`；越界抛错（:1730-1737）。它**只认数组下标**，不理解"帧"——帧与下标的映射完全由 imageId 数组的构造方式决定。
- `scroll(delta)`：基于 `targetImageIdIndex` 计算新下标（clamp 或 loop），防抖后调用 `setImageIdIndex`，并触发 `STACK_VIEWPORT_SCROLL` 事件（:1774-1804）。
- `getNumberOfSlices()` = `imageIds.length`（:121-123）；`getCurrentImageIdIndex()`（:328）、`getTargetImageIdIndex()`（:333-335）、`getCurrentImageId()`（:340-342）。

`@cornerstonejs/tools` 的 CinePlayer（`playClip`，`dist/esm/utilities/cine/playClip.js`）：

- 对 StackViewport 的播放上下文：`numScrollSteps = viewport.getImageIds().length`；`currentStepIndex = viewport.getTargetImageIdIndex()`；`scroll(delta)` → `csUtils.scroll(viewport, {delta, debounceLoading})` → `viewport.scroll(delta)` → `setImageIdIndex`（playClip.js:337-362；`@cornerstonejs/core` `utilities/scroll.js:9-38`）。
- 播放循环：`window.setInterval(playClipAction, 1000/fps)`（playClip.js:171-174），每 tick 步进 1 帧，支持 loop / bounce / frameTimeVector。

**契约结论**：`#frame=N`（`?frame=N`）→ loader 提取单帧；StackViewport 只依赖"按帧展开的 imageIds 数组 + setImageIdIndex 下标"；CinePlayer（无论库内置还是自研）都只是周期性调用下标导航。三者中间不需要任何额外接线——只要应用按帧数构造 imageId 数组。

### 1.5 本仓库 loader 的初始化形态（重要背景）

`apps/web/src/lib/cornerstone/init.ts:41-60`：`dicomImageLoader.init({ useLegacyMetadataProvider: true, beforeSend: ... })` ——

- `useLegacyMetadataProvider: true` 走 `wadouri/register.js` 的 legacy 分支，注册 `dicomweb/wadouri/dicomfile` 三个 scheme 到 `loadImage`（整文件 XHR + 客户端切帧，register.js:9-21）。
- `beforeSend` 在每次 loader XHR 前注入 `Authorization: Bearer <token>`（`imageLoader/internal/xhrRequest.js:17-27`）。**loader 发起的图像请求是带认证的**；裸 `fetch` 则不带。
- 注释说明：默认 NATURALIZED provider 在单帧 DICOM 上取不到像素数据（渲染全黑），故仓库固定走 legacy。

---

## 2. 本仓库现状：数据模型、端点挂载、帧导航链路

### 2.1 数据模型：`dicomFrames` 是"按帧元数据"表，像素仍在单文件

- `images.numberOfFrames`（`apps/server/src/db/schema.ts:145`，默认 1）+ `dicom_frames` 表（schema.ts:156-174）：`imageId`（FK→images.id）、`frameIndex`（**0-based**）、`frameType`、`instanceNumber`、`temporalPositionIdentifier`、`frameAcquisitionDateTime`、`sliceLocation`、`imagePositionPatient`、`imageOrientationPatient`、`metadata`(JSON)，唯一索引 `(imageId, frameIndex)`。
- 写入方：`apps/server/src/services/dicom/storage.ts:139`（`parseResult.frames`），帧元数据来自 `parser.ts` 的 `extractFrames`（parser.ts:247-314）——解析 `PerFrameFunctionalGroupsSequence` 下的 FrameContent/PlanePosition/PlaneOrientation/PixelMeasures，**不含像素数据**。
- **结论**：本仓库模型与 Cornerstone wadouri 模型一致——"单文件多帧 + 按帧元数据旁路表"，不是按帧像素存储。像素始终在单个 DICOM 文件里，由 `/api/images/:id/file` 整文件下发，浏览器端切帧。这个模型本身没有问题。

### 2.2 端点挂载错位 + 认证缺口（已实测）

**服务端**（`apps/server/src/index.ts`）：
- `app.use('/api/*', authMiddleware)`（:59）、`app.use('/api/*', auditMiddleware)`（:60）——`/api/*` 全部要求 Bearer token。
- `app.route('/dicomweb', dicomwebRouter)`（:78）——挂在 **`/dicomweb`**，不在 `/api/*` 下，**不受认证保护**（本身是认证漏洞）。
- dicomweb 路由内的帧端点：`GET /images/:imageId/frames`（`apps/server/src/routes/dicomweb.ts:203-241`），返回 `{ imageId, numberOfFrames, frames[] }`（帧元数据，非像素）。

**客户端**：
- `apps/web/src/components/viewer/CornerstoneViewport.tsx:227` 与 `:302`：`fetch('/api/dicomweb/images/${imageId}/frames')` —— **路径错**（服务端没有 `/api/dicomweb`）且 **裸 fetch 无 Authorization 头**。
- `apps/web/src/services/api.ts:118`：`dicomwebApi.getFrames = (imageId) => api.get('/dicomweb/images/${imageId}/frames')`，axios 实例 `baseURL: '/api'`（api.ts:6）→ 实际请求 **`/api/dicomweb/images/...`**——同样错位，但 axios 拦截器会带 token（api.ts:13-25）。该 helper 只在 `apps/web/src/hooks/useOctNavigation.ts:72` 使用。

**Hono 中间件/路由语义实测**（最小复现，与 index.ts 相同的 `use('/api/*') → route('/dicomweb')` 顺序）：

```
GET /dicomweb/images/abc/frames           无 token → 200（未受保护，挂载点正确）
GET /api/dicomweb/images/abc/frames       无 token → 401 未认证（/api/* 中间件先于路由执行）
GET /api/dicomweb/images/abc/frames       Bearer x → 404（路由不存在，挂载错位）
GET /api/images/abc/file                  Bearer x → 200（图像文件端点正常）
GET /api/images/abc/file                  无 token → 401
```

即前端实际发出的请求**先被 `/api/*` 认证中间件以 401 拦下**；即使补上 token，也会因挂载错位 404。无论哪种，`resp.ok === false` → CornerstoneViewport 回退到 `viewport.setStack([csImageId])` + `setTotalFrames(1)`（:227-250、:302-325），**多帧检测恒失败**。ticket 中"挂载错位且裸 fetch 无认证 → 多帧检测恒失败"的两点都成立，且 401 是当前最先触发的失败。

### 2.3 帧号 off-by-one（即使端点通了也会坏）

`CornerstoneViewport.tsx:233` 与 `:308`：`Array.from({length: nFrames}, (_, i) => \`${base}#frame=${i}\`)` —— i 从 0 起，即 `#frame=0..#frame=N-1`。而 loader 的 `frame` 是 1-based（1.1）：`#frame=0` → `pixelDataFrame=-1` → `getUncompressedImageFrame(dataSet, -1)` 负偏移读尾端垃圾 / `readEncapsulatedImageFrame(..., -1)` 失败；同时最后一帧 `#frame=N-1` 永远映射不到文件第 N-1 帧（真实最后一帧不可达）。**应生成 `?frame=${i+1}`（或 `#frame=${i+1}`）**。

### 2.4 帧导航链路现状（CinePlayer）

- 仓库的 CinePlayer（`apps/web/src/components/viewer/CinePlayer.tsx`）是**自研**实现：rAF 循环（:56-84）→ store `setCurrentFrame` → `CornerstoneViewport.tsx:387-400` 的 effect → `viewport.setImageIdIndex(currentFrame)`（:398）。这正是 1.4 里与 StackViewport 的文档化契约，**链路本身正确**。
- `totalFrames <= 1` 时 CinePlayer 直接 `return null`（CinePlayer.tsx:62）、CornerstoneViewport 的导航 effect 直接 `return`（CornerstoneViewport.tsx:389）——所以只要多帧检测恢复，播放器与导航自动复活。
- 库内置 `CineTool`/`playClip` 未被使用（无 CineTool 注册、无 playClip 调用）；若日后改用库播放器，其 StackViewport 上下文同样只依赖 `getImageIds().length` 与 `scroll()`→`setImageIdIndex`（1.4），契约一致，无需改动加载链路。

---

## 3. 推荐的最小正确实现路径

### 3.1 统一挂载点 + 修认证缺口（二选一）

**方案 A（推荐）**：把 dicomweb 挂到 `/api` 下并让客户端走 axios helper——
- 服务端一行：`apps/server/src/index.ts:78` 改为 `app.route('/api/dicomweb', dicomwebRouter)`。立即落入 `/api/*` 的 authMiddleware + auditMiddleware，**同时消除 `/dicomweb` 无认证的漏洞**。
- 客户端：把 `CornerstoneViewport.tsx:227/302` 的两处裸 `fetch` 换成 `dicomwebApi.getFrames(imageId)`（`services/api.ts:118`，axios 拦截器自动带 token；响应即 `{imageId, numberOfFrames, frames}`，与现有读取逻辑 `resp.json()` 兼容）。`useOctNavigation.ts` 现有调用同步恢复。
- 改动面：1 处服务端挂载 + 2 处前端调用点。ticket 中"统一挂载点/请求路径、修认证"一次解决。

**方案 B**：保持 `/dicomweb` 挂载——客户端两处路径改 `/dicomweb/images/...`，并对 dicomweb 路由显式加认证（`dicomwebRouter.use(authMiddleware)` 或在 index.ts 加 `app.use('/dicomweb/*', authMiddleware)`），裸 fetch 需手动带 `Authorization`。改动点更多、认证容易漏。

### 3.2 帧号改 1-based

`CornerstoneViewport.tsx:233/:308`：`?frame=${i + 1}`（规范形式，与 loader metadata/Range 路径的 `&frame=` 重序列化兼容）或 `#frame=${i + 1}`。修掉 2.3 的 off-by-one 后，`setImageIdIndex(k)` ↔ 文件第 k 帧一一对应。

### 3.3 帧导航链（已具备，无需新增组件）

多帧检测恢复后：store `currentFrame` → `viewport.setImageIdIndex` → loader 按 `frame` 提取/解码 → 渲染，链路已通。CinePlayer（自研 rAF 播放）无需改动；若要官方 `playClip`/`CineTool`，按 1.4 的同一契约接入即可，不改加载链路。

### 3.4 `dicomFrames` 模型保持不变

按帧元数据落库、像素留在单文件是正确的 wadouri 模型（2.1），无需改表。`/frames` 端点以 `images.numberOfFrames` 兜底（dicomweb.ts:205-212），即使 `dicom_frames` 无行（老数据）也会返回正确帧数，多帧检测仍可用。

### 3.5 派生事项（建议后续 ticket）

1. **大文件加载体验**：wadouri 全文件取回，OCT 大体积文件首帧延迟高（数据在缓存层，`dataSetCacheManager` 按 URL 缓存整份 dataSet）。可评估启用 partial-content/Range 路径（`dataset-from-partial-content.js` + `rangeRequest.js`，需服务端 `/api/images/:id/file` 支持 Range——`Bun.file` 原生支持）或改 wadors 按帧拉取。
2. **WADO-RS 帧端点语义**：`dicomweb.ts` 的 `/studies/.../instances/:uid/frames/:frameIndex` 目前返回的是**帧元数据**而非像素流，并非标准 WADO-RS 帧检索；若做真 wadors 接入需另实现。
3. **端到端验证**：修复后需用真实多帧 DICOM（FFA/ICGA/OCT 时间序列、OCT B-scan 体）验证：`totalFrames>1`、CinePlayer 可播放、`setImageIdIndex` 导航正确、`#frame=0` 问题不再出现；补一个 parseImageId 帧号语义的单测。

---

## 引用摘要（primary sources）

| 事实 | 来源 |
|---|---|
| `frame=` 解析：1-based、`pixelDataFrame=frame-1`、剥 `?`/`#` | `node_modules/@cornerstonejs/dicom-image-loader/dist/esm/imageLoader/wadouri/parseImageId.js`（全文） |
| 整文件按"无帧 URL"缓存一次；`getPixelData(dataSet, frame)` 切帧 | `.../wadouri/loadImage.js:102-108`；`.../wadouri/dataSetCacheManager.js:38-84` |
| 封装像素 `readEncapsulatedImageFrame`；原生像素字节偏移 slice | `.../wadouri/getEncapsulatedImageFrame.js:7-30`；`.../wadouri/getUncompressedImageFrame.js:16-43` |
| 帧数标签 `x00280008`（NumberOfFrames） | `.../wadouri/metaData/metaDataProvider.js:97` |
| `#frame=0 → pixelDataFrame=-1` 的 0-based 陷阱 | `parseImageId.js`（frame-1 运算） |
| 多帧 metadata：`[?&]frame=` 判定 + combineFrameInstanceDataset | `.../wadouri/dataSetCacheManager.js:15`；`.../wadouri/combineFrameInstanceDataset.js:49-67` |
| 官方能力声明 "Supports multi-frame DICOM instances" | cornerstone3D docs `concepts/cornerstone-core/imageLoader.md`（Image Loader 表） |
| StackViewport：`imageIds` 数组、`setStack`、`setImageIdIndex`→`_loadAndDisplayImage`、`scroll`、`getNumberOfSlices` | `node_modules/@cornerstonejs/core/dist/esm/RenderingEngine/StackViewport.js:54,121-123,1306-1310,1730-1737,1774-1804` |
| CinePlayer 契约：`numScrollSteps=getImageIds().length`、`scroll→viewport.scroll→setImageIdIndex`、`setInterval(1/fps)` | `node_modules/@cornerstonejs/tools/dist/esm/utilities/cine/playClip.js:337-362,171-174`；`@cornerstonejs/core/dist/esm/utilities/scroll.js:9-38` |
| 仓库 loader 初始化：legacy provider + beforeSend 注入认证 | `apps/web/src/lib/cornerstone/init.ts:41-60` |
| 裸 fetch `/api/dicomweb/images/{id}/frames`（两处） | `apps/web/src/components/viewer/CornerstoneViewport.tsx:227,302` |
| `#frame=${i}` 0-based 生成 | `apps/web/src/components/viewer/CornerstoneViewport.tsx:233,308` |
| axios helper 实际路径 `/api/dicomweb/...`（baseURL `/api`） | `apps/web/src/services/api.ts:6,118`；`useOctNavigation.ts:72` |
| 服务端：`/api/*` 认证、`/dicomweb` 挂载、帧端点实现 | `apps/server/src/index.ts:59-60,78`；`apps/server/src/routes/dicomweb.ts:203-241` |
| 中间件先于路由执行：`/api/dicomweb` 无 token→401、带 token→404；`/dicomweb`→200 | Hono 最小复现程序实测（与 index.ts 同序） |
| `dicom_frames` 表与 `images.numberOfFrames` | `apps/server/src/db/schema.ts:145,156-174` |
| 帧元数据写入（PerFrameFunctionalGroups 解析） | `apps/server/src/services/dicom/storage.ts:139`；`parser.ts:247-314` |
| CinePlayer 自研 rAF → store → `setImageIdIndex`；`totalFrames<=1` 隐藏 | `apps/web/src/components/viewer/CinePlayer.tsx:56-84,62`；`CornerstoneViewport.tsx:387-400,398,389` |
