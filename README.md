<div align="center">

# PACS Viewer

**开源眼科影像管理系统**

基于 Web 的 PACS（Picture Archiving and Communication System），专注于眼科影像的存储、查看、标注和报告生成。

[![Bun](https://img.shields.io/badge/Bun-%23000000?style=flat-square&logo=bun)](https://bun.sh)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Hono](https://img.shields.io/badge/Hono-4-FF6B35?style=flat-square)](https://hono.dev)
[![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=flat-square)](https://orm.drizzle.team)

</div>

---

## 特性

- **DICOM 与常见格式** — 支持 DICOM、JPEG、PNG、TIFF、BMP 等格式的渲染与管理
- **多模态眼科影像** — OCT、眼底彩照、FFA、ICGA、视野检查等多种模态
- **专业影像查看器** — 基于 Cornerstone.js，支持缩放、平移、窗宽窗位调节、长度/角度测量、像素探针
- **标注系统** — 图像级与检查级双层标注，支持多种标注类型
- **报告工作流** — 从草稿到发布的完整审核流程，支持版本快照与模板管理
- **设备接入框架** — 可扩展的设备适配器架构，支持 DICOM 网关（C-STORE / C-FIND / C-MOVE）
- **对比查看** — 同一患者跨时间点的图像对比，支持并排、叠加、滑块等模式
- **国际化** — 内置中文和英文支持

## 技术架构

| 层 | 技术 |
|---|---|
| **前端** | React 18 · Vite · Tailwind CSS · shadcn/ui · Zustand |
| **后端** | Bun · Hono · Drizzle ORM |
| **数据库** | SQLite（开发/单机）· PostgreSQL（生产） |
| **图像引擎** | Cornerstone.js · Sharp · TensorFlow.js |
| **认证** | better-auth |

### Monorepo 结构

```
pacsviewer/
├── apps/
│   ├── web/               @pacsviewer/web       前端 SPA
│   └── server/            @pacsviewer/server     后端 API
├── packages/
│   ├── shared/            @pacsviewer/shared     共享类型与工具
│   ├── dicom/             @pacsviewer/dicom      DICOM 解析
│   └── image-processing/  @pacsviewer/image-processing  图像处理
├── docker/                Docker 部署配置
└── docs/                  架构决策记录、PRD
```

## 快速开始

### 前置要求

- [Bun](https://bun.sh) >= 1.0

### 安装

```bash
git clone https://github.com/<your-org>/pacsviewer.git
cd pacsviewer
bun install
```

### 初始化数据库

```bash
bun run db:push    # 创建表结构
bun run db:seed    # 插入测试数据
```

### 启动开发服务器

```bash
bun run dev        # 同时启动前端和后端
```

或分别启动：

```bash
bun run dev:server # 后端 @ http://localhost:3000
bun run dev:web    # 前端 @ http://localhost:5173
```

> [!NOTE]
> 开发环境默认账号：管理员 `admin / admin123`，医生 `doctor / doctor123`

## 开发命令

| 命令 | 说明 |
|------|------|
| `bun run dev` | 启动全部开发服务 |
| `bun run build` | 构建全部 |
| `bun run test` | 运行测试 |
| `bun run typecheck` | TypeScript 类型检查 |
| `bun run lint` | 代码检查 |
| `bun run db:generate` | 生成数据库迁移 |
| `bun run db:push` | 推送 schema 到数据库 |
| `bun run db:seed` | 重新播种测试数据 |

## Docker 部署

```bash
docker-compose up -d
```

| 服务 | 端口 |
|------|------|
| 前端 | `80` |
| 后端 API | `3000` |

数据持久化挂载在 `./data` 目录。

## 环境变量

复制 `.env.example` 到 `.env`：

```env
PORT=3000
DATABASE_URL=./data/pacsviewer.db
NODE_ENV=development
```

## 文档

- [领域模型](docs/domain-alignment-summary.md) — 核心实体与术语定义
- [架构决策](docs/adr/) — ADR 记录
- [产品需求](docs/prd/) — PRD 文档
