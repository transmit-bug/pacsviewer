# ADR-006: 眼科专用工具架构

## 状态

已接受

## 背景

通用医学影像查看器（如 OHIF）提供标准化的 DICOM 渲染和基础测量工具。但眼科临床需要大量领域特定的工具和分析功能，这些无法用通用工具覆盖：

- **眼底彩照**：杯盘比（C/D ratio）、动静脉比（AV ratio）、病灶分类标记
- **视野检查**：76 点阈值敏感度图、灰度图、偏差图、模式偏差图
- **角膜地形图**：曲率图、厚度图、前后表面高度图
- **IOL 度数计算**：SRK/T、Haigis、Hoffer Q、Barrett Universal II 公式
- **随访对比**：纵向测量趋势、变化检测、进展分析
- **结构化报告**：眼科专用报告模板（OCT、眼底、FFA、视野、白内障、青光眼、屈光）

这些工具分为两类：
1. **图像渲染类**（视野、角膜地形图）— 不走 Cornerstone，使用 Canvas 2D/SVG
2. **测量标注类**（眼底工具、IOL 计算）— 复用 Cornerstone 标注系统 + 领域计算

## 决策

### 工具分层架构

```
┌─────────────────────────────────────────────────┐
│ 通用层（Cornerstone 原生）                       │
│ - Length, Angle, Probe, ROI                      │
│ - 由 ADR-002 定义                                │
├─────────────────────────────────────────────────┤
│ 眼科领域层                                       │
│                                                  │
│  测量标注类（复用 Cornerstone 标注系统）         │
│  - FundusTools: C/D 比、AV 比、病灶标记         │
│  - IolCalculator: IOL 度数计算                   │
│  - FollowUpAnalysis: 随访对比分析                │
│                                                  │
│  图像渲染类（独立 Canvas 2D/SVG 渲染）          │
│  - VisualFieldViewer: 视野检查图                 │
│  - CornealTopography: 角膜地形图                 │
│  - ThicknessMap: OCT 厚度图                      │
│  - EnfaceProjection: OCT en-face 投影            │
├─────────────────────────────────────────────────┤
│ 报告层                                           │
│ - 眼科专用报告模板                               │
│ - 数据自动填充（从测量结果）                     │
│ - DICOM SR 导出（通过 @cornerstonejs/adapters）  │
└─────────────────────────────────────────────────┘
```

### 渲染方式选择

| 工具 | 渲染方式 | 原因 |
|---|---|---|
| 视野检查图 | Canvas 2D | 数据是离散点阵，不是像素图像 |
| 角膜地形图 | Canvas 2D | 数据是 2D 矩阵，需要色彩映射 |
| OCT 厚度图 | Canvas 2D | 热力图渲染，叠加到 en-face 视图 |
| OCT en-face | Canvas 2D | 投影图，非 DICOM 图像 |
| 眼底标注 | Cornerstone 原生 | 标注叠加到 DICOM 图像上 |
| IOL 计算 | 纯计算 | 无渲染，表单输入 + 结果输出 |

### 色彩映射统一

所有需要色彩映射的工具（厚度图、视野、角膜地形图）统一使用 `colormap` 库：

```typescript
import colormap from "colormap";

// 统一的色彩映射配置
const COLORMAPS = {
  viridis: { colormap: "viridis", nshades: 256 },
  jet: { colormap: "jet", nshades: 256 },
  hot: { colormap: "hot", nshades: 256 },
  gray: { colormap: "greys", nshades: 256 },
};
```

### 数据存储

眼科测量数据存储在 `ophthalmologyMeasurements` 表中，与通用标注（`annotations` 表）分离：

```
annotations 表：通用标注（箭头、文字、ROI、测量）
ophthalmologyMeasurements 表：眼科专用测量（C/D 比、RNFL 厚度、IOL 度数等）
```

这种分离的原因：
- 通用标注可以导出为 DICOM SR
- 眼科测量需要额外的领域元数据（region、laterality、trend）
- 查询模式不同（通用标注按 imageId 查，眼科测量按 studyId + type 查）

### 随访对比架构

随访对比是跨 Study 的纵向分析，不绑定到单个图像：

```
Patient
  ├── Study (2024-01-15) → OCT 测量: 中心凹厚度 245μm
  ├── Study (2024-04-15) → OCT 测量: 中心凹厚度 238μm
  └── Study (2024-07-15) → OCT 测量: 中心凹厚度 233μm
                              ↓
                    FollowUpRecord
                    trend: "worsening" (-12μm, -4.9%)
```

## 理由

1. **复用 Cornerstone 标注系统**：眼底标注（C/D 比、病灶标记）叠加在 DICOM 图像上，使用 Cornerstone 原生标注工具，保持坐标系一致性
2. **独立 Canvas 渲染**：视野和角膜地形图的数据不是像素图像，无法用 Cornerstone 渲染，Canvas 2D 是正确选择
3. **`colormap` 统一**：避免每个工具自己实现色彩映射，一个库覆盖所有需求
4. **数据分离存储**：通用标注和眼科测量的查询模式不同，分离存储更高效
5. **报告模板可扩展**：模板使用 JSON schema 定义，支持自定义模板

## 后果

- 眼科工具组件在 `components/ophthalmology/` 目录下，与通用 `components/editor/` 分离
- 视野和角膜地形图的渲染不经过 Cornerstone，需要独立的缩放/平移实现
- 眼科测量数据需要独立的 API 端点（`/api/ophthalmology/measurements`）
- 随访对比需要跨 Study 的查询能力
- 报告模板需要支持动态字段（从测量结果自动填充）
