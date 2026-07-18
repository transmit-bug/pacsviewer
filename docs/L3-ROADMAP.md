# PACS Viewer L3 路线图

> 从 L0（图片查看器）到 L3（临床 PACS）的升级路线。
> 技术栈：全 Bun 生态。架构决策详见 `docs/adr/`。

## 目标层级

| 层级 | 名称 | 特征 | 状态 |
|---|---|---|---|
| **L0** | 图片查看器 | 能看图，无医学语义 | ✅ 当前 |
| **L1** | 医学影像查看器 | DICOM 解析、WL 校准、像素间距、校准测量 | 🔜 Phase 1 |
| **L2** | 专业影像工作站 | OCT/眼底/FFA/视野/角膜专用查看与测量 | 🔜 Phase 2 |
| **L3** | 临床 PACS | DICOM 网络、设备对接、结构化报告、审计追溯 | 🔜 Phase 3 |

## Phase 1: DICOM 基础（L0 → L1）

> 目标：能正确解析和渲染 DICOM 图像，测量值有真实单位。

| Issue | 标题 | 关键依赖 |
|---|---|---|
| #47 | DICOM 解析 — 使用 `dcmjs` | 无 |
| #48 | DICOMweb API（WADO-RS / STOW-RS / QIDO-RS） | #47 |
| #49 | 前端 Cornerstone DICOM Loader 集成 | #48 |
| #50 | 标注重构 — 使用 `@cornerstonejs/adapters` | #49 |
| #51 | 测量工具校准（像素 → mm） | #49 |
| #52 | 多帧 DICOM 支持与 Cine 播放 | #48 |
| #53 | DICOM 元数据查看器增强 | #49 |

**架构决策：** [ADR-001](adr/ADR-001-dicom-parsing-architecture.md), [ADR-002](adr/ADR-002-annotation-system-redesign.md), [ADR-003](adr/ADR-003-multiframe-dicom.md)

**关键库：**
- `dcmjs` — DICOM 解析/序列化/SR（替代自研 @pacsviewer/dicom）
- `@cornerstonejs/dicom-image-loader` — 前端 DICOM 渲染（已有）
- `@cornerstonejs/adapters` — 标注 ↔ DICOM SR 转换
- `dicom-parser` — 底层 DICOM 二进制解析（已有）

## Phase 2: 眼科模态（L1 → L2）

> 目标：支持眼科核心模态的专业查看和测量。

| Issue | 标题 | 关键依赖 |
|---|---|---|
| #54 | OCT B-scan 浏览器 | #52 |
| #55 | OCT 视网膜层检测与厚度计算 — 使用 `image-js` | #54 |
| #56 | OCT Thickness Map 渲染 — 使用 `colormap` | #55 |
| #57 | 眼底彩照专用工具（C/D 比、AV 比） | #51 |
| #58 | FFA/ICGA 时序浏览器 | #52 |
| #59 | 视野检查图渲染 | 无 |
| #60 | 角膜地形图渲染 | 无 |
| #61 | 眼科专用报告模板 | #55, #57, #58, #59 |

**架构决策：** [ADR-004](adr/ADR-004-oct-processing-bun-only.md), [ADR-006](adr/ADR-006-ophthalmology-tools.md)

**关键库：**
- `image-js` — OCT 图像处理（边缘检测、滤波、形态学）
- `colormap` — 科学可视化色彩映射（viridis/jet/hot/plasma）
- `sharp` — 后端图像 I/O（已有）

## Phase 3: 临床工作流（L2 → L3）

> 目标：完整的 DICOM 网络、设备对接、结构化报告、审计追溯。

| Issue | 标题 | 关键依赖 |
|---|---|---|
| #62 | DICOM C-STORE SCP — 接收设备图像 | #47 |
| #63 | DICOM Worklist（C-FIND SCP） | #62 |
| #64 | 图像上传完善（拖拽/批量/DICOMDIR） | #48 |
| #65 | 随访对比功能（纵向分析/趋势图） | #55 |
| #66 | IOL 度数计算器 | 无 |
| #67 | 审计日志增强 | 无 |

**架构决策：** [ADR-005](adr/ADR-005-dicom-network-protocol.md), [ADR-006](adr/ADR-006-ophthalmology-tools.md)

**关键库：**
- Bun `net` 模块 — DICOM 上层协议（TCP 服务器）
- `dcmjs` — DICOM SR 生成（报告模板）

## 依赖关系

```
#47 → #48 → #49 → #50 (标注重构)
               │      ├──→ #51 (测量校准) → #57 (眼底工具)
               │      └──→ #53 (元数据查看器)
               └──→ #52 (多帧) → #54 (OCT) → #55 (层检测) → #56 (厚度图)
                                   │                       │
                                   └──→ #58 (FFA)          ├──→ #61 (报告模板)
                                                            └──→ #65 (随访对比)
#47 → #62 (C-STORE) → #63 (Worklist)
#48 → #64 (上传完善)

独立: #59 (视野检查), #60 (角膜地形图), #66 (IOL计算), #67 (审计日志)
```

## npm 依赖总览

| 包 | 用途 | 引入 Phase | 状态 |
|---|---|---|---|
| `dcmjs` | DICOM 解析/序列化/SR | Phase 1 | 🆕 新增 |
| `@cornerstonejs/dicom-image-loader` | 前端 DICOM 渲染 | Phase 1 | ✅ 已有 |
| `@cornerstonejs/tools` | 前端医学工具 | Phase 1 | ✅ 已有 |
| `@cornerstonejs/adapters` | 标注 ↔ SR 转换 | Phase 1 | 🆕 新增 |
| `dicom-parser` | 底层 DICOM 解析 | Phase 1 | ✅ 已有 |
| `image-js` | 图像处理（边缘检测/滤波） | Phase 2 | 🆕 新增 |
| `colormap` | 科学可视化色彩映射 | Phase 2 | 🆕 新增 |
| `sharp` | 后端图像 I/O | 全阶段 | ✅ 已有 |

## 验收标准

### L1 验收
- [ ] 能导入并正确渲染 DICOM 图像（含 PixelSpacing）
- [ ] 测量值显示真实单位（mm）
- [ ] 窗宽窗位从 DICOM 元数据读取
- [ ] 多帧 DICOM 支持 Cine 播放
- [ ] 标注可导出为 DICOM SR

### L2 验收
- [ ] OCT B-scan 浏览、帧导航、测量
- [ ] OCT 视网膜厚度图生成
- [ ] 眼底彩照杯盘比/动静脉比测量
- [ ] FFA 时序浏览、分期标注
- [ ] 视野检查灰度图/偏差图渲染
- [ ] 角膜地形图/厚度图渲染
- [ ] 眼科专用报告模板可用

### L3 验收
- [ ] 能接收 DICOM 设备的 C-STORE 请求
- [ ] DICOM Worklist 查询可用
- [ ] 拖拽/批量上传 DICOM 文件
- [ ] 随访对比（纵向分析）
- [ ] 完整审计日志（操作可追溯）
