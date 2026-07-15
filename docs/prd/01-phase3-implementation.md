# PRD: PACS Viewer Phase 3 — 核心引擎与基础设施

**状态：** Ready for Agent  
**创建日期：** 2025-01-27  
**版本：** v1.0  
**关联 Issues：** #1, #2, #3, #4, #6

---

## Problem Statement

PACS Viewer 的基础功能（用户管理、患者管理、图像管理、报告系统、图像对比）已实现，但核心渲染引擎仍是手写 Canvas，缺乏 DICOM 标准网关、性能优化和系统管理能力。系统无法：

- 使用专业医学影像渲染引擎（Cornerstone.js）处理 DICOM 图像
- 从眼科设备直接接收 DICOM 图像（C-STORE）
- 高效处理 OCT 等大量切片的检查（100+ 张加载慢、卡顿）
- 进行系统级别的配置、日志查询和监控

## Solution

分6个阶段实现核心引擎与基础设施，按依赖关系排序：

1. **Cornerstone.js 集成** — 替换手写 Canvas，使用专业医学影像渲染引擎
2. **性能优化** — 图像金字塔、Web Worker 解码、缓存策略
3. **DICOM 标准网关** — 实现 C-STORE/C-FIND/C-MOVE 协议
4. **系统管理** — 系统设置与日志查询
5. **桌面打包** — 推迟到 v2
6. **测试体系** — 后端 API 测试 + E2E 测试

---

## User Stories

### Cornerstone.js 集成 (#4)

1. As a 医生, I want 使用 Cornerstone.js 查看 DICOM 图像, so that 获得专业级的医学影像渲染质量
2. As a 医生, I want 使用鼠标滚轮缩放图像, so that 查看细节区域
3. As a 医生, I want 拖拽平移图像, so that 浏览大尺寸图像的不同区域
4. As a 医生, I want 调整窗宽窗位, so that 优化不同组织的显示效果
5. As a 医生, I want 翻转和旋转图像, so that 从不同角度观察
6. As a 医生, I want 使用长度测量工具, so that 测量病灶尺寸
7. As a 医生, I want 使用角度测量工具, so that 测量角度参数
8. As a 医生, I want 使用探针工具查看像素值, so that 获取精确的图像数据
9. As a 系统, I want 通过 HTTP API 加载图像, so that 统一图像访问路径
10. As a 系统, I want Zustand 管理应用层状态, so that 保持状态管理一致性
11. As a 系统, I want Cornerstone 管理渲染层状态, so that 渲染引擎自主管理视口
12. As a 用户, I want 工具提示支持中英文切换, so that 使用熟悉的语言

### 性能优化 (#3)

13. As a 医生, I want OCT 扫描（100+ 张）在 3 秒内加载完成, so that 不浪费等待时间
14. As a 医生, I want 缩放平移操作保持 60fps, so that 获得流畅的交互体验
15. As a 医生, I want 内存占用不超过 500MB, so that 浏览器不会崩溃
16. As a 系统, I want 服务端预生成多分辨率金字塔, so that 根据缩放级别加载对应分辨率
17. As a 系统, I want 使用 Web Worker 解码图像, so that 不阻塞主线程 UI
18. As a 系统, I want 使用 Transferable Objects 传递数据, so that 避免 ArrayBuffer 拷贝
19. As a 系统, I want 利用 HTTP 缓存头减少重复请求, so that 降低网络负载
20. As a 系统, I want 使用 IndexedDB 缓存已解码图像, so that 避免重复解码

### DICOM 标准网关 (#6)

21. As a 设备技师, I want 眼科设备通过 DICOM 协议推送图像到系统, so that 自动化图像采集
22. As a 系统, I want 支持 DICOM C-STORE SCP 接收图像, so that 设备可以主动推送
23. As a 系统, I want 支持 DICOM C-FIND SCU 查询患者和检查, so that 设备可以检索数据
24. As a 系统, I want 支持 DICOM C-MOVE SCU 拉取图像, so that 从设备获取历史图像
25. As a 系统, I want 异步处理接收到的图像, so that 不阻塞 DICOM Association
26. As a 系统, I want 复用 inbound_transfers 表跟踪传输状态, so that 统一传输管理
27. As a 管理员, I want 配置 AE Title 和端口, so that 适配不同设备
28. As a 系统, I want 第一版支持未压缩 Transfer Syntax, so that 覆盖基础场景
29. As a 系统, I want 单进程异步 I/O 处理并发 Association, so that 简化部署

