# ADR-003: 多帧 DICOM 数据流

## 状态

已接受

## 背景

眼科影像中大量使用多帧 DICOM：
- **OCT B-scan**：49-128 帧，每帧一个 B-scan 切面
- **FFA/ICGA**：30-60 帧，跨越 10-15 分钟的时间序列
- **OCTA**：3D 体积数据，多个 en-face 层面
- **视野检查**：多模式数据（灰度图、偏差图等）

当前系统不支持多帧 DICOM，所有图像按单帧处理。

## 决策

### 数据模型

多帧 DICOM 在数据库中存储为一条 `images` 记录，帧信息存储在 `dicomFrames` 表中：

```
images (1 条记录)
  ├── numberOfFrames: 64
  ├── metadata: { ... DICOM 元数据 ... }
  └── frames (N 条记录)
       ├── frameIndex: 0
       ├── metadata: { PerFrameFunctionalGroupsSequence 的帧级元数据 }
       └── ...
```

### 前端渲染

使用 Cornerstone 的多帧支持：
- imageId 格式：`wadouri:{url}#frame={N}`
- 帧切换：`viewport.setImageIdIndex(frameIndex)`
- Cine 播放：`requestAnimationFrame` + FPS 控制

### 帧导航

```
┌──────────────────────────────────────┐
│  Cornerstone Viewport (当前帧)       │
├──────────────────────────────────────┤
│  Frame Slider  ◄━━━━━●━━━━━━━►      │
│  [◀◀] [◀] [▶/❚❚] [▶▶]  FPS: [10]  │
│  Frame 32/64  Time: 3.2s            │
└──────────────────────────────────────┘
```

### 内存管理

- 只加载当前帧 ± 预加载窗口（前后各 2 帧）
- 使用 LRU 缓存淘汰已远离的帧
- 大体积 OCT（>500MB）支持渐进式加载

## 理由

1. **Cornerstone 原生支持**：`@cornerstonejs/dicom-image-loader` 原生支持多帧 DICOM
2. **数据库效率**：一条 images 记录 + N 条 frames 记录，避免重复存储元数据
3. **前端性能**：帧级懒加载，不一次性加载全部帧
4. **眼科核心需求**：OCT 和 FFA 是眼科最核心的两个模态

## 后果

- 需要新增 `dicomFrames` 表
- `viewerStore` 需要扩展帧导航状态
- 需要实现 Cine 播放控制器
- 前端需要帧级预加载策略
- DICOM 解析器需要支持 `NumberOfFrames` 和 `PerFrameFunctionalGroupsSequence`
