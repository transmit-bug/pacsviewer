# ADR-002: 标注系统重设计

## 状态

已接受

## 背景

当前标注系统由两个独立的实现组成：

1. **Canvas 2D 标注**（`AnnotationTools.tsx` + `AnnotationLayer.tsx`）：在 Canvas overlay 上用绝对像素坐标绘制箭头、文字、画笔、ROI
2. **Cornerstone 工具**（`CornerstoneViewport.tsx`）：注册了 Length、Angle、Probe 等 Cornerstone 原生工具

这两个系统完全脱节：
- Canvas 标注不随 viewport 的 zoom/pan/rotation 变换
- 测量值只有像素，无法关联 DICOM 像素间距
- Canvas 标注无法保存为 DICOM SR（结构化报告）
- 两套坐标系无法互通

## 决策

**废弃 Canvas 2D 标注方案，全面迁移至 Cornerstone 原生 annotation API。**

### 标注数据模型

Cornerstone.js 的标注系统使用世界坐标系（world coordinates），自动处理：
- zoom/pan/rotation 变换
- 像素间距到物理单位的转换
- 多视口同步

标注数据通过 `annotationState` 管理，支持：
- 序列化为 JSON（持久化到后端）
- 反序列化恢复（加载历史标注）
- 导出为 DICOM SR

### 工具映射

| 当前实现 | Cornerstone 原生工具 |
|---|---|
| Canvas arrow | ArrowAnnotateTool |
| Canvas text | AnnotationTool (text) |
| Canvas freehand | FreehandROI / SplineROI |
| Canvas rect-roi | RectangleROI |
| Canvas ellipse-roi | EllipticalROI |
| Canvas polygon-roi | PolygonROI |
| 自实现 length | LengthTool（已有） |
| 自实现 angle | AngleTool（已有） |
| 自实现 probe | ProbeTool（已有） |

### 标注持久化

使用 `@cornerstonejs/adapters` 实现标注 ↔ DICOM SR 转换：

```
前端 Cornerstone annotationState
    ↓ @cornerstonejs/adapters 序列化
DICOM SR (Structured Report)
    ↓ API 调用
后端 annotations 表 { geometry: JSON, srBytes: Buffer }
    ↓ 加载
前端 @cornerstonejs/adapters 反序列化 → annotationState.restore()
```

### 测量校准

测量值通过 DICOM `PixelSpacing` 标签校准：
- `PixelSpacing[0]` = 行间距（mm）
- `PixelSpacing[1]` = 列间距（mm）
- 长度 = 像素距离 × pixelSpacing
- 面积 = 像素面积 × pixelSpacing²

## 理由

1. **坐标系一致性**：Cornerstone 原生标注使用世界坐标系，自动处理所有视口变换
2. **DICOM 兼容**：通过 `@cornerstonejs/adapters` 可导出为 DICOM SR，与其他 PACS 系统互操作
3. **精度保证**：测量值直接关联 DICOM 像素间距，精度到 μm 级
4. **减少代码量**：废弃 ~800 行 Canvas 绘制代码，使用 Cornerstone 内置工具
5. **生态一致性**：与 Cornerstone 渲染引擎深度集成
6. **官方 SR 支持**：`@cornerstonejs/adapters` 提供标准化的标注 ↔ DICOM SR 转换

## 后果

- 废弃 `AnnotationTools.tsx`、`AnnotationLayer.tsx` 的 Canvas 实现
- 废弃 `MeasurementTools.tsx` 的自实现测量逻辑
- 废弃 `editorStore.ts`（合并到新的 `measurementStore.ts`）
- 需要实现标注 ↔ 后端同步逻辑
- 需要扩展 `annotations` 表的 `geometry` 字段格式
- 已有标注数据需要迁移（格式变更）
