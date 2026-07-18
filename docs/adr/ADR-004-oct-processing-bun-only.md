# ADR-004: OCT 图像处理纯 Bun 实现

## 状态

已接受

## 背景

OCT（光学相干断层扫描）是眼科最核心的影像模态。专业的 OCT 分析需要：
- 视网膜层边界检测（ILM、RNFL、GCL、IPL、INL、OPL、ONL、ELM、ISOS、RPE、BM）
- 层厚度计算（逐点厚度 → 厚度图）
- en-face 投影（平均/最大投影）
- ETDRS 网格分区分析

通常这些功能由 Python 生态（OpenCV + scikit-image + numpy）实现。但项目要求全 Bun 生态。

## 决策

**使用 `image-js` 库 + 自研领域特定算法实现 OCT 图像处理。**

> **审查更新（2026-07-17）：** 底层图像处理（边缘检测、滤波、形态学）使用 `image-js` 库，仅自研 OCT 领域特定的层检测逻辑。详见 Issue #55 评论。

### 算法实现

1. **底层处理（`image-js` 库）**：
   - Sobel/Canny 边缘检测
   - 高斯滤波去噪
   - 形态学操作
   - 阈值分割

2. **视网膜层检测（自研，~200 行）**：
   - 基于 `image-js` 边缘检测结果
   - 对每个 A-scan（列）寻找梯度峰值
   - 使用相邻 A-scan 连续性约束平滑边界
   - 三次样条插值填充检测失败区域

3. **厚度计算（自研，~50 行）**：逐点层间距 × pixelSpacing

4. **厚度图生成（自研，~100 行）**：网格化 + 热力图数据

### 性能策略

- 使用 `Float32Array` 和 `Uint8Array` 避免对象开销
- 批量处理像素数据，减少函数调用
- Web Worker 并行处理多个 B-scan（前端）
- 后端处理使用 Bun 的高性能 Buffer 操作

### 图像处理包结构

```
packages/image-processing/src/
├── oct/
│   ├── layers.ts          # 视网膜层检测
│   ├── thickness.ts       # 厚度计算
│   └── enface.ts          # en-face 投影
├── fundus/
│   ├── optic-disc.ts      # 视盘检测
│   └── vessels.ts         # 血管检测
└── utils/
    ├── edge-detection.ts  # Sobel/Canny
    └── interpolation.ts   # 曲线插值
```

## 理由

1. **技术栈统一**：全 Bun 生态，不引入 Python 运行时
2. **部署简化**：不需要 Python 环境和依赖管理
3. **`image-js` 成熟**：活跃维护的纯 JS 图像处理库，覆盖所有底层需求
4. **Sharp 已有**：图像 I/O 用 Sharp，算法用 `image-js`
5. **精度可控**：眼科 OCT 分析不需要深度学习级别的精度，传统图像处理算法足够
6. **自研量最小**：仅领域特定逻辑（~350 行）需要自研

## 后果

- 需要引入 `image-js` 依赖
- 需要实现 ~350 行领域特定算法（层检测 + 厚度计算 + ETDRS）
- 精度可能不如 Python 生态的成熟库，需要后续迭代优化
- 如果后续遇到精度瓶颈，可以通过子进程调用编译好的 native addon 解决
