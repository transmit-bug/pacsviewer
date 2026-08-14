# Handoff — PACS Viewer 演示级打磨(wayfinder 地图推进)

> 交接时间:2026-08 · 仓库:`/Users/pony/codehub/bun/pacsviewer`(transmit-bug/pacsviewer)
> 上一会话完成了:**两张 wayfinder 地图的全部决策票(grilling/research)已闭合,决策层清零**。剩余工作全是实施型任务(AFK),按用户指示"不急着实现"。

## 1. 当前状态(事实)

- **分支**: 当前 checkout 在 `research/cinematic-viewer-design`(干净)。master 已被并发会话推进,含 #110 相关修复(commit `c524e6c` dicomweb 双挂载+dev fallback、`ef58995` 401 刷新竞态+时间戳、`4b717bb` CRUD JSON 解析)。
- **并发会话**: 仓库内有其他 pi 会话活跃(往 master 提交修复)。操作前先 `git fetch` + 核对,勿覆盖。
- **调研文档(只读产物,勿改)**: `research/export-path.md`(#128, 分支 `research/export-path`, commit `b6a0ddd`)、`research/cinematic-viewer-design.md`(#120, 分支 `research/cinematic-viewer-design`, commit `2a7ccfd`)。

## 2. 地图与票据(全部决策已定)

| 地图 | 状态 | 说明 |
|---|---|---|
| [#119 演示级产品打磨](https://github.com/transmit-bug/pacsviewer/issues/119) | OPEN | 15 张子票;3 张 research/grilling 已闭(#120/#121/#122/#128/#129),剩实施票 |
| [#104 图像编辑套件](https://github.com/transmit-bug/pacsviewer/issues/104) | OPEN | 13 张子票;决策票(#108/#109 及 research #105-107)全闭,剩任务票 |
| [#85 随访对比](https://github.com/transmit-bug/pacsviewer/issues/85) | CLOSED 7/7 | 已实现;雾区已敲定为"通用折线+5% 阈值" |

**决策记录位置**: 地图 #119 Notes 的「演示口径(已敲定)」块 + 各实施票的注释(#111/#112/#125/#126/#127/#131/#133/#134);#104 地图 Decisions so far。**不再重复抄录,直接读地图。**

关键决策速查: 品牌=明瞳(英文副标 PACS Viewer) · 深色 teal+钛灰,三级近黑分层(#0F1115→#171A20→#1F232B) · 系统字体栈 · framer-motion 已特批(边界=路由过渡+入场+数字) · 查看器=视口中心+可折叠面板+⌘K+全屏+交叉淡入 · 撤销=annotationState 快照 50 步 · 图层=A+B+C 模型+确认级联删除 · 滤镜 9 种全接(亮度/对比度走 CS 原生 WindowLevel) · CinePlayer=完整播放器契约(8fps 可调/进度/循环/步进/rAF) · 上传=双入口批量 · i18n=中主英辅核心路径 · 感知=品牌加载页+高频骨架屏+渐进 · 导出=报告 print CSS+测量 BOM CSV+当前视图 PNG。

## 3. 解锁/阻塞图

- ✅ 已解锁可实施: #112(编辑套件接线, #104)、#124(设计令牌)、#130(报告/测量导出)、#131(上传)、#132(撤销重做)、#133(i18n)、#134(感知性能)
- 🟢 前沿无阻塞: #131/#133/#134(一直可跑)
- ⛔ #123(查看器原型)被 #110(查看器加载与认证链路修复)阻塞 —— #110 5 项中 1/2 已由并发会话修复,**3/4/5 仍开**(toWadoRsImageId 死代码用 wadouri scheme 指 WADO-RS 且无调用方、CornerstoneViewport 缺"错误详情+重试按钮"统一错误面、DEV_FALLBACK 前端未打标)
- ⛔ 实施链: #125←#124、#126←#123、#127←#111+#125、#113-#117(验证)←#110/#111/#112
- #118(needs-triage): audit_logs.user_id 'anonymous' 违反 FK —— 顺带修,低优先

## 4. 下一步建议(按序)

1. **#110 收尾**(3/4/5 项)→ 解锁 #123 原型;或先做 **#124 设计令牌**(唯一无前置的解锁票,`apps/web/src/index.css` 令牌重写 + tailwind.config + 高频 15 组件,遵循 #121 决议)
2. #124 → #125(登录页+仪表盘,品牌明瞳)→ #127(演示模式);#111(演示数据:主角+配角家族规格已定)可与 #126 并行
3. #131/#133/#134 为 AFK 可随时跑;实施时遵守用户约束:**基于现有 shadcn/ui 组件,优先 Tailwind className 扩展,不新增组件库、不大范围重写**;framer-motion 是唯一特批新依赖
4. 验证票 #113-#117 依赖 #110/#111/#112 落地后开跑,最终 #117 汇总报告

## 5. 环境注意

- 领域术语见 `CONTEXT.md`;AGENTS.md 有开发命令(dev:server / dev:web / db:push / db:seed)
- 演示账号在 seed 中(见 AGENTS.md "Default Accounts"),勿写入文档
- 验证/类型检查:`bun run typecheck`、`bun run test`(各包)
- 工作区曾有过未提交 WIP,现已被并发会话提交;动手前 `git status` 确认干净

## 6. Suggested skills

- **wayfinder** — 推进/新建地图,认领-决议-闭合-更新 Decisions so far 的流程
- **grilling + domain-modeling** — 任何新的 HITL 决策票(按 grilling 分轮问、每轮带推荐答案)
- **code-review** — 实施完成后评审(标准 + 规格两轴)
- **tdd / diagnosing-bugs** — 实施 #110/#131 等涉及加载链、上传链时测试优先
- **create-readme** — 若实施完成到演示版,更新 README 品牌与演示说明
- **research** — 遇到需一级来源的事实问题(如 dicomFrames 与 Cine 的关系)