### 系统管理 (#1)

30. As a 管理员, I want 配置 DICOM 网关参数（AE Title、端口）, so that 对接设备
31. As a 管理员, I want 配置存储路径和配额, so that 管理磁盘空间
32. As a 管理员, I want 查看系统日志（操作、错误、访问）, so that 排查问题
33. As a 管理员, I want 按时间、类型、用户筛选日志, so that 快速定位问题
34. As a 管理员, I want 导出日志为文件, so that 离线分析
35. As a 系统, I want 所有日志统一存 SQLite, so that 简化备份和查询

### 测试 (#2)

36. As a 开发者, I want 后端 API 有完整的单元测试, so that 重构时不破坏功能
37. As a 开发者, I want 使用内存 SQLite 运行测试, so that 测试速度快且隔离
38. As a 开发者, I want E2E 测试覆盖完整诊断流程, so that 验证端到端功能
39. As a 开发者, I want 使用 Playwright 运行 E2E 测试, so that 获得真实的浏览器测试

---

## Implementation Decisions

### 1. 实施顺序

按依赖关系分6个阶段：

```
Phase 1: #4 Cornerstone.js 集成
Phase 2: #3 性能优化（依赖 #4）
Phase 3: #6 DICOM 标准网关
Phase 4: #1 系统管理
Phase 5: #5 桌面打包（推迟到 v2）
Phase 6: #2 测试
```

### 2. Cornerstone.js 集成决策

- **版本**: `@cornerstonejs/core` v2.x + `@cornerstonejs/tools` v2.x + `@cornerstonejs/dicom-image-loader` v2.x
- **迁移策略**: 一次性替换，删除手写 Canvas 代码，不留双引擎
- **工具范围**: 只集成 Cornerstone 内置工具（Zoom/Pan/WindowLevel/Length/Angle/Probe），高级标注留给 M5
- **DICOM 解析**: 统一用 Cornerstone 的解析器，`packages/dicom` 降级为元数据提取工具
- **状态管理**: Zustand 管应用层状态（当前图像 ID、患者信息），Cornerstone 管渲染层状态（viewport transform、W/L）
- **i18n**: 自定义 React 组件覆盖 Cornerstone 工具 UI，通过 `useTranslation` 管理
- **图像加载**: 统一走 HTTP `GET /api/images/:id/file`，Cornerstone WADO loader 请求此 URL

### 3. 性能优化决策

- **优化优先级**: 渲染 → 加载 → 缓存 → 网络
- **图像金字塔**: 服务端用 Sharp 预生成 4 级分辨率（256/512/1024/full），存为独立文件
- **Web Worker**: 专用 Worker 池处理图像解码，Worker 数量 = `navigator.cpuCount - 1`
- **零拷贝**: 使用 Transferable Objects 传递 ArrayBuffer
- **缓存策略**: HTTP Cache-Control 头 + IndexedDB 缓存已解码 ImageData
- **性能指标**:
  - OCT 扫描（100+ 张）加载时间 < 3s
  - 缩放/平移操作 60fps
  - 内存占用 < 500MB

### 4. DICOM 网关决策

- **实现方式**: 纯 Bun/Node.js 手写 DICOM PS3.8 协议层（TCP socket 层）
- **架构定位**: 作为 DeviceAdapter 实现，继承 BaseAdapter，复用适配器生命周期
- **接收模式**: C-STORE 异步队列，接收后写入 `inbound_transfers` 表，后台 Worker 异步处理
- **Transfer Syntax**: 第一版只支持未压缩格式（Implicit/Explicit VR Little Endian）
- **并发模型**: 单进程异步 I/O，Bun TCP server 每个 Association 一个异步协程
- **配置管理**: AE Title、端口等配置存 `system_settings` 表

