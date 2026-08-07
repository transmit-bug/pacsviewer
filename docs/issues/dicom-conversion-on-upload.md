# [Feature] PNG/JPG 上传时自动转换为 DICOM 格式

## 背景

当前系统中 PNG/JPG 图片通过自定义 HTTP loader 加载到 Cornerstone.js，但由于 Cornerstone3D 的 VTK WebGL 渲染管线对非 DICOM 图片支持存在缺陷（Canvas 全黑、CPU 渲染路径有 bug），导致这些图片无法正常显示。

Cornerstone.js 对 DICOM 图片的支持是原生且完整的（wadouri: 方案），所有工具（测量、标注、窗宽窗位、缩放、平移）均正常工作。

## 目标

在图片上传阶段，将 PNG/JPG 自动转换为 DICOM 格式存储。前端代码零改动，所有图片统一走 `wadouri:` 方案加载。

## 改动前后的数据流

### 改动前

```
PNG/JPG 上传 → 保存原文件 → DB format:'png' → 前端 HTTP loader → 黑屏
DICOM 上传   → DICOM store → DB format:'dicom' → 前端 wadouri: → 正常
```

### 改动后

```
PNG/JPG 上传 → 转成 DICOM → DICOM store → DB format:'dicom' → 前端 wadouri: → 正常
DICOM 上传   → DICOM store → DB format:'dicom' → 前端 wadouri: → 正常（不变）
```

## 实现方案

### 1. 新增转换服务 `apps/server/src/services/image-to-dicom.ts`

职责：接收 PNG/JPG buffer + 元数据，输出 DICOM Part 10 文件 buffer。

```typescript
interface ConvertOptions {
  imageBuffer: Buffer;           // 原始 PNG/JPG 文件
  width: number;
  height: number;
  bitsPerSample: number;         // 通常 8
  samplesPerPixel: 1 | 3;       // 灰度=1, RGB=3
  patientName?: string;
  patientId?: string;
  studyInstanceUid?: string;
  seriesInstanceUid?: string;
  instanceNumber?: number;
}

interface ConvertResult {
  dicomBuffer: Buffer;           // DICOM Part 10 文件
  sopInstanceUid: string;
  transferSyntaxUid: string;
}

export function convertImageToDicom(options: ConvertOptions): ConvertResult
```

关键实现点：
- 使用 Sharp 解码 PNG/JPG → raw pixel data
- 使用 dcmjs（已有依赖）构建 DICOM Dataset
- Transfer Syntax: `1.2.840.10008.1.2.1`（Explicit VR Little Endian，无压缩）
- 必填 DICOM Tag：
  - Patient Module: PatientName, PatientID
  - General Study: StudyInstanceUID, StudyDate
  - General Series: SeriesInstanceUID, Modality (默认 'OT')
  - SOP Common: SOPInstanceUID (新生成), SOPClassUID (Secondary Capture)
  - Image Pixel: Rows, Columns, BitsAllocated, SamplesPerPixel, PhotometricInterpretation, PixelData

### 2. 修改上传端点 `apps/server/src/routes/images.ts`

修改 `POST /upload` 端点：

```
现有流程:
  processImage() → writeFile(原文件) → db.insert(format: ext)

改为:
  processImage() → writeFile(原文件, 保留用于缩略图)
                → convertImageToDicom()  // 新增
                → storeDicomFile()       // 复用现有 DICOM 存储
                → db.insert(format: 'dicom', filePath: dicom路径)
```

### 3. 存量数据迁移脚本 `apps/server/src/scripts/migrate-images-to-dicom.ts`

- 遍历 DB 中 `format != 'dicom'` 的图片记录
- 读取原文件 → 转换 → 存储 DICOM → 更新 DB 记录
- 可重复执行（跳过已转换的）

## 改动文件清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `apps/server/src/services/image-to-dicom.ts` | 新增 | PNG/JPG → DICOM 转换服务 |
| `apps/server/src/routes/images.ts` | 修改 | `POST /upload` 增加转换步骤 |
| `apps/server/src/scripts/migrate-images-to-dicom.ts` | 新增 | 存量数据迁移脚本 |
| `apps/server/package.json` | 可能 | 确认 dcmjs 可在服务端使用 |

## 不改动的部分

- 前端所有代码（CornerstoneViewport、ImageViewer、ViewerPage 等）
- 数据库 schema（format 字段值从 'png' 变为 'dicom'，字段本身不变）
- DICOM 上传端点 `POST /upload-dicom`（已经正常工作）
- 缩略图生成逻辑（仍从原文件生成）

## 依赖

- `dcmjs` — 已在 monorepo 中，需确认服务端可用
- `sharp` — 已在服务端使用

## 验收标准

1. 上传 PNG/JPG 后，DB 记录 `format` 为 `'dicom'`
2. `GET /api/images/:id/file` 返回 DICOM 文件（Content-Type: application/dicom）
3. 前端 CornerstoneViewport 正常显示图片（非黑屏）
4. 所有 Cornerstone 工具正常工作（平移、缩放、窗宽窗位、测量标注）
5. 缩略图仍正常显示
6. 原有 DICOM 上传功能不受影响

## 风险

- **dcmjs 服务端兼容性**：dcmjs 主要面向浏览器环境，需验证在 Bun/Node 下是否正常工作。如不可用，可用手写 DICOM 二进制格式（结构简单，参考 DICOM Part 10 标准）。
- **存量迁移**：大量图片时迁移耗时，需支持断点续传。
