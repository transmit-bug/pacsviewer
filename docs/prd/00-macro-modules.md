# PRD: PACS Viewer 眼科版 — 宏观架构与模块规划

**状态：** Ready for Agent  
**创建日期：** 2025-01-27  
**版本：** v1.0

---

## Problem Statement

眼科医生需要一个专业的医学影像查看和分析系统，用于查看 OCT、眼底彩照、FFA/ICGA 等眼科图像。当前缺乏一个集成了图像查看、专业编辑、报告生成、设备接入的完整解决方案，且现有系统难以对接第三方眼科设备。

## Solution

构建一个基于 Web 的 PACS Viewer，专注于眼科图像处理，采用插件式架构支持第三方设备接入，提供专业级的图像编辑和 AI 辅助诊断能力。

---

## 宏观开发模块总览

本项目划分为 **10 个核心开发模块**，按依赖关系和优先级组织如下：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PACS Viewer 眼科版                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  M1 用户    │  │  M2 患者    │  │  M3 图像    │  │  M4 渲染    │       │
│  │  管理系统   │  │  管理系统   │  │  管理系统   │  │  引擎       │       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│         │                │                │                │               │
│         └────────────────┴────────────────┴────────────────┘               │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  M5 专业    │  │  M6 图像    │  │  M7 报告    │  │  M8 设备    │       │
│  │  图像编辑   │  │  对比系统   │  │  系统       │  │  接入       │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐                                         │
│  │  M9 系统    │  │  M10 界面   │                                         │
│  │  管理       │  │  与交互     │                                         │
│  └─────────────┘  └─────────────┘                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 模块依赖关系

```
M1 用户管理 ──────┐
                   │
M2 患者管理 ──────┤
                   ├──→ M5 专业图像编辑 ──→ M7 报告系统
M3 图像管理 ──────┤         │
                   │         ├──→ M6 图像对比
M4 渲染引擎 ──────┘         │
                             └──→ M8 设备接入

M9 系统管理 ←── 所有模块
M10 界面与交互 ←── 所有模块
```

---

## 模块 1：用户管理与权限系统

**优先级：** P0 - 核心  
**依赖：** 无  
**被依赖：** 所有模块

### 功能范围

1. 用户认证
   - 注册、登录、登出
   - JWT Token 管理（Access Token + Refresh Token）
   - 会话管理（多设备登录控制）
   - 密码加密存储（bcrypt）

2. 角色与权限（RBAC）
   - 预设角色：管理员、医生、技师、只读用户
   - 自定义角色创建
   - 权限粒度：模块级 + 操作级（CRUD）
   - 权限继承与覆盖

3. 用户管理
   - 用户列表与搜索
   - 用户信息编辑
   - 密码重置（管理员）
   - 账号启用/禁用

4. 审计日志
   - 登录日志
   - 操作日志（谁在什么时间做了什么）
   - 敏感操作记录
   - 日志查询与导出

### 数据模型

```
User {
  id: UUID
  username: string (unique)
  email: string (unique)
  password_hash: string
  display_name: string
  avatar: string?
  role_id: FK -> Role
  status: enum(active, disabled, locked)
  last_login_at: timestamp
  created_at: timestamp
  updated_at: timestamp
}

Role {
  id: UUID
  name: string (unique)
  description: string
  permissions: JSON  // {module: {action: boolean}}
  is_system: boolean  // 系统预设角色不可删除
  created_at: timestamp
}

Session {
  id: UUID
  user_id: FK -> User
  token: string (unique)
  refresh_token: string (unique)
  device_info: JSON
  ip_address: string
  expires_at: timestamp
  created_at: timestamp
}

AuditLog {
  id: UUID
  user_id: FK -> User
  action: string  // login, logout, create, update, delete, view
  resource: string  // patient, study, report, etc.
  resource_id: string?
  details: JSON
  ip_address: string
  created_at: timestamp
}
```

### API 端点

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me
PUT    /api/auth/password

GET    /api/users
GET    /api/users/:id
POST   /api/users
PUT    /api/users/:id
DELETE /api/users/:id
PUT    /api/users/:id/password
PUT    /api/users/:id/status

