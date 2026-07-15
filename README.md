# PACS Viewer - 眼科影像管理系统

一个基于 Web 的 PACS Viewer，专注于眼科图像处理。

## 技术栈

- **前端**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **后端**: Bun + Hono + Drizzle ORM
- **数据库**: SQLite (开发) → PostgreSQL (生产)
- **图像处理**: Cornerstone.js + OpenCV.js + TensorFlow.js

## 快速开始

### 安装依赖

```bash
bun install
```

### 初始化数据库

```bash
cd apps/server
bun run db:push
bun run db:seed
```

### 启动开发服务器

```bash
# 启动后端
bun run dev:server

# 启动前端
bun run dev:web
```

### 访问应用

- 前端: http://localhost:5173
- 后端 API: http://localhost:3000

### 默认账号

- 管理员: admin / admin123
- 医生: doctor / doctor123

## 项目结构

```
pacsviewer/
├── apps/
│   ├── web/                    # 前端 SPA
│   │   ├── src/
│   │   │   ├── components/     # UI 组件
│   │   │   ├── hooks/          # 自定义 hooks
│   │   │   ├── stores/         # Zustand stores
│   │   │   ├── services/       # API 服务
│   │   │   ├── pages/          # 页面组件
│   │   │   └── i18n/           # 国际化
│   │   └── public/
│   └── server/                 # 后端服务
│       ├── src/
│       │   ├── routes/         # API 路由
│       │   ├── db/             # 数据库模型和迁移
│       │   └── middleware/     # 中间件
│       └── drizzle/            # 数据库迁移
├── packages/
│   ├── shared/                 # 共享类型和工具
│   ├── dicom/                  # DICOM 解析库
│   └── image-processing/       # 图像处理库
└── docker/                     # Docker 配置
```

## 开发计划

### Phase 1: 基础架构与核心功能 (4-6 周)
- [x] 项目脚手架搭建
- [ ] 用户系统
- [ ] 患者管理
- [ ] 图像管理
- [ ] 图像渲染引擎

### Phase 2: 专业编辑功能 (4-6 周)
- [ ] 测量工具
- [ ] 标注工具
- [ ] 图层管理
- [ ] 图像增强
- [ ] 图像对比

### Phase 3: 报告与设备接入 (3-4 周)
- [ ] 报告系统
- [ ] 设备接入框架
- [ ] DICOM 网关

### Phase 4: AI 与高级功能 (4-6 周)
- [ ] 图像滤镜
- [ ] 前端 AI
- [ ] 系统管理

### Phase 5: 生产化与优化 (2-3 周)
- [ ] 安全加固
- [ ] 性能优化
- [ ] 国际化
- [ ] 桌面应用打包

## License

MIT