### 5. 系统管理决策

- **范围**: 最小可用 — 系统设置 + 日志管理，备份和监控留 v2
- **设置存储**: 复用 SQLite `system_settings` 表，`category` + `key` + `value(JSON)` 结构
- **日志存储**: 统一 `logs` 表，`level` 字段区分类型（info/warn/error/access），`source` 字段区分来源
- **日志功能**: 查询、筛选（时间/类型/用户）、导出

### 6. 桌面打包决策

- **推迟到 v2**，当前专注 Docker + Web 部署
- 医疗系统场景 Web 部署已够用

### 7. 测试决策

- **后端 API 测试**: 使用 `bun:test`，内存 SQLite 隔离，每个测试文件独立 seed
- **E2E 测试**: 使用 Playwright，覆盖完整诊断流程（登录→查看患者→打开图像→标注→生成报告）
- **前端组件测试**: 暂缓
- **Mock 策略**: 内存 SQLite（`db = drizzle(':memory:')`），不 mock ORM 层

---

## Testing Decisions

### 好的测试标准

- 只测试外部行为（API 响应、页面交互），不测试实现细节
- 测试应该能在任何环境下运行（CI/本地），不依赖外部服务
- 每个测试独立，不依赖其他测试的执行顺序

### 测试覆盖范围

**后端 API 测试**（优先级高）:
- 认证 API：登录/登出/刷新/权限校验
- 患者 API：CRUD/搜索/标签
- 检查 API：CRUD/状态流转
- 图像 API：上传/下载/元数据
- 报告 API：CRUD/模板/状态流转/版本历史
- 对比 API：CRUD/收藏/快照
- DICOM 网关 API：适配器 CRUD/状态管理

**E2E 测试**（关键流程）:
- 完整诊断流程：登录 → 查看患者 → 打开图像 → 测量标注 → 生成报告

### 测试技术栈

- 后端: `bun:test` + 内存 SQLite
- E2E: Playwright（Chromium/Firefox/WebKit）

---

## Out of Scope

1. **桌面应用打包** — 推迟到 v2，当前专注 Web + Docker
2. **数据备份与恢复** — 推迟到 v2，当前用 Docker 卷管理
3. **系统监控仪表盘** — 推迟到 v2，当前用外部工具（Prometheus/Grafana）
4. **高级标注工具** — 自由画笔、ROI、图层管理留给 M5
5. **前端组件测试** — 暂缓，优先后端 API 和 E2E
6. **JPEG/JPEG 2000 Transfer Syntax** — 第一版只支持未压缩格式
7. **DICOM TLS 安全** — 第一版不支持
8. **3D 渲染（MPR）** — 不在本 PRD 范围

---

## Further Notes

### 技术风险

1. **Cornerstone.js v2.x 兼容性** — 需要验证与 Bun 构建工具的兼容性
2. **DICOM 协议复杂度** — PS3.8 协议细节多，需要充分测试不同设备
3. **Web Worker 与 Cornerstone 集成** — Cornerstone 的 image loader 需要自定义扩展才能使用 Worker

### 依赖关系图

```
#4 Cornerstone.js ──→ #3 性能优化
                  ──→ #2 测试（E2E 需要渲染引擎）

#6 DICOM 网关 ──→ 独立，可与 #4 并行

#1 系统管理 ──→ 依赖 #6（DICOM 配置）

#5 桌面打包 ──→ v2
```

### 验收标准

- [ ] Cornerstone.js 完全替换手写 Canvas，所有现有查看功能正常
- [ ] OCT 100+ 张加载时间 < 3s
- [ ] 缩放/平移操作 60fps
- [ ] DICOM 设备能通过 C-STORE 推送图像到系统
- [ ] 系统设置页面可配置 DICOM 网关参数
- [ ] 日志查询页面可按时间/类型筛选
- [ ] 后端 API 测试覆盖率 > 80%
- [ ] E2E 测试覆盖完整诊断流程