GET    /api/roles
POST   /api/roles
PUT    /api/roles/:id
DELETE /api/roles/:id

GET    /api/audit-logs
GET    /api/audit-logs/export
```

### 测试要点

- 注册流程完整性
- 登录/登出 Token 生命周期
- 权限校验（无权限访问返回 403）
- 角色 CRUD 及权限继承
- 审计日志记录完整性

---

## 模块 2：患者管理系统

**优先级：** P0 - 核心  
**依赖：** M1 用户管理  
**被依赖：** M3 图像管理, M7 报告系统

### 功能范围

1. 患者档案
   - 基本信息：姓名、性别、出生日期、联系方式
   - 医疗信息：病历号（MRN）、身份证号、医保号
   - 备注与标签
   - 头像/照片

2. 患者检索
   - 按姓名、病历号、手机号搜索
   - 高级筛选（年龄、性别、标签、诊断）
   - 模糊搜索支持
   - 搜索历史记录

3. 标签管理
   - 自定义标签（如：糖尿病、青光眼、白内障）
   - 标签颜色配置
   - 批量标签操作

4. 患者统计
   - 患者总数统计
   - 按标签/诊断分组统计
   - 新增患者趋势

### 数据模型

```
Patient {
  id: UUID
  mrn: string (unique)  // 病历号
  name: string
  gender: enum(male, female, other)
  birth_date: date
  phone: string?
  email: string?
  id_card: string?  // 身份证号（加密存储）
  insurance_no: string?  // 医保号
  address: string?
  avatar: string?
  notes: string?
  tags: JSON  // [tag_id, ...]
  custom_fields: JSON  // 自定义字段
  created_at: timestamp
  updated_at: timestamp
}

PatientTag {
  id: UUID
  name: string (unique)
  color: string  // hex color
  description: string?
  created_at: timestamp
}
```

### API 端点

```
GET    /api/patients
GET    /api/patients/:id
POST   /api/patients
PUT    /api/patients/:id
DELETE /api/patients/:id
GET    /api/patients/search
GET    /api/patients/:id/studies
GET    /api/patients/:id/timeline

GET    /api/patient-tags
POST   /api/patient-tags
PUT    /api/patient-tags/:id
DELETE /api/patient-tags/:id

GET    /api/patients/statistics
```

### 测试要点

- 患者 CRUD 完整性
- 搜索准确性（模糊搜索、多条件组合）
- 标签关联与解关联
- 敏感字段加密存储
- 批量操作性能

---

## 模块 3：图像管理系统

**优先级：** P0 - 核心  
**依赖：** M1 用户管理, M2 患者管理  
**被依赖：** M4 渲染引擎, M5 专业编辑, M6 图像对比, M7 报告系统, M8 设备接入

### 功能范围

1. 检查管理
   - 检查创建（关联患者）
   - 检查类型：OCT、眼底彩照、FFA、ICGA、视野、角膜地形图等
   - 检查状态：待诊断、诊断中、已诊断、已报告
   - 检查备注

2. 序列管理
   - 序列自动识别（DICOM Series）
   - 序列描述编辑
   - 序列排序

3. 图像存储
   - DICOM 文件解析（提取元数据）
   - 常见图像格式支持（JPEG、PNG、TIFF、BMP）
   - 文件存储（本地文件系统，可扩展到 S3）
   - 缩略图自动生成
   - 图像去重（基于哈希）

4. 批量操作
   - 批量上传（拖拽、文件夹）
   - 上传进度显示
   - 批量删除
   - 批量导出

5. 元数据管理
   - DICOM 标签查看
   - 自定义元数据字段
   - 元数据搜索

### 数据模型

```
Study {
  id: UUID
  patient_id: FK -> Patient
  study_date: date
  study_time: time
  study_type: enum(oct, fundus, ffa, icga, vf, octa, other)
  modality: string  // DICOM Modality
  device: string?
  physician_id: FK -> User?
  status: enum(pending, in_progress, diagnosed, reported)
  description: string?
  tags: JSON
  created_at: timestamp
  updated_at: timestamp
}

