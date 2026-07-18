# ADR-001: DICOM 解析架构

## 状态

已接受

## 背景

当前系统使用自定义 HTTP image loader（`init.ts` 中的 `loadImageViaHttp`）渲染 DICOM 图像，通过 `canvas.drawImage()` 将 DICOM 当作普通 PNG/JPG 处理。这导致：

1. 全部 DICOM 元数据丢失（PixelSpacing、WindowCenter/Width、RescaleSlope/Intercept）
2. 测量值只有像素单位，无法转换为 mm/μm
3. 多帧 DICOM 不支持（OCT B-scan、FFA 时序）
4. DICOM 压缩格式不支持（JPEG2000、RLE、JPEG-LS）

`@pacsviewer/dicom` 包已创建但没有任何源文件。`@cornerstonejs/dicom-image-loader` 和 `dicom-parser` 已在前端 `package.json` 中但从未使用。

> **审查更新（2026-07-17）：** 废弃自研 `@pacsviewer/dicom` 包，改用 `dcmjs`（Cornerstone 官方生态，dcmjs-org 维护）。详见 Issue #47 评论。

## 决策

采用 **后端解析 + DICOMweb API + 前端 WADO 渲染** 的三层架构。

### 数据流

```
DICOM 文件 → 后端 dicom-parser 解析 → 元数据入库 + 文件存储
                                          ↓
                                    DICOMweb API (WADO-RS)
                                          ↓
前端 cornerstoneWADOImageLoader → Cornerstone.js 渲染
```

### 关键组件

1. **`dcmjs` 包**：Cornerstone 官方 DICOM 库，提供解析、序列化、DICOM SR、字符集处理（替代自研 @pacsviewer/dicom）
2. **DICOMweb API**：实现 WADO-RS（图像获取）、STOW-RS（图像存储）、QIDO-RS（查询）
3. **前端 DICOM loader**：使用 `@cornerstonejs/dicom-image-loader` 的 `wadouri:` scheme

### DICOM 元数据提取

从 DICOM 二进制文件中提取四级元数据：
- **Patient**：PatientID, PatientName, BirthDate, Sex
- **Study**：StudyInstanceUID, StudyDate, Modality, AccessionNumber
- **Series**：SeriesInstanceUID, SeriesNumber, SeriesDescription
- **Image**：SOPInstanceUID, Rows, Columns, PixelSpacing, WindowCenter/Width

### 文件存储

```
data/dicom/{studyInstanceUid}/{seriesInstanceUid}/{sopInstanceUid}.dcm
data/thumbnails/{imageId}.jpg
```

## 理由

1. **行业标准**：DICOMweb 是 OHIF、Orthanc、dcm4chee 等主流 PACS 的标准接口
2. **前后端解耦**：后端负责解析和存储，前端只负责渲染，职责清晰
3. **可扩展**：DICOMweb API 可被其他客户端（移动端、第三方系统）直接调用
4. **Bun 兼容**：`dcmjs` 和 `dicom-parser` 都是纯 JavaScript，Bun 原生支持
5. **官方生态**：`dcmjs` 与 Cornerstone 同一团队维护，格式兼容性有保证
6. **已有依赖**：`@cornerstonejs/dicom-image-loader` 和 `dicom-parser` 已在 `package.json` 中

## 后果

- 废弃自研 `@pacsviewer/dicom` 包，改用 `dcmjs`
- 需要重写 `init.ts`，废弃自定义 HTTP loader
- 需要实现 DICOMweb API 路由
- 需要扩展 `images` 表 schema 增加 DICOM 元数据字段
- 前端 imageId 格式从 `http://...` 变为 `wadouri:http://...`
- 已有图像数据需要重新导入（breaking change）
