# Handoff — PACS Viewer 演示级打磨(wayfinder #119/#104 全闭环)

> 交接时间:2026-08 · 仓库:`/Users/pony/codehub/bun/pacsviewer`(transmit-bug/pacsviewer)
> 本会话完成了:**两张 wayfinder 地图的全部 24 张票闭合(决策→实施→验证),产品达到"演示级"状态,可现场走全流程演示**。

## 1. 当前状态(事实)

- **master = `af9c7a7`**(干净,仅 master 分支;本地无多余 worktree)
- **服务端测试 103 全过**,每票 typecheck/build 验证;验证期总报告:78 项、74 通过 + 4 复查通过
- **已关闭全部 24 张票**:地图 #119(演示级打磨,15 张:#108/#109/#120/#121/#122/#123/#124/#125/#126/#127/#128/#129/#130/#131/#133/#134 + #111 + #132)→ **CLOSED**;地图 #104(编辑套件)→ **CLOSED**;验证票 #113-#117 → **CLOSED**
- **演示现场已跑通**:后端 `:3000`、前端 `:5173` 在 master 上运行(DEV_FALLBACK 资产在 `apps/server/data/images/`,gitignored,勿删)

## 2. 产物清单(实现均已合入 master,勿重复实现)

| 产物 | 位置 | 票 |
|---|---|---|
| 设计令牌(近黑三层/teal 173°/玻璃面/锐圆角) | `apps/web/src/index.css` + `tailwind.config` | #124 |
| 品牌加载页/路由过渡/骨架屏/数字动效 | `components/brand/*`、`components/transition/*`、`components/ui/animated-number.tsx` | #134 |
| 明瞳登录页 + 仪表盘(HUD 卡/环形图/14 天趋势/sparkline) | `pages/LoginPage.tsx`、`pages/DashboardPage.tsx` | #125 |
| **查看器电影级工作台**(视口中心/双侧玻璃栏/HUD/浮动底条/⌘K 预览/24 帧 Cine/全屏) | `components/viewer/workspace/*`(`CinematicWorkspace.tsx` 为编排层) | #126 |
| 查看器错误面+重试/DEV_FALLBACK 打标/多帧鉴权修复 | `components/viewer/CornerstoneViewport.tsx`、`server/routes/images.ts` | #110 |
| 编辑套件接线(图层 A+B+C/9 滤镜/测量展示/⌘E) | `components/editor/*`(`LayerManager`/`ImageFilters`/`FilterLayer`/`AiResultOverlay`/`EditorPanel`) | #112 |
| 撤销/重做(动作级快照 50 步/CS 同步/⌘Z·⌘⇧Z·工具图标) | `stores/historyStore.ts`、`lib/cornerstone/history-apply.ts` | #132 |
| 演示模式(一键登录/全局标识/7 步走查引导) | `server/routes/auth.ts` demo-login、`components/tour/*` | #127 |
| 演示数据集(主角周建国 5 访/配角家族/DEV_FALLBACK 幂等) | `server/db/seed.ts` §7.5 | #111 |
| 上传接线(双入口批量/StudyUploadDialog/后端链路) | `components/upload/*`、`server/routes/images.ts` | #131 |
| i18n 补全(zh/en 657/657 键对齐/语言切换修复) | `apps/web/src/i18n/locales/*` | #133 |
| 报告 PDF 导出(print CSS)+ 测量 BOM CSV | `server/routes/measurements.ts`、报告页 | #130 |
| 查看器深色工作台原型(保留,`/prototype/viewer` 路由仍可访问) | `prototypes/viewer/*` | #123 |

