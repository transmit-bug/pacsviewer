# 随访对比功能规格(wayfinder 地图产物)

> 来源: wayfinder 地图 #85(transmit-bug/pacsviewer),7 张决策票全部闭合。目的: 交付给实现的规格。
> 术语: 见 `CONTEXT.md`(FollowUpRecord / Comparison / MeasurementPoint / MeasurementDefinition / Study=采集会话)。

## 目的地

医生在患者档案中选定基线与随访检查,获得并排/叠加/滑块对比视图(含同步操作)与测量值随时间变化的纵向趋势图(分面网格 + 参考区间带)。

## 已定决策

### 1. 测量数据链路(#92,调研 #86) — 前置
- **保存**: `ANNOTATION_COMPLETED` → 立即保存;`ANNOTATION_MODIFIED` → 去抖 1–2s;upsert 走现有 `POST /annotations/sync`
- **恢复**: 视口加载 → `GET /annotations/image/:id` → `annotationState.restore()`
- **geometry 契约**: 原样存储 Cornerstone `{toolName, handles, cachedStats}`(往返保真);服务端按 toolName 类型化提取(`Length→length+unit` / `Angle→angle` / `ROI→area+areaUnit`),连同 `measurement_key` 写 `measurement_points`
- **单位**: 落库真实单位(mm/°/mm²/px);px 系列标记"未校准"、趋势降级展示;校准(#51)留在原路线图,不进本图
- 现状调研(阻断级差距清单): `research/followup-measurements.md`

### 2. 趋势数据模型(#87)
- **测量快照表** `measurement_points(study_id, measurement_key, type, value, unit, captured_at)`,独立于 annotations
- **捕获时机**: 标注保存时 upsert(by study + measurement_key);修正旧标注 = 更新该点
- **身份键**: 受控字典 `measurement_definitions(key, display_name, type, unit, trend_direction, reference_range)`,测量时从字典选;`trend_direction` 固化方向语义(厚度减小=恶化),不再靠 label 关键词

### 3. 匹配与选择(#89)
- 候选 = 同患者 + 同模态 + 按 studyDate 排序;系统预填基线=最早、对比=最近,医生可改;device 次级展示不参与匹配;status 不参与
- 同日多次扫描全部列出,studyTime 参与排序(术前/术后场景不去重)
- **趋势 = 全量聚合**: 该患者全部 MeasurementPoints 按 (字典 key, studyDate);新检查保存测量后自动进趋势;followUpRecords 只管"对比视图用哪对 + 该对 delta"

### 4. 趋势图(#90) — 原型 `prototype/trend-chart` 分支
- **主视图: 分面网格** — 每项测量独立小图: 真实单位、基线虚线、趋势徽标(好转/稳定/恶化)、百分比变化
- **报告嵌入: KPI 卡** — 当前值 + vs 基线变化 + 迷你趋势
- **参考区间带**: 每分面按测量类型画正常参考区间阴影带(来自 `measurement_definitions.reference_range`,如 RNFL ≥ 80μm、眼压 10–21mmHg)
- **图表库**: recharts(成熟方案,ReferenceArea 原生支持区间带);体积敏感时评估 uPlot

### 5. 对比视图(#88) — 原型 `prototype/comparison` 分支
- **三模式**: 并排为主视图;叠加(透明度 + 混合模式)/ 滑块(分割线)为辅助
- **同步粒度**: 缩放 + 平移 + 窗宽窗位默认全同步(同模态对比才有意义),同步开关保留;叠加模式恒同步
- **混合模式**: 正常/差值/变亮/变暗(差值作默认)
- **对比中测量**: 允许;画线按面板归属 Study —— 基线面板→基线 Study,对比面板→对比 Study

### 6. 入口与工作台(#91)
- **入口**: 患者详情页 — 检查记录 tab 每行"随访对比"快捷按钮;时间轴 tab 承载随访视图
- **创建流程(一步)**: 点按钮 → 候选选择器(按 #89 规则预填)→ 确认直接进对比视图
- **工作台**: `/compare` 演化为随访工作台 — 顶部患者+检查选择器;主体对比视图;侧栏测量对照 delta 表 + 趋势图;"保存随访记录"动作在工作台
- **时间轴 tab**: 随访记录列表 + 趋势总览,点记录跳工作台

## 范围边界

**In scope**: 通用标注测量值的纵向趋势 + 对比工作台(上述 6 项)

**Out of scope**(地图明确排除):
- 快照/收藏/对比方案复用(PRD M6 C 项)
- OCT 厚度链路(#55/#56, L2 外部依赖)
- 测量校准(#51, 原路线图)
- AI 分割/病灶识别(远期愿景)
- C-STORE SCP(L3, ADR-005)

## 实施建议顺序

1. **#92 契约落地** — 保存/恢复链路 + cachedStats 类型化提取(前置,其余全部依赖它)
2. **measurement_points + measurement_definitions** — 建表 + 字典 seed(常见眼科测量项 + 参考区间)
3. **趋势图** — 分面网格 + 参考区间带(recharts)
4. **对比工作台** — 三模式 + 同步 + 对比中测量(按面板归属)
5. **入口接线** — 患者详情按钮/时间轴 + 一步选择器 + 保存随访记录