Series {
  id: UUID
  study_id: FK -> Study
  series_number: int
  series_description: string?
  modality: string
  body_part: string?
  image_count: int
  created_at: timestamp
}

Image {
  id: UUID
  series_id: FK -> Series
  instance_number: int
  file_path: string
  file_size: bigint
  file_hash: string  // SHA-256
  format: enum(dicom, jpeg, png, tiff, bmp)
  width: int
  height: int
  bits_allocated: int
  thumbnail_path: string?
  metadata: JSON  // DICOM tags or EXIF
  created_at: timestamp
}
```

### API 端点

```
GET    /api/studies
GET    /api/studies/:id
POST   /api/studies
PUT    /api/studies/:id
DELETE /api/studies/:id
PUT    /api/studies/:id/status

GET    /api/studies/:id/series
GET    /api/series/:id
GET    /api/series/:id/images

POST   /api/images/upload
POST   /api/images/upload/batch
GET    /api/images/:id
GET    /api/images/:id/metadata
GET    /api/images/:id/file
GET    /api/images/:id/thumbnail
DELETE /api/images/:id

GET    /api/images/search
POST   /api/images/export
```

### 测试要点

- DICOM 文件解析准确性
- 大文件上传稳定性
- 缩略图生成正确性
- 批量操作性能
- 文件去重逻辑

---

## 模块 4：图像渲染引擎

**优先级：** P0 - 核心  
**依赖：** M3 图像管理  
**被依赖：** M5 专业编辑, M6 图像对比

### 功能范围

1. Cornerstone.js 集成
   - 视口（Viewport）管理
   - 图像加载器配置（WADOLoader、WebImageLoader）
   - 工具管理器

2. 基础渲染
   - DICOM 图像解码与渲染
   - 普通图像渲染
   - 多帧图像支持
   - 图像金字塔（多分辨率）

3. 视口操作
   - 缩放（Zoom）
   - 平移（Pan）
   - 旋转（Rotate）
   - 翻转（Flip H/V）
   - 适配窗口（Fit to Window / Fit to Viewport）
   - 1:1 显示

4. 图像调节
   - 窗宽窗位（Window Width/Level）
   - 亮度/对比度
   - 伪彩映射（Grayscale、Hot Iron、Rainbow、Jet 等）
   - 反转显示

5. 显示信息
   - 患者信息叠加层
   - 图像信息（尺寸、窗宽窗位、缩放比例）
   - 标尺显示
   - 方位标记（L/R/A/P）

6. 多图布局
   - 单图、2图、4图、自定义布局
   - 布局切换动画
   - 图像拖拽分配

### 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                      React Components                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ Viewer  │  │ Toolbar │  │ Info    │  │ Layout  │       │
│  │ Canvas  │  │ Panel   │  │ Overlay │  │ Manager │       │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘       │
│       │            │            │            │              │
│       └────────────┴────────────┴────────────┘              │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Cornerstone.js Core                    │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │   │
│  │  │ Viewport │  │ Tools    │  │ Renderers│          │   │
│  │  │ Manager  │  │ Manager  │  │ Pipeline │          │   │
│  │  └──────────┘  └──────────┘  └──────────┘          │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Image Loaders                          │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │   │
│  │  │ WADO     │  │ Web      │  │ Custom   │          │   │
│  │  │ Loader   │  │ Loader   │  │ Loader   │          │   │
│  │  └──────────┘  └──────────┘  └──────────┘          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 关键库

```json
{
  "@cornerstonejs/core": "^1.x",
  "@cornerstonejs/tools": "^1.x",
  "@cornerstonejs/dicom-image-loader": "^1.x",
  "@cornerstonejs/nifti-volume-loader": "^1.x",
  "cornerstone-wado-image-loader": "^4.x",
  "dicom-parser": "^1.x"
}
```

### API 端点（内部）

```
// 前端内部接口，不暴露 HTTP
ViewportService:
  - createViewport(element, options)
  - destroyViewport(element)
  - setImage(viewportId, imageId)
  - setWindowLevel(viewportId, ww, wl)
  - setZoom(viewportId, zoom)
  - resetViewport(viewportId)