**调研文档(只读)**:`research/cinematic-viewer-design.md`(#120)、`research/export-path.md`(#128)、`research/image-filter-paths.md`(#107)。
**验证总报告**:`docs/verification-2026-08.md`(#117)——含 78 项明细、4 项复查说明、6 项已知缺口、5-8 分钟演示脚本骨架。**新会话先读它**。

## 3. 演示运行指南(5-8 分钟主线)

```bash
cd apps/server && bun run dev   # :3000(必要时先 bun run db:seed 重置演示数据)
cd apps/web && bun run dev      # :5173
```

1. 登录页点「进入演示模式」→ 7 步走查引导(可关,localStorage 记住)
2. 仪表盘:14 天检查量趋势/模态占比环形图/今日 sparkline
3. 患者页搜索周建国(MRN20260001)→ 5 访趋势(RNFL 92→58μm,5×5 真值)
4. 查看器(2025-03-05 随访):HUD 真实临床信息 → W/L 高对比预设(真实改像素)→ 24 帧 Cine(播放/跳帧/循环/单步,mm 位置)→ 画长度标注(测量列表实时)→ 图层(建/显隐/级联删)→ 9 滤镜(brightness 走 VOI + 高斯走 Canvas2D,重置)→ ⌘Z/⌘⇧Z 撤销重做 → ⌘K → F 全屏 → CSV 导出
5. 报告:3 版本切换 + PDF 导出(打印 CSS)
6. 随访对比工作台(三模式)+ 测量 CSV 导出(25 行 BOM+RFC4180)
7. 上传:双入口(患者详情/检查页)批量拖拽,上传后进查看器

演示账号见 AGENTS.md "Default Accounts"(**勿写入本文档**)。

## 4. 已知缺口(验证报告 §3 详述,诚实清单)

1. OctViewer(厚度图专用页)已令牌化但**未路由**(无入口)
2. 比例尺为显示相对(固定 5mm 视觉),非像素校准
3. 演示多帧为单帧文件+元数据,Cine 像素不变(DEV_FALLBACK 徽标说明;真多帧 DICOM 走 `#frame=N`)
4. ⌘K 被全局搜索占用 → 编辑套件用 ⌘E(#112 已注明)
5. admin 深度 CRUD 未覆盖验证
6. annotation-persistence E2E 测试假设过期(instanceNumber:-5 被新路由拒绝)

## 5. 遗留事项(按优先级)

1. **远端清理**:origin 上仍有 17 个已合并的特性分支(`feat/*`、`research/*`、`prototype/*`、`fix/*`)——已确认全部合入 master,可 `git push origin --delete` 批量清理(需用户确认)
2. 缺口 1(OctViewer 路由)与缺口 2(校准比例尺)可作后续小票
3. #118(needs-triage FK):audit_logs.user_id 'anonymous' 违反 FK —— 未处理,低优先
4. 交接文档本身:每轮会话结束后更新 §1/§3(commit 号、演示路径)
5. 真 DICOM 上传后的多帧 Cine 未用真数据复验(演示数据占位)

## 6. 环境注意

- 领域术语见 `CONTEXT.md`;命令见 AGENTS.md(dev:server/dev:web/db:push/db:seed/typecheck/test)
- DEV_FALLBACK 资产 gitignored(`apps/server/data/images/_fundus_*.png` + 服务端按需生成),**勿提交**;fresh worktree 缺 codec wasm 运行时资产时本地补(勿提交)
- `GET /api/studies` 不存在;仪表盘聚合数据源=`GET /api/dashboard/recent-studies?limit=300`;多帧=`/api/dicomweb/images/{id}/frames` + `#frame=N`
- 已知坑:merge 前先 checkout master;`gh issue close` 不加 `-q`;bun 而非 node;`bun install` 在根目录
- 并行纪律:subagent 用 worktree 隔离(分支预建 + 各自 bun install),最多 4 并发;票间文件隔离

## 7. Suggested skills

- **wayfinder** — 新地图的认领-决议-闭合-更新 Decisions so far 流程(本项目两地图已闭,新需求可开新地图)
- **grilling + domain-modeling** — 任何新的 HITL 决策票(分轮问、每轮带推荐答案、决议落库)
- **code-review** — 新实施完成后评审(标准 + 规格两轴)
- **create-readme** — 演示版已达成,可把 README 升级为品牌+演示指引(尚未做)
- **diagnosing-bugs** — 若真 DICOM 多帧 Cine/上传链路出问题
- **handoff** — 每轮收尾更新本文档(§1 事实 + §3 演示路径)
