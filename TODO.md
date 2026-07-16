# PACS Viewer — Implementation TODO

**Generated:** 2025-01-27  
**Based on:** PRD Phase 3 (#16), Issues #1-#15, Conflict Analysis

---

## Implementation Order

```
Step 1: #12 DICOM 标准对齐前端收尾        ← Schema 已完成，前端收尾
Step 2: #13 标注系统 Study 级别支持       ← Schema 已完成，API+前端
Step 3: #14 报告版本快照 + 审核工作流     ← Schema 已完成，逻辑+前端
Step 4: #15 设备接入框架 API + 前端       ← Schema 已完成，API+前端
Step 5: #4  Cornerstone.js 集成           ← Phase 1 核心
Step 6: #3  性能优化                      ← Phase 2 依赖 #4
Step 7: #6  DICOM 标准网关                ← Phase 3 依赖 #15
Step 8: #1  系统管理（最小版）            ← Phase 4 依赖 #6 配置
Step 9: #2  测试体系                      ← Phase 6 最后
Skip:  #5  桌面打包                      ← 推迟 v2
```

---

## Step 1: #12 DICOM 标准对齐前端收尾

**Status:** 🔲 Not Started  
**Schema:** ✅ `studies.studyType` 已删除  
**Blocked by:** None

### Changes Required

| File | Change |
|------|--------|
| `apps/server/src/routes/studies.ts` | 添加 `series: true` 到 `with` 关联查询 |
| `apps/web/src/stores/studyStore.ts` | 移除 `studyType` 字段，添加 `series` 数组 |
| `apps/web/src/pages/PatientDetailPage.tsx` | 用 series modalities 替换 `studyType` 显示 |
| `apps/web/src/pages/ViewerPage.tsx` | 用 series modalities 替换 `studyType` 显示 |
| `apps/web/src/pages/ComparisonPage.tsx` | 用 series modalities 替换 `studyType` 显示 |
| `apps/web/src/pages/ReportPage.tsx` | 检查模板筛选逻辑是否依赖 studyType |

### Acceptance Criteria

- [ ] `studies` 表不含 `studyType` 字段
- [ ] 前端通过 Series 聚合显示 Study 模态类型（如 "OCT, Fundus"）
- [ ] 患者检查列表正确显示检查类型
- [ ] 报告模板筛选基于 Series modality 而非 studyType
- [ ] 无 TypeScript 编译错误

---

## Step 2: #13 标注系统 Study 级别支持

**Status:** 🔲 Not Started  
**Schema:** ✅ `annotations.study_id` 已添加  
**Blocked by:** Step 1 (#12)

### Changes Required

| File | Change |
|------|--------|
| `apps/server/src/routes/annotations.ts` | 支持按 studyId 查询/创建标注 |
| `apps/server/src/db/schema.ts` | 添加 CHECK 约束确保 image_id/study_id 至少一个非空 |
| `apps/web/src/pages/ViewerPage.tsx` | Study 视图中显示/创建 Study 级标注 |
| `apps/web/src/components/viewer/` | 标注面板区分 Image 级和 Study 级 |

### Acceptance Criteria

- [ ] API 支持 `GET /api/annotations?studyId=xxx` 查询
- [ ] API 支持创建 Study 级标注（`studyId` 非空，`imageId` 为空）
- [ ] 前端 Study 视图可创建 Study 级标注
- [ ] 标注列表区分显示两种级别标注
- [ ] 数据库约束确保至少一个外键非空

---

## Step 3: #14 报告版本快照 + 审核工作流

**Status:** 🔲 Not Started  
**Schema:** ✅ `report_versions` 表已建  
**Blocked by:** None（可与 Step 1/2 并行）

### Changes Required

| File | Change |
|------|--------|
| `apps/server/src/routes/reports.ts` | 状态变更时自动创建版本快照 |
| `apps/server/src/routes/reports.ts` | 添加版本历史 API + 版本对比 API |
| `apps/web/src/components/VersionHistoryDialog.tsx` | 实现完整版本历史时间线 + 对比 |
| `apps/web/src/pages/ReportPage.tsx` | 集成版本历史组件 |

### Acceptance Criteria

- [ ] draft → pending_review 变更自动创建版本快照
- [ ] reviewed → published 变更自动创建版本快照
- [ ] API `GET /api/reports/:id/versions` 返回版本列表
- [ ] API `GET /api/reports/:id/versions/:versionId` 返回版本内容
- [ ] 前端版本历史时间线可视化
- [ ] 版本对比显示变更内容

---

## Step 4: #15 设备接入框架 API + 前端

**Status:** 🔲 Not Started  
**Schema:** ✅ `devices` + `inbound_transfers` 表已建  
**Blocked by:** None（可与 Step 1/2/3 并行）

### Changes Required

| File | Change |
|------|--------|
| `apps/server/src/routes/devices.ts` | 新建，设备 CRUD API |
| `apps/server/src/routes/transfers.ts` | 新建，传输记录查询 + 状态更新 + 重试 |
| `apps/server/src/index.ts` | 注册新路由 |
| `apps/web/src/pages/DevicesPage.tsx` | 新建，设备管理页面 |
| `apps/web/src/services/api.ts` | 添加 deviceApi、transferApi |
| `apps/web/src/App.tsx` | 添加设备页面路由 |

### Acceptance Criteria

- [ ] 设备 CRUD API 正常工作
- [ ] 传输记录查询 API 支持分页和状态筛选
- [ ] 传输重试机制可用
- [ ] 前端设备列表页面展示设备状态
- [ ] 前端传输监控页面显示进度和错误

---

## Step 5: #4 Cornerstone.js 集成

**Status:** 🔲 Not Started  
**Blocked by:** Step 1 (#12 前端清理完成)

### Scope（按 PRD 限定）

**Included:**
- Zoom、Pan、WindowLevel、Length、Angle、Probe 6 个工具
- DICOM 图像渲染（通过 dicom-image-loader）
- 普通图像渲染（通过 custom image loader）
- Zustand 管应用状态，Cornerstone 管渲染状态
- i18n 工具提示

**Excluded:**
- 面积测量、箭头标注、文字标注、ROI、3D MPR

### Changes Required

| File | Change |
|------|--------|
| `apps/web/package.json` | 添加 @cornerstonejs/core, tools, dicom-image-loader |
| `apps/web/src/lib/cornerstone/` | 新建，初始化配置、image loader |
| `apps/web/src/components/viewer/CornerstoneViewport.tsx` | 新建，替代手写 Canvas |
| `apps/web/src/components/viewer/ImageViewer.tsx` | 重构，使用 CornerstoneViewport |
| `apps/web/src/components/viewer/Toolbar.tsx` | 重构，绑定 Cornerstone 工具 |
| `apps/web/src/stores/viewerStore.ts` | 适配 Cornerstone 状态 |
| `apps/server/src/routes/images.ts` | 确保 HTTP image loader 路径正确 |

### Acceptance Criteria

- [ ] Cornerstone.js v2.x 完全替换手写 Canvas
- [ ] 6 个工具全部可用（Zoom/Pan/WL/Length/Angle/Probe）
- [ ] DICOM 图像正确渲染
- [ ] 普通图像（PNG/JPG）正确渲染
- [ ] 工具提示支持中英文
- [ ] 所有现有查看功能正常

---

## Step 6: #3 性能优化

**Status:** 🔲 Not Started  
**Blocked by:** Step 5 (#4 Cornerstone)

### Changes Required

| File | Change |
|------|--------|
| `apps/server/src/routes/images.ts` | 图像金字塔端点 + Cache-Control 头 |
| `apps/server/src/services/pyramid.ts` | 新建，Sharp 预生成 4 级分辨率 |
| `apps/web/src/workers/decodeWorker.ts` | 新建，Web Worker 解码 |
| `apps/web/src/lib/cache/indexedDbCache.ts` | 新建，IndexedDB 缓存层 |
| `apps/web/src/lib/cornerstone/imageLoader.ts` | 扩展，集成 Worker + Cache |

### Acceptance Criteria

- [ ] 图像金字塔：256/512/1024/full 4 级
- [ ] Web Worker 解码不阻塞主线程
- [ ] Transferable Objects 传递 ArrayBuffer
- [ ] HTTP Cache-Control 头正确设置
- [ ] IndexedDB 缓存已解码图像
- [ ] OCT 100+ 张加载 < 3s
- [ ] 缩放/平移 60fps
- [ ] 内存 < 500MB

---

## Step 7: #6 DICOM 标准网关

**Status:** 🔲 Not Started  
**Blocked by:** Step 4 (#15 设备框架) + Step 8 (#1 system_settings)

### Changes Required

| File | Change |
|------|--------|
| `apps/server/src/adapters/dicomAdapter.ts` | 新建，DICOM DeviceAdapter 实现 |
| `apps/server/src/dicom/` | 新建，PS3.8 协议层（PDU 编解码） |
| `apps/server/src/dicom/cstore.ts` | C-STORE SCP 接收 |
| `apps/server/src/dicom/cfind.ts` | C-FIND SCU 查询 |
| `apps/server/src/dicom/cmove.ts` | C-MOVE SCU 拉取 |
| `apps/server/src/services/transferWorker.ts` | 异步处理队列 |

### Acceptance Criteria

- [ ] C-STORE SCP 可接收未压缩 DICOM 图像
- [ ] C-FIND SCU 可查询患者/检查
- [ ] C-MOVE SCU 可拉取图像
- [ ] 接收的图像异步写入 inbound_transfers
- [ ] AE Title + 端口可配置

---

## Step 8: #1 系统管理（最小版）

**Status:** 🔲 Not Started  
**Blocked by:** None（可与 Step 2-4 并行）

### Changes Required

| File | Change |
|------|--------|
| `apps/server/src/db/schema.ts` | 添加 `system_settings` 表 |
| `apps/server/src/routes/settings.ts` | 系统设置 CRUD API |
| `apps/web/src/pages/SettingsPage.tsx` | 重构，分 section 展示设置 |
| `apps/web/src/pages/SettingsPage.tsx` | 添加日志查询 + 筛选 + 导出 |
| `apps/web/src/services/api.ts` | 添加 settingsApi |

### Acceptance Criteria

- [ ] `system_settings` 表：category + key + value(JSON)
- [ ] DICOM 网关参数可配置（AE Title、端口）
- [ ] 存储路径和配额可配置
- [ ] 日志查询支持时间/类型/用户筛选
- [ ] 日志可导出为文件
- [ ] 审计日志统一存 SQLite `audit_logs` 表

---

## Step 9: #2 测试体系

**Status:** 🔲 Not Started  
**Blocked by:** Step 5-8

### Changes Required

| File | Change |
|------|--------|
| `apps/server/tests/` | 新建，API 测试文件 |
| `apps/server/tests/helpers/` | 新建，内存 SQLite 测试工具 |
| `apps/web/tests/e2e/` | 新建，Playwright E2E 测试 |
| `playwright.config.ts` | 新建，E2E 配置 |

### Test Coverage

**后端 API (bun:test + 内存 SQLite):**
- [ ] 认证 API
- [ ] 患者 API
- [ ] 检查 API
- [ ] 图像 API
- [ ] 报告 API
- [ ] 对比 API
- [ ] 设备适配器 API

**E2E (Playwright):**
- [ ] 完整诊断流程

---

## Dependency Graph

```
#12 (前端收尾) ──────────────────────────────┐
#13 (标注升级)  ───── 依赖 #12 ─────┐         │
#14 (版本快照)  ───── 独立 ─────────┤         │
#15 (设备框架)  ───── 独立 ─────────┤         │
                                    ▼         │
#4 (Cornerstone) ─── 依赖 #12 ───────────────┘
     │
     ├──→ #3 (性能优化) ── 依赖 #4
     │
     └──→ #2 (测试 E2E) ── 依赖 #4
          
#6 (DICOM 网关) ─── 依赖 #15 + #1
#1 (系统管理) ───── 独立（创建 system_settings）
#2 (测试) ──────── 最后
#5 (桌面打包) ──── v2
```

## Parallel Opportunities

```
Batch A (同时): #12 + #13 + #14 + #15
Batch B (A 后): #4 + #1 (同时)
Batch C (B 后): #3 + #6 (同时)
Batch D (C 后): #2
```