ToolService:
  - enableTool(toolName)
  - disableTool(toolName)
  - setActiveTool(toolName)
  - getToolState()
```

### 测试要点

- 图像加载成功率
- 视口操作响应速度
- 伪彩映射正确性
- 多图布局切换稳定性
- 内存管理（避免泄漏）

---

## 模块 5：专业图像编辑

**优先级：** P0 - 核心功能  
**依赖：** M4 渲染引擎  
**被依赖：** M7 报告系统

### 功能范围

#### 5.1 测量工具
- 长度测量（线段，单位：mm/px）
- 角度测量（两线夹角）
- 面积测量
  - 矩形面积
  - 椭圆面积
  - 多边形面积
  - 自由形状面积
- 像素值探针（显示坐标和像素值）
- 测量结果列表
- 测量结果导出

#### 5.2 标注工具
- 箭头标注（带文字说明）
- 文字注释（可拖拽、可编辑）
- 自由画笔（可调粗细、颜色）
- 高亮区域（半透明覆盖）
- ROI 区域标记
  - 矩形 ROI
  - 椭圆 ROI
  - 多边形 ROI
  - 自由曲线 ROI
- 标注样式自定义
  - 颜色选择器
  - 线宽调节
  - 字体大小
  - 透明度

#### 5.3 图层管理
- 图层列表
  - 图像图层（底层）
  - 标注图层（上层）
  - AI 结果图层（上层）
- 图层操作
  - 新建图层
  - 删除图层
  - 合并图层
  - 复制图层
- 图层属性
  - 可见性开关
  - 透明度调节
  - 锁定/解锁
  - 重命名
  - 排序（上移/下移）
- 图层导入/导出

#### 5.4 图像滤镜
- 空间滤波
  - 锐化（Unsharp Mask）
  - 模糊（Gaussian Blur、Box Blur）
  - 中值滤波（去噪）
- 边缘检测
  - Sobel 算子
  - Canny 边缘检测
  - Laplacian
- 直方图处理
  - 直方图均衡化
  - 直方图拉伸
  - 自适应直方图均衡化（CLAHE）
- 彩色处理
  - 亮度/对比度调节
  - 饱和度调节
  - 色相旋转
- 自定义滤镜核

#### 5.5 图像分割（前端 AI）
- 基础分割
  - 阈值分割（手动/自动）
  - 区域生长
  - 分水岭分割
- 深度学习分割（TensorFlow.js）
  - 视网膜层分割
  - 视盘/视杯分割
  - 血管分割
  - 黄斑区分割
- 分割结果编辑
  - 手动修正
  - 橡皮擦
  - 合并/拆分区域
- 分割结果量化
  - 面积计算
  - 厚度测量
  - 体积估算

#### 5.6 病灶自动识别（前端 AI）
- 病变检测
  - 糖尿病视网膜病变（DR）分级
  - 青光眼风险评估
  - 黄斑变性检测
  - 视网膜脱离检测
- 病灶标记
  - 自动标记病灶位置
  - 置信度显示
  - 病灶类型标注
- 结果可视化
  - 热力图叠加
  - 边界框标注
  - 分割掩码叠加

### 数据模型

```
Annotation {
  id: UUID
  image_id: FK -> Image
  user_id: FK -> User
  layer_id: FK -> Layer?
  type: enum(measurement, arrow, text, freehand, roi, highlight)
  geometry: JSON  // 几何数据（坐标、形状）
  style: JSON  // 样式（颜色、线宽、字体）
  label: string?
  notes: string?
  created_at: timestamp
  updated_at: timestamp
}

Layer {
  id: UUID
  image_id: FK -> Image
  name: string
  type: enum(image, annotation, ai_result)
  visible: boolean
  opacity: float  // 0-1
  locked: boolean
  sort_order: int
  created_at: timestamp
}

FilterPreset {
  id: UUID
  name: string
  filters: JSON  // 滤镜链配置
  is_system: boolean
  created_at: timestamp
}

