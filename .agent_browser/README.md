# Agent Browser 测试基础设施

基于 agent-browser 的自动化测试框架，用于 PACS Viewer 的端到端测试。

## 目录结构

```
.agent_browser/
├── scenarios/           # 测试场景文件
│   ├── smoke-patient-crud.md
│   └── smoke-viewer.md
├── reports/             # 测试报告输出
│   ├── *.html           # HTML 报告
│   ├── *.jsonl          # 执行轨迹
│   └── *.png            # 截图
├── scripts/             # 辅助脚本
├── run.sh               # 主运行脚本
├── check.sh             # 验证点检查器
└── trace.sh             # 执行轨迹记录器
```

## 快速开始

```bash
# 运行所有冒烟测试
./run.sh smoke

# 运行特定场景
./run.sh smoke-patient-crud

# 运行所有测试
./run.sh all

# 生成 HTML 报告
./run.sh --report
```

## 场景文件格式

场景使用 Markdown 格式，支持变量替换：

```markdown
# 场景标题

**Tags:** smoke, patient

## 前置条件

- 系统已启动
- 已登录

---

### Step 1: 操作描述

- **操作:** 具体操作步骤
- **数据:**
  - 字段: `{{变量名}}`
- **验证:**
  - [ ] 验证点 1
  - [ ] 验证点 2
```

### 可用变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `{{timestamp}}` | Unix 时间戳 | `1699000000` |
| `{{random}}` | 4 位随机数 | `1234` |
| `{{date}}` | 当前日期 | `2024-01-15` |
| `{{datetime}}` | 当前日期时间 | `2024-01-15T10:30:00` |
| `{{mrn}}` | 测试 MRN | `TEST-1699000000-1234` |
| `{{name}}` | 测试姓名 | `自动化测试患者-1234` |
| `{{phone}}` | 测试电话 | `13812340000` |
| `{{email}}` | 测试邮箱 | `test-1234@example.com` |

## 验证点检查

使用 `check.sh` 进行验证：

```bash
# 检查 URL
./check.sh url "/patients"

# 检查元素文本
./check.sh text "h1" "患者列表"

# 检查元素可见
./check.sh visible ".patient-list"

# 检查输入值
./check.sh value "#mrn" "TEST-001"

# 检查页面标题
./check.sh title "PACS Viewer"

# 截图
./check.sh screenshot reports/debug.png
```

## 执行轨迹

使用 `trace.sh` 记录详细执行轨迹：

```bash
# 开始追踪
./trace.sh start "smoke-patient-crud"

# 记录操作
./trace.sh action "点击新增患者按钮"

# 记录检查结果
./trace.sh check pass "URL 正确"
./trace.sh check fail "文本不匹配"

# 截图
./trace.sh screenshot "after-submit"

# 记录错误
./trace.sh error "元素未找到"

# 结束追踪
./trace.sh end
```

## GitHub Actions 集成

测试会在以下情况自动运行：

1. Push 到 main/master 分支
2. Pull Request
3. 手动触发

### 手动触发

在 GitHub Actions 页面，点击 "Run workflow"，可以指定特定场景或留空运行所有。

### 测试报告

测试完成后，HTML 报告会作为 Artifact 上传，保留 30 天。

失败时会自动截图并上传，保留 7 天。

## 编写新场景

1. 在 `scenarios/` 目录创建 `.md` 文件
2. 使用标准格式编写步骤
3. 添加验证点
4. 使用变量避免硬编码数据
5. 运行测试验证

### 最佳实践

- 每个场景独立，不依赖其他场景的执行结果
- 使用变量替换测试数据，避免冲突
- 每个步骤都有明确的验证点
- 失败时截图便于调试
- 使用 `smoke-` 前缀标记冒烟测试
