# AGENTS.md - PACS Viewer

## Project Overview

PACS Viewer 是一个基于 Web 的眼科影像管理系统，采用 Monorepo 架构。系统专注于眼科图像的存储、查看、标注和报告生成。

**核心特性**:
- DICOM 和常见图像格式支持
- 多模态眼科影像查看（OCT、眼底彩照、FFA、ICGA、视野检查等）
- 图像标注与测量工具
- 报告系统与模板管理
- 设备接入框架

## Tech Stack

| 层 | 技术 |
|---|---|
| **前端** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Zustand |
| **后端** | Bun, Hono, Drizzle ORM |
| **数据库** | SQLite (开发/单机), PostgreSQL (生产) |
| **图像处理** | Cornerstone.js (DICOM 渲染), Sharp (服务端), TensorFlow.js (AI) |
| **认证** | better-auth |

## Monorepo Structure

```
pacsviewer/
├── apps/
│   ├── web/           @pacsviewer/web      - 前端 SPA
│   └── server/        @pacsviewer/server   - 后端 API 服务
├── packages/
│   ├── shared/        @pacsviewer/shared   - 共享类型定义和工具函数
│   ├── dicom/         @pacsviewer/dicom    - DICOM 解析库
│   └── image-processing/  @pacsviewer/image-processing - 图像处理库
└── docker/            - Docker 部署配置
```

**包引用规则**:
- 内部包使用 `workspace:*` 协议引用
- 路径别名: `@/*` 指向各包的 `src/*`
- 导出入口: 每个包的 `package.json` 中定义 `exports` 或 `main`

## Setup Commands

```bash
# 安装所有依赖（根目录执行）
bun install

# 初始化数据库（首次运行必须）
cd apps/server
bun run db:push     # 推送 schema 到数据库
bun run db:seed     # 插入初始数据

# 启动开发服务器
bun run dev:server  # 后端 @ http://localhost:3000
bun run dev:web     # 前端 @ http://localhost:5173

# 一键启动全部
bun run dev
```

## Development Workflow

### 环境变量

复制 `.env.example` 到 `.env`，关键变量:
- `PORT` - 后端端口（默认 3000）
- `DATABASE_URL` - SQLite 文件路径（默认 `./data/pacsviewer.db`）
- `NODE_ENV` - 环境模式

### 数据库操作

```bash
# Schema 变更后重新生成迁移
bun run db:generate

# 应用迁移
bun run db:migrate

# 直接推送 schema（开发用，跳过迁移文件）
bun run db:push

# 重新播种测试数据
bun run db:seed
```

### 构建

```bash
# 构建全部
bun run build

# 单独构建
bun run build:server
bun run build:web
```

## Code Architecture

### 前端架构 (`apps/web`)

```
src/
├── components/     # UI 组件（基于 shadcn/ui）
├── hooks/          # 自定义 React Hooks
├── stores/         # Zustand 状态管理
├── services/       # API 调用封装（Axios）
├── pages/          # 路由页面组件
├── i18n/           # 国际化资源
├── types/          # 前端专属类型
└── utils/          # 工具函数
```

**关键模式**:
- 状态管理: Zustand stores 在 `stores/` 目录
- API 调用: 封装在 `services/`，使用 Axios
- 路由: React Router v6
- 表单: React Hook Form + Zod 验证
- 国际化: i18next + react-i18next

### 后端架构 (`apps/server`)

```
src/
├── routes/         # Hono API 路由
├── db/             # 数据库 schema、seed、连接
│   ├── schema.ts   # Drizzle ORM 表定义
│   ├── index.ts    # 数据库连接
│   └── seed.ts     # 初始数据
├── middleware/      # 中间件（认证、日志等）
├── adapters/       # 设备适配器
├── services/       # 业务逻辑层
├── models/         # 数据模型
└── utils/          # 工具函数
```

**关键模式**:
- 路由: Hono 框架，文件在 `routes/`
- ORM: Drizzle ORM，schema 在 `db/schema.ts`
- 认证: better-auth
- 验证: Zod + drizzle-zod

### 数据库 Schema 模式