SegmentationResult {
  id: UUID
  image_id: FK -> Image
  model_name: string
  result_mask: string  // 存储路径
  confidence: float
  metadata: JSON
  created_at: timestamp
}
```

### API 端点

```
GET    /api/images/:id/annotations
POST   /api/images/:id/annotations
PUT    /api/annotations/:id
DELETE /api/annotations/:id
POST   /api/annotations/batch

GET    /api/images/:id/layers
POST   /api/images/:id/layers
PUT    /api/layers/:id
DELETE /api/layers/:id
PUT    /api/layers/:id/order

POST   /api/images/:id/filters/apply
GET    /api/filter-presets
POST   /api/filter-presets

POST   /api/images/:id/segment
POST   /api/images/:id/detect
GET    /api/images/:id/ai-results
```

### 测试要点

- 测量精度验证
- 标注保存/恢复完整性
- 图层操作正确性
- 滤镜效果验证
- AI 模型加载和推理性能
- 分割结果准确性

---

## 模块 6：图像对比系统

**优先级：** P0 - 核心  
**依赖：** M4 渲染引擎, M5 专业编辑  
**被依赖：** M7 报告系统

### 功能范围

1. 并排对比
   - 左右分屏
   - 上下分屏
   - 四象限分屏
   - 同步滚动
   - 同步缩放
   - 同步窗宽窗位
   - 同步/异步切换

2. 叠加对比
   - 半透明叠加
   - 差异高亮显示
   - 透明度滑块控制
   - 混合模式（正常、差值、变亮、变暗）

3. 滑动对比
   - 中间滑块（水平/垂直）
   - 实时切换显示
   - 滑块位置记忆
   - 滑块样式自定义

4. 对比历史
   - 对比记录保存
   - 对比方案收藏
   - 对比结果快照

5. 对比测量
   - 差异区域标注
   - 变化量化（面积、密度变化）
   - 变化趋势图

### 数据模型

```
Comparison {
  id: UUID
  patient_id: FK -> Patient
  name: string
  type: enum(side_by_side, overlay, slider)
  config: JSON  // 对比配置
  image_ids: JSON  // [image_id, ...]
  created_by: FK -> User
  created_at: timestamp
}

ComparisonPreset {
  id: UUID
  name: string
  type: enum(side_by_side, overlay, slider)
  config: JSON
  is_system: boolean
  created_at: timestamp
}
```

### API 端点

```
GET    /api/comparisons
POST   /api/comparisons
GET    /api/comparisons/:id
DELETE /api/comparisons/:id
POST   /api/comparisons/:id/snapshot

GET    /api/comparison-presets
POST   /api/comparison-presets
PUT    /api/comparison-presets/:id
DELETE /api/comparison-presets/:id
```

### 测试要点

- 同步操作准确性
- 叠加混合模式正确性
- 滑块交互流畅性
- 大图像对比性能
- 对比配置保存/恢复

---

## 模块 7：报告系统

**优先级：** P1 - 重要  
**依赖：** M2 患者管理, M3 图像管理, M5 专业编辑  
**被依赖：** 无

### 功能范围

1. 报告模板管理
   - 模板 CRUD
   - 预设模板
     - OCT 报告模板
     - 眼底彩照报告模板
     - FFA/ICGA 报告模板
     - 视野报告模板
     - 综合报告模板
   - 模板字段定义
     - 文本字段
     - 数值字段
     - 下拉选择
     - 日期字段
     - 图像引用字段
   - 模板分类与标签

2. 报告编辑器
   - 结构化字段填写
   - 图像自动插入（从标注结果）
   - 富文本编辑
   - 表格编辑
   - 报告预览

3. 报告工作流
   - 状态：草稿 → 待审核 → 已审核 → 已发布
   - 审核意见
   - 退回修改
   - 签名确认

4. 报告导出
   - PDF 导出（带样式、带图像）
   - 打印预览
   - 批量导出
   - 报告模板自定义页眉页脚

5. 报告历史
   - 版本控制
   - 修改记录
   - 版本对比

### 数据模型

```
ReportTemplate {
  id: UUID
  name: string
  type: enum(oct, fundus, ffa, icga, vf, comprehensive, custom)
  description: string?
  fields: JSON  // 字段定义
  layout: JSON  // 布局配置
  is_system: boolean
  created_by: FK -> User
  created_at: timestamp
  updated_at: timestamp
}

