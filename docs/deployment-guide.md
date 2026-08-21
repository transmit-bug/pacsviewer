# PACS Viewer 1.0 安装与运维指南（医院试点）

适用范围：1.0 试点版，单机部署，SQLite 存储，Docker Compose 编排，Caddy 网关终结 HTTPS（自签证书）。

架构一览：

```
工作站浏览器 ──HTTPS:443──▶ gateway (Caddy, 自签证书)
                              └─▶ web (nginx: SPA 静态资源 + /api 反代)
                                    └─▶ server (Bun+Hono, :3000, 仅内网)
                                          └─▶ SQLite (宿主机 ./data/pacsviewer.db, bind mount)
```

- 对外仅暴露 **443** 一个端口；`server`（3000）与 `web`（80）只在 Compose 内网可达。
- 数据全部落在宿主机 `./data/` 目录（数据库 + 图像文件），备份也在此目录。

## 1. 前置条件

| 项目 | 要求 |
|---|---|
| 操作系统 | Linux（systemd 发行版）或 macOS；Windows 需 WSL2 |
| Docker | Docker Engine ≥ 20.10 + Docker Compose v2（`docker compose` 子命令） |
| Bun | ≥ 1.x（用于初始化数据库和定时备份脚本，[安装](https://bun.sh)） |
| 硬件建议 | 4 核 CPU / 8 GB 内存 / SSD ≥ 256 GB（按影像量预估：每张眼底图约 1–5 MB，OCT 序列可达数百 MB） |
| 网络 | 院内网静态 IP；无需外网域名（自签证书场景） |

## 2. 全新安装步骤

### 2.1 获取代码

```bash
git clone <repo-url> pacsviewer && cd pacsviewer
# 切到 1.0 试点分支/标签
git checkout integration/wave1
```

### 2.2 配置环境变量

```bash
cp .env.example .env
vi .env
```

**注意**：`.env` 只作用于**宿主机侧命令**（建库、播种、备份脚本读取 `DATABASE_URL` 等）。容器的环境变量在 `docker-compose.yml` 的 `server.environment` 段中定义——需要覆盖默认值时，直接编辑该段并取消注释对应行（Compose 不会把根目录 `.env` 注入容器）。

完整环境变量说明：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `NODE_ENV` | 容器内固定 `production` | 生产必须为 production：播种走最小化路径（仅角色+管理员）、demo 登录路由不存在、DEV_FALLBACK_IMAGE 关闭 |
| `PORT` | `3000` | server 监听端口（容器内网，一般不改） |
| `DATABASE_URL` | `./data/pacsviewer.db` | SQLite 文件路径。容器内固定为 `/app/data/pacsviewer.db`（bind mount 到宿主机 `./data`）。**宿主机侧执行 seed/backup 脚本时建议设为绝对路径**，避免相对 cwd 解析错位 |
| `CORS_ORIGIN` | `http://localhost:5173` | 允许的前端来源，多个用逗号分隔。生产走网关同源代理，可留空或不设 |
| `SESSION_IDLE_MINUTES` | `30` | 会话空闲超时（分钟）；refresh 轮换只顺延空闲超时 |
| `SESSION_ABSOLUTE_HOURS` | `12` | 会话绝对上限（小时），刷新不重置，到期须重新登录 |
| `RATE_LIMIT_MAX` | `5` | 登录/刷新限流：窗口内失败次数上限（按 IP+用户名） |
| `RATE_LIMIT_WINDOW_MINUTES` | `15` | 触发限流后的锁定时长（分钟） |
| `INITIAL_ADMIN_PASSWORD` | 空 | 初始管理员密码（seed 时生效）。**留空则首启随机生成并打印一次**。生产建议留空走随机 |
| `DEMO_LOGIN_ENABLED` | 开发默认 `true` | demo 一键登录开关。生产构建中该路由根本不存在，无泄露面 |
| `DEV_FALLBACK_IMAGE` | 开发默认 `true` | 图像文件缺失时返回合成占位图。生产自动关闭 |
| `AUDIT_RETENTION_MONTHS` | `6` | 审计日志保留月数（每日自动清理过期行），试点要求 ≥6 |
| `BACKUP_DIR` | `<db 目录>/backups` | 备份快照目录（默认即 `./data/backups`） |
| `BACKUP_KEEP_HOURLY` | `48` | 始终保留的最新快照数（小时层） |
| `BACKUP_KEEP_DAILY` | `14` | 按天额外保留的快照数 |
| `BACKUP_KEEP_WEEKLY` | `8` | 按 ISO 周额外保留的快照数 |

### 2.3 初始化数据库（宿主机上，一次性）

容器镜像不含建库/播种逻辑，首次启动前必须在宿主机完成：

```bash
cd apps/server
bun install
# 导出绝对路径的 DATABASE_URL，供 push 和 seed 使用
export DATABASE_URL=/absolute/path/to/pacsviewer/data/pacsviewer.db
bun run db:push                       # 建 schema
NODE_ENV=production bun run db:seed   # 生产最小化播种
```

seed 成功时会输出：

```
🔑 初始管理员账号: admin
🔑 初始管理员密码: A1xxxxxxxxxxxxxxxx
⚠️  密码仅此打印一次，请立即保存；首次登录时将被强制修改。
```

> 若设置了 `INITIAL_ADMIN_PASSWORD` 则使用指定值（仍强制首登改密）。密码策略：≥8 位且同时包含字母和数字。

### 2.4 启动服务

```bash
cd /absolute/path/to/pacsviewer
docker compose up -d --build
docker compose ps        # gateway / web / server 三者均 Up
```

### 2.5 导出自签根证书并分发给工作站

Caddy 使用 `tls internal`（内置 CA 现场签发），首次启动后导出根证书：

```bash
docker compose cp gateway:/data/caddy/pki/authorities/local/root.crt ./pacsviewer-root.crt
```

将 `pacsviewer-root.crt` 分发给各工作站并导入信任库：

| 系统 | 操作 |
|---|---|
| Windows | 双击证书 → 「安装证书」→ 本地计算机 → 「受信任的根证书颁发机构」存储区，然后重启浏览器 |
| macOS | 双击证书导入「钥匙串访问」→「系统」，打开详情并将信任设置为「始终信任」 |
| Linux (Chrome/Firefox) | `certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "PACSViewer Root" -i pacsviewer-root.crt`（Firefox 用 设置→隐私与安全→证书→查看证书→导入） |

导入后访问 `https://<服务器IP>` 不再出现证书告警。（不导入也可用，但每次需手动忽略告警。）

### 2.6 首次登录

浏览器打开 `https://<服务器IP>`：

1. 使用账号 `admin` + 打印过一次的初始密码登录；
2. 系统检测到初始密码未修改，登录页会先展示**强制改密表单**，设置新密码（≥8 位、含字母和数字）后方可进入；
3. 进入「设置 → 用户管理」为科室医生创建各自账号（同样受密码策略约束）。

> 安全提示：忘记保存随机初始密码时，只能清库重播（会自动备份旧库到 `data/backups/`）：`NODE_ENV=production bun run db:seed -- --reset`。

## 3. TLS：自签证书原理与更换医院 CA 证书

- **原理**：Caddyfile 中 `tls internal` 让 Caddy 用内置 CA 在首次启动时现场签发自签站点证书，CA 根证书持久化在 `caddy_data` 卷中，无需外部域名或 Let's Encrypt 流程（见 `docker/gateway/Caddyfile`）。
- **更换为医院 CA 签发的证书**：
  1. 向医院 IT 申请服务器证书（`server.crt` + 私钥 `server.key`，SAN 含服务器 IP 或域名）；
  2. 修改 `docker-compose.yml` 中 gateway 服务，挂载证书目录：
     ```yaml
     volumes:
       - ./docker/gateway/Caddyfile:/etc/caddy/Caddyfile:ro
       - ./docker/gateway/certs:/etc/caddy/certs:ro
     ```
  3. 将 Caddyfile 中 `tls internal` 改为：
     ```
     tls /etc/caddy/certs/server.crt /etc/caddy/certs/server.key
     ```
  4. `docker compose up -d gateway` 重启生效。此后工作站无需再信任自签根证书。

## 4. 定时备份

备份策略（`VACUUM INTO` 快照 + 夜间图像镜像同步）与恢复流程详见 **[docs/backup-restore-runbook.md](./backup-restore-runbook.md)**，此处只给出部署时的 cron 接入。

备份脚本在宿主机运行（数据库经 bind mount 就在宿主机文件系统上）。注意脚本按 `DATABASE_URL`（默认相对当前目录 `./data/pacsviewer.db`）定位数据库，cron 里显式传绝对路径最稳妥：

```cron
# 每小时 DB 快照 + 保留期清理 + 夜间图像镜像
0 * * * * cd /opt/pacsviewer/apps/server && DATABASE_URL=/opt/pacsviewer/data/pacsviewer.db /usr/local/bin/bun run src/scripts/backup.ts >> /opt/pacsviewer/data/backups/cron.log 2>&1
```

（`which bun` 确认 bun 绝对路径；systemd 主机可改用 timer。）手动执行一次验证：

```bash
cd apps/server && DATABASE_URL=../data/pacsviewer.db bun run src/scripts/backup.ts
tail -5 ../data/backups/backup.log   # 应看到 backup_success JSON 行
```

## 5. 日常运维

### 5.1 升级

```bash
cd /opt/pacsviewer
docker compose down
git pull                                  # 或 checkout 新版本标签
cd apps/server && bun install && bun run db:push   # schema 有变更时
cd .. && docker compose up -d --build
```

升级前确认最近一次备份成功（`tail data/backups/backup.log`）。

### 5.2 重启 / 停止

```bash
docker compose restart          # 重启全部服务
docker compose restart server   # 只重启后端
docker compose down             # 停止并移除容器（./data 数据不受影响）
```

三个服务均配置 `restart: unless-stopped`，主机重启后自动拉起。

### 5.3 日志位置

| 日志 | 位置 |
|---|---|
| 应用日志（server/web/gateway） | `docker compose logs -f [service]`（不落盘，随容器生命周期） |
| 访问/审计日志 | 系统内查询：「设置」页审计日志区块（仅管理员角色可见，支持 CSV 导出）；超过 `AUDIT_RETENTION_MONTHS` 自动清理 |
| 备份日志 | `data/backups/backup.log`（JSON 行）+ cron 输出 `data/backups/cron.log` |
| 播种前自动备份 | `data/backups/pacsviewer.db-<时间戳>`（`--reset` 清库前生成） |

### 5.4 健康检查

server 提供 `GET /health`（无需认证，返回 `{status:"ok", timestamp}`）。但网关/nginx 只反代 `/api` 路径，`https://<host>/health` 会命中 SPA 页面而非健康接口，需进入容器网络检查：

```bash
docker compose exec server wget -qO- http://localhost:3000/health
# {"status":"ok","timestamp":"..."}
```

从外部做存活探测可用 `curl -k https://<host>`（应返回 SPA HTML，HTTP 200）。

### 5.5 故障排查速查

| 现象 | 可能原因 / 处理 |
|---|---|
| 浏览器证书告警 | 工作站未导入 root.crt，见 §2.5 |
| 登录报「尝试次数过多，已临时锁定 15 分钟」 | 触发限流（默认 15 分钟窗口内 5 次失败），等待锁定结束或调整 `RATE_LIMIT_*` |
| 登录后很快被登出 | 空闲超 30 分钟（`SESSION_IDLE_MINUTES`）；或距登录已超 12 小时（`SESSION_ABSOLUTE_HOURS`，属预期行为） |
| `docker compose up` 后无法建库 | 未在宿主机执行 §2.3 的 `db:push` + seed；检查 `data/pacsviewer.db` 是否存在 |
| 上传图像失败 | 文件 >100 MB、单批 >200 个、扩展名不在白名单（`.dcm/.dicom/.jpg/.jpeg/.png/.bmp/.tiff/.tif`）均会被拒绝；DICOMDIR 不支持 |
| 忘记 admin 密码 | 无自助找回；以 `--reset` 重播（先自动备份），用新随机密码登录 |