所有表使用 Drizzle ORM 定义在 `apps/server/src/db/schema.ts`。

**表结构约定**:
- 主键: `text('id')` - 使用 UUID
- 时间戳: `text('created_at')`, `text('updated_at')` - ISO 字符串
- 枚举: 使用 `text('field', { enum: [...] })` 模式
- JSON 字段: 使用 `text('field', { mode: 'json' })` 
- 布尔值: `integer('field', { mode: 'boolean' })`
- 外键: `.references(() => table.id)`

**核心实体关系**:
```
Patient → Study → Series → Image
  │         │              ↓
  │         │         Annotation (image-level)
  │         │              ↓
  │         ├── Report → ReportVersion
  │         └── Annotation (study-level)
  │
  └── Comparison (cross-study)

Device → DeviceAdapter
         └── InboundTransfer
```

## Testing Instructions

```bash
# 运行全部测试
bun run test

# 运行特定包的测试
cd apps/web && bun test
cd apps/server && bun test

# 类型检查
bun run typecheck

# Lint
bun run lint
```

## Code Style

### TypeScript 约定

- 严格模式 (`"strict": true`)
- ES2022 目标
- ESNext 模块系统
- 启用 `declaration` 和 `sourceMap`

### 文件组织

- 每个包独立 `tsconfig.json`
- 共享类型放在 `@pacsviewer/shared`
- 组件使用 PascalCase 命名
- 工具函数使用 camelCase 命名

### Import 规则

```typescript
// 外部依赖
import { Hono } from 'hono';

// 内部包引用
import { db } from '@pacsviewer/server/db';
import { Patient } from '@pacsviewer/shared/types';

// 路径别名
import { Button } from '@/components/ui/button';
```

## Docker Deployment

```bash
# 使用 Docker Compose 启动
docker-compose up -d

# 或分别构建
docker build -f apps/server/Dockerfile -t pacsviewer-server .
docker build -f apps/web/Dockerfile -t pacsviewer-web .
```

**端口映射**:
- 前端: 80
- 后端 API: 3000

## Default Accounts

开发环境默认账号（seed 生成）:
- 管理员: `admin` / `admin123`
- 医生: `doctor` / `doctor123`

## Key Dependencies

### 前端核心依赖

| 包 | 用途 |
|---|---|
| `@cornerstonejs/core` | DICOM 图像渲染引擎 |
| `@tensorflow/tfjs` | 浏览器端 AI 推理 |
| `zustand` | 轻量级状态管理 |
| `react-router-dom` | 客户端路由 |
| `zod` | 运行时类型验证 |

### 后端核心依赖

| 包 | 用途 |
|---|---|
| `hono` | 轻量级 Web 框架 |
| `drizzle-orm` | 类型安全 ORM |
| `better-auth` | 认证框架 |
| `sharp` | 图像处理 |

## Common Patterns

### 添加新 API 路由

1. 在 `apps/server/src/routes/` 创建路由文件
2. 定义 Hono 路由处理器
3. 在主入口 `src/index.ts` 注册路由
4. 使用 Zod 验证请求参数

### 添加新数据库表

1. 在 `apps/server/src/db/schema.ts` 定义表
2. 添加 relations（如需要）
3. 导出 Zod schemas (`createInsertSchema`, `createSelectSchema`)
4. 运行 `bun run db:generate` 生成迁移
5. 运行 `bun run db:push` 应用到数据库

### 添加新前端页面

1. 在 `apps/web/src/pages/` 创建页面组件
2. 在路由配置中注册
3. 如需状态管理，在 `stores/` 创建 Zustand store
4. API 调用封装在 `services/`

## Troubleshooting

### 数据库问题

- 删除 `data/pacsviewer.db` 重新 `db:push` + `db:seed`
- 检查 `DATABASE_URL` 环境变量

### 依赖问题

- 删除 `node_modules` 和 `bun.lock`，重新 `bun install`
- 确保使用 Bun 而非 Node.js

### 构建问题

- 检查 TypeScript 类型错误: `bun run typecheck`
- 清理构建产物: 删除各包的 `dist/` 目录