Report {
  id: UUID
  study_id: FK -> Study
  patient_id: FK -> Patient
  template_id: FK -> ReportTemplate
  title: string
  content: JSON  // 填写的内容
  images: JSON  // 引用的图像列表
  status: enum(draft, pending_review, reviewed, published)
  reviewer_id: FK -> User?
  review_notes: string?
  published_at: timestamp?
  created_by: FK -> User
  created_at: timestamp
  updated_at: timestamp
}

ReportVersion {
  id: UUID
  report_id: FK -> Report
  version: int
  content: JSON
  images: JSON
  created_by: FK -> User
  created_at: timestamp
}
```

### API 端点

```
GET    /api/report-templates
POST   /api/report-templates
GET    /api/report-templates/:id
PUT    /api/report-templates/:id
DELETE /api/report-templates/:id

GET    /api/reports
POST   /api/reports
GET    /api/reports/:id
PUT    /api/reports/:id
DELETE /api/reports/:id
PUT    /api/reports/:id/status
GET    /api/reports/:id/versions
GET    /api/reports/:id/versions/:version

GET    /api/reports/:id/pdf
POST   /api/reports/batch-export
```

### 测试要点

- 模板渲染正确性
- 报告内容保存/恢复
- PDF 导出质量
- 工作流状态流转
- 版本历史完整性

---

## 模块 8：第三方设备接入

**优先级：** P1 - 重要  
**依赖：** M3 图像管理  
**被依赖：** 无

### 功能范围

1. 适配器架构
   - 统一适配器接口
   - 适配器生命周期管理
   - 适配器配置管理
   - 适配器状态监控
   - 适配器热插拔

2. DICOM 网关
   - C-STORE SCP（接收图像）
   - C-FIND SCU（查询患者/检查）
   - C-MOVE SCU（拉取图像）
   - DICOM Association 管理
   - Transfer Syntax 支持

3. REST API 上传
   - 文件上传（单个/批量）
   - 元数据传递
   - Webhook 回调
   - API Key 认证

4. 设备厂商适配器
   - 通用 DICOM 适配器
   - Zeiss OCT 适配器
   - Heidelberg Spectralis 适配器
   - Topcon 适配器
   - Nidek 适配器
   - 自定义适配器模板

5. 设备管理
   - 设备注册
   - 设备状态监控
   - 设备配置管理
   - 设备日志

### 数据模型

```
DeviceAdapter {
  id: UUID
  name: string
  type: enum(dicom, rest, file, custom)
  status: enum(active, inactive, error)
  config: JSON  // 适配器配置
  capabilities: JSON  // 支持的功能
  created_at: timestamp
  updated_at: timestamp
}

Device {
  id: UUID
  name: string
  type: string  // OCT, Fundus Camera, etc.
  manufacturer: string
  model: string
  serial_number: string?
  adapter_id: FK -> DeviceAdapter
  connection_info: JSON
  status: enum(online, offline, error)
  last_sync_at: timestamp?
  created_at: timestamp
  updated_at: timestamp
}

InboundTransfer {
  id: UUID
  device_id: FK -> Device?
  adapter_id: FK -> DeviceAdapter
  status: enum(pending, processing, completed, failed)
  file_count: int
  processed_count: int
  error_count: int
  metadata: JSON
  created_at: timestamp
  completed_at: timestamp?
}
```

### API 端点

```
GET    /api/adapters
POST   /api/adapters
GET    /api/adapters/:id
PUT    /api/adapters/:id
DELETE /api/adapters/:id
POST   /api/adapters/:id/start
POST   /api/adapters/:id/stop

GET    /api/devices
POST   /api/devices
GET    /api/devices/:id
PUT    /api/devices/:id
DELETE /api/devices/:id
GET    /api/devices/:id/status

POST   /api/upload/dicom
POST   /api/upload/image
POST   /api/upload/batch
GET    /api/transfers
GET    /api/transfers/:id
```

### 适配器接口定义

```typescript
interface DeviceAdapter {
  id: string;
  name: string;
  type: 'dicom' | 'rest' | 'file' | 'custom';
  
  // 生命周期
  initialize(config: AdapterConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  getStatus(): AdapterStatus;
  
  // 数据操作
  receiveImage(image: ImageData, metadata: ImageMetadata): Promise<void>;
  queryPatient(criteria: PatientCriteria): Promise<PatientInfo[]>;
  queryStudies(criteria: StudyCriteria): Promise<StudyInfo[]>;
  pullImages(studyId: string): Promise<ImageData[]>;
  
  // 事件
  onImageReceived: EventEmitter<ImageReceivedEvent>;
  onError: EventEmitter<AdapterErrorEvent>;
  onStatusChange: EventEmitter<StatusChangeEvent>;
}

interface AdapterConfig {
  // 通用配置
  name: string;
  enabled: boolean;
  
  // DICOM 配置
  dicom?: {
    aeTitle: string;
    port: number;
    maxAssociations: number;
    transferSyntaxes: string[];
  };
  
  // REST 配置
  rest?: {
    endpoint: string;
    apiKey: string;
    webhookUrl: string;
  };
  
  // 自定义配置
  custom?: Record<string, any>;
}
```

### 测试要点

- 适配器注册和初始化
- DICOM 服务启动和接收
- REST API 上传流程
- 设备状态同步
- 错误处理和重试

---

## 模块 9：系统管理

**优先级：** P2 - 一般  
**依赖：** 所有模块  
**被依赖：** 无

### 功能范围

1. 系统设置
   - 基础设置
     - 系统名称、Logo
     - 语言设置
     - 时区设置
   - 存储设置
     - 存储路径
     - 存储配额
     - 清理策略
   - DICOM 设置
     - AE Title
     - 端口配置
     - 传输语法
   - 邮件设置
     - SMTP 配置
     - 邮件模板
   - 通知设置
     - 通知渠道（邮件、站内）
     - 通知规则

2. 数据备份与恢复
   - 手动备份
   - 定时备份计划
   - 备份文件管理
   - 数据恢复
   - 备份完整性验证

3. 系统监控
   - 仪表盘
     - 存储使用量
     - 活跃用户数
     - 今日检查量
     - 系统负载
   - 性能指标
     - API 响应时间
     - 图像加载时间
     - 数据库查询时间
   - 告警规则
     - 存储空间不足
     - 系统异常
     - 服务宕机

4. 日志管理
   - 系统日志
   - 操作日志
   - 错误日志
   - 访问日志
   - 日志查询与导出
   - 日志轮转

### 数据模型

```
SystemSetting {
  id: UUID
  category: string  // general, storage, dicom, email, notification
  key: string
  value: JSON
  updated_by: FK -> User
  updated_at: timestamp
}

BackupJob {
  id: UUID
  name: string
  type: enum(full, incremental, differential)
  schedule: string?  // cron expression
  status: enum(pending, running, completed, failed)
  file_path: string?
  file_size: bigint?
  started_at: timestamp?
  completed_at: timestamp?
  created_at: timestamp
}

SystemAlert {
  id: UUID
  type: enum(info, warning, error, critical)
  title: string
  message: string
  source: string
  resolved: boolean
  resolved_at: timestamp?
  created_at: timestamp
}
```

### API 端点

```
GET    /api/settings
GET    /api/settings/:category
PUT    /api/settings/:category

GET    /api/backups
POST   /api/backups
GET    /api/backups/:id
DELETE /api/backups/:id
POST   /api/backups/:id/restore
POST   /api/backups/schedule

GET    /api/monitor/dashboard
GET    /api/monitor/metrics
GET    /api/monitor/alerts
PUT    /api/monitor/alerts/:id/resolve

GET    /api/logs
GET    /api/logs/export
GET    /api/logs/statistics
```

### 测试要点

- 设置保存/恢复
- 备份创建和恢复
- 监控数据准确性
- 日志记录完整性
- 告警触发正确性

---

## 模块 10：界面与交互

**优先级：** P2 - 一般  
**依赖：** 所有模块  
**被依赖：** 无

### 功能范围

1. 布局系统
   - 响应式布局（桌面、平板）
   - 可拖拽面板
   - 可调整大小的面板
   - 布局保存/恢复
   - 预设布局（诊断、报告、对比）

2. 主题系统
   - 暗色主题（医学影像标准）
   - 亮色主题
   - 主题切换
   - 自定义主题色

3. 快捷键系统
   - 全局快捷键
   - 工具快捷键
   - 自定义快捷键
   - 快捷键提示

4. 国际化
   - 中文
   - 英文
   - 语言切换
   - 日期/数字格式化

5. 通知系统
   - 站内通知
   - 通知中心
   - 通知设置
   - 通知标记已读

6. 引导与帮助
   - 新手引导
   - 工具提示
   - 帮助文档
   - 快捷键参考

### UI 组件库

```
// 使用 shadcn/ui 组件
基础组件:
  - Button, Input, Select, Checkbox, Radio
  - Dialog, Modal, Drawer, Popover
  - Table, Pagination, Sort
  - Tabs, Accordion, Card
  - Toast, Alert, Badge
  - Calendar, DatePicker
  - Dropdown, ContextMenu

自定义组件:
  - ViewerCanvas (图像查看器)
  - Toolbar (工具栏)
  - Panel (可折叠面板)
  - LayerManager (图层管理器)
  - AnnotationEditor (标注编辑器)
  - ReportEditor (报告编辑器)
  - ComparisonView (对比视图)
  - PatientTimeline (患者时间轴)
```

### 测试要点

- 布局响应式正确性
- 主题切换流畅性
- 快捷键冲突检测
- 国际化文本完整性
- 通知推送及时性

---

## Out of Scope

1. **移动端应用** — 本期不开发 iOS/Android 原生应用
2. **云端部署** — 本期专注于单机 Docker 部署
3. **HL7/FHIR 集成** — 本期不对接医院 HIS/EMR 系统
4. **远程诊断** — 本期不支持远程会诊功能
5. **AI 训练平台** — 本期只集成预训练模型，不提供模型训练
6. **PACS 联盟** — 本期不支持多院区 PACS 互联

---

## Further Notes

### 技术挑战与风险

1. **大图像性能** — OCT 单次检查 100+ 张切片，需图像金字塔和懒加载
2. **前端 AI 性能** — TensorFlow.js 推理性能受限，需 WebGL 加速和模型优化
3. **DICOM 兼容性** — 不同设备 DICOM 实现差异大，需充分测试
4. **多图同步** — 对比模式下多图同步渲染需精细的性能优化

### 开发顺序建议

```
Phase 1: M1 + M2 + M3 + M4 (基础架构 + 看图)
Phase 2: M5 + M6 (专业编辑 + 对比)
Phase 3: M7 + M8 (报告 + 设备接入)
Phase 4: M5.5 + M5.6 (AI 能力)
Phase 5: M9 + M10 (系统管理 + 界面优化)
```

### 依赖的外部库

```json
{
  "runtime": {
    "hono": "^4.x",
    "drizzle-orm": "^0.x",
    "better-auth": "^1.x",
    "sharp": "^0.x"
  },
  "frontend": {
    "react": "^18.x",
    "react-dom": "^18.x",
    "zustand": "^4.x",
    "react-hook-form": "^7.x",
    "zod": "^3.x",
    "tailwindcss": "^3.x",
    "@radix-ui/react-*": "^1.x",
    "react-i18next": "^14.x",
    "i18next": "^23.x"
  },
  "medical": {
    "@cornerstonejs/core": "^1.x",
    "@cornerstonejs/tools": "^1.x",
    "@cornerstonejs/dicom-image-loader": "^1.x",
    "dicom-parser": "^1.x"
  },
  "ai": {
    "@tensorflow/tfjs": "^4.x",
    "@tensorflow/tfjs-backend-webgl": "^4.x"
  }
}
```
