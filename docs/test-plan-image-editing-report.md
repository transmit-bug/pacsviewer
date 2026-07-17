# 图像编辑与报告管理功能测试规划

## 1. 功能概览分析

### 1.1 图像编辑功能

**前端组件：**
- `AnnotationTools.tsx` - 标注工具（箭头、文字、画笔、矩形ROI、椭圆ROI、多边形ROI）
- `MeasurementTools.tsx` - 测量工具（长度、角度、面积、探针）
- `LayerManager.tsx` - 图层管理（添加、删除、重排序、可见性、锁定、透明度）
- `ImageFilters.tsx` - 图像滤镜（亮度、对比度、饱和度、锐化、高斯模糊、中值滤波、Sobel、Canny、直方图均衡化）
- `CornerstoneViewport.tsx` - 医学图像渲染（基于Cornerstone.js）

**后端API：**
- `annotations.ts` - 标注CRUD，支持图像级和检查级标注
- `layers.ts` - 图层CRUD
- `images.ts` - 图像上传、元数据提取、金字塔生成

**状态管理：**
- `editorStore.ts` - 编辑器状态（图层、滤镜、工具）
- `viewerStore.ts` - 查看器状态（视口、标注、图层）

### 1.2 报告管理功能

**前端组件：**
- `ReportPage.tsx` - 报告编辑页面（模板选择、结构化字段、富文本编辑、图像引用、版本历史）

**后端API：**
- `reports.ts` - 报告CRUD、状态管理、版本控制
- `report-templates.ts` - 模板CRUD

**状态管理：**
- `reportStore.ts` - 报告状态（报告列表、模板、分页）

## 2. 功能完整性评估

### 2.1 ✅ 已实现功能

**图像编辑：**
- [x] 基础标注工具（箭头、文字、画笔、矩形、椭圆、多边形）
- [x] 测量工具（长度、角度、面积、探针）
- [x] 图层管理（增删改查、排序、可见性、锁定、透明度）
- [x] 图像滤镜（9种滤镜）
- [x] 医学图像渲染（Cornerstone.js集成）
- [x] 视口操作（缩放、平移、窗宽窗位、旋转、翻转）

**报告管理：**
- [x] 模板系统（多种眼科检查模板）
- [x] 结构化字段编辑
- [x] 富文本编辑（findings字段）
- [x] 图像引用管理
- [x] 版本控制（自动版本创建、版本对比）
- [x] 审核工作流（草稿→待审核→已审核→已发布）
- [x] 打印/导出功能

### 2.2 ⚠️ 潜在缺失功能

**图像编辑：**
1. **撤销/重做功能** - 编辑器store中没有undo/redo状态
2. **标注持久化** - 标注保存到后端的流程不完整
3. **图层与标注关联** - 图层和标注的关联关系在前端未完全实现
4. **图像导出** - 编辑后的图像导出功能缺失
5. **批量操作** - 批量标注、批量滤镜应用缺失
6. **自定义滤镜** - 用户自定义滤镜参数预设缺失
7. **标注样式编辑** - 颜色、线宽等样式编辑UI不完整
8. **测量单位切换** - 像素到实际单位（mm、μm）的转换缺失

**报告管理：**
1. **报告模板编辑器** - 模板创建/编辑的可视化工具缺失
2. **报告克隆/复制** - 从已有报告创建新报告功能缺失
3. **报告导出格式** - 仅支持打印，缺少PDF/Word导出
4. **报告协作** - 多人同时编辑、评论功能缺失
5. **报告搜索** - 全文搜索功能缺失
6. **报告统计** - 报告数量、状态统计缺失
7. **批量审核** - 批量批准/发布功能缺失
8. **报告签名** - 电子签名功能缺失

## 3. 测试用例规划

### 3.1 图像编辑测试

#### 3.1.1 标注工具测试

**单元测试 (`apps/web/src/components/editor/__tests__/AnnotationTools.test.tsx`)：**

```typescript
import { describe, test, expect } from 'bun:test';
import { calculateDistance, calculateAngle } from '../MeasurementTools';

describe('AnnotationTools', () => {
  test('箭头标注数据结构正确', () => {
    const annotation = {
      id: '1',
      type: 'arrow',
      geometry: { points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] },
      style: { color: '#00ff00', lineWidth: 2 },
      label: '',
    };
    expect(annotation.type).toBe('arrow');
    expect(annotation.geometry.points).toHaveLength(2);
  });

  test('文字标注包含文本内容', () => {
    const annotation = {
      id: '2',
      type: 'text',
      geometry: { points: [{ x: 50, y: 50 }] },
      style: { color: '#ffffff', fontSize: 14 },
      label: '测试标注',
    };
    expect(annotation.label).toBe('测试标注');
  });
});
```

**集成测试 (`apps/server/tests/annotations.test.ts`)：**

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createTestApp, request } from './helpers';
import { v4 as uuid } from 'uuid';
import * as schema from '../src/db/schema';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let testImageId: string;

beforeAll(async () => {
  ctx = await createTestApp();
  testImageId = uuid();
  // ... seed data
});

afterAll(() => {
  ctx.cleanup();
});

describe('Annotations API', () => {
  test('POST /annotations - 创建图像标注', async () => {
    const res = await request(ctx.app, 'POST', '/annotations', {
      headers: ctx.authHeaders,
      body: {
        imageId: testImageId,
        type: 'arrow',
        geometry: { points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] },
        style: { color: '#00ff00', lineWidth: 2 },
        label: '测试箭头',
      },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.type).toBe('arrow');
  });

  test('PUT /annotations/:id - 更新标注', async () => {
    const createRes = await request(ctx.app, 'POST', '/annotations', {
      headers: ctx.authHeaders,
      body: { imageId: testImageId, type: 'text', geometry: {}, style: {}, label: '原始' },
    });
    const { data } = await createRes.json();

    const res = await request(ctx.app, 'PUT', `/annotations/${data.id}`, {
      headers: ctx.authHeaders,
      body: { label: '更新后' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.label).toBe('更新后');
  });

  test('DELETE /annotations/:id - 删除标注', async () => {
    // 创建并删除
  });

  test('GET /annotations?imageId= - 按图像查询标注', async () => {
    const res = await request(ctx.app, 'GET', `/annotations?imageId=${testImageId}`, {
      headers: ctx.authHeaders,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });
});
```

#### 3.1.2 测量工具测试

**单元测试 (`apps/web/src/components/editor/__tests__/MeasurementTools.test.ts`)：**

```typescript
import { describe, test, expect } from 'bun:test';
import {
  calculateDistance,
  calculateAngle,
  calculateAreaRect,
  calculateAreaEllipse,
  calculateAreaPolygon,
} from '../MeasurementTools';

describe('MeasurementTools', () => {
  test('距离计算 - calculateDistance', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 3, y: 4 };
    expect(calculateDistance(p1, p2)).toBe(5);
  });

  test('角度计算 - calculateAngle', () => {
    const p1 = { x: 0, y: 1 };
    const vertex = { x: 0, y: 0 };
    const p2 = { x: 1, y: 0 };
    const angle = calculateAngle(p1, vertex, p2);
    expect(angle).toBeCloseTo(90, 0);
  });

  test('矩形面积计算 - calculateAreaRect', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 10, y: 5 };
    expect(calculateAreaRect(p1, p2)).toBe(50);
  });

  test('椭圆面积计算 - calculateAreaEllipse', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 10, y: 6 };
    const area = calculateAreaEllipse(p1, p2);
    expect(area).toBeCloseTo(Math.PI * 5 * 3, 0);
  });

  test('多边形面积计算 - calculateAreaPolygon', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(calculateAreaPolygon(points)).toBe(100);
  });
});
```

#### 3.1.3 图像滤镜测试

**单元测试 (`apps/web/src/lib/__tests__/imageProcessing.test.ts`)：**

```typescript
import { describe, test, expect } from 'bun:test';
import {
  applyBrightness,
  applyContrast,
  applySaturation,
  applySharpen,
  applyGaussianBlur,
  applyMedianFilter,
  applySobel,
  applyCanny,
  applyHistogramEqualization,
} from '../imageProcessing';

function createTestImageData(width: number, height: number, fill: number = 128): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill;
    data[i + 1] = fill;
    data[i + 2] = fill;
    data[i + 3] = 255;
  }
  return { data, width, height } as ImageData;
}

describe('Image Processing', () => {
  test('亮度调节 - applyBrightness', () => {
    const input = createTestImageData(10, 10, 100);
    const output = applyBrightness(input, 50);
    expect(output.data[0]).toBeGreaterThan(100);
  });

  test('对比度调节 - applyContrast', () => {
    const input = createTestImageData(10, 10, 100);
    const output = applyContrast(input, 50);
    expect(output.data[0]).not.toBe(100);
  });

  test('饱和度调节 - applySaturation', () => {
    const input = createTestImageData(10, 10, 100);
    const output = applySaturation(input, 50);
    expect(output.data[0]).not.toBe(100);
  });

  test('锐化滤镜 - applySharpen', () => {
    const input = createTestImageData(10, 10, 100);
    const output = applySharpen(input, 1);
    expect(output.width).toBe(10);
    expect(output.height).toBe(10);
  });

  test('高斯模糊 - applyGaussianBlur', () => {
    const input = createTestImageData(10, 10, 100);
    const output = applyGaussianBlur(input, 1);
    expect(output.width).toBe(10);
  });

  test('中值滤波 - applyMedianFilter', () => {
    const input = createTestImageData(10, 10, 100);
    const output = applyMedianFilter(input, 1);
    expect(output.width).toBe(10);
  });

  test('Sobel边缘检测 - applySobel', () => {
    const input = createTestImageData(10, 10, 100);
    const output = applySobel(input);
    expect(output.width).toBe(10);
  });

  test('Canny边缘检测 - applyCanny', () => {
    const input = createTestImageData(10, 10, 100);
    const output = applyCanny(input, 50, 150);
    expect(output.width).toBe(10);
  });

  test('直方图均衡化 - applyHistogramEqualization', () => {
    const input = createTestImageData(10, 10, 100);
    const output = applyHistogramEqualization(input);
    expect(output.width).toBe(10);
  });
});
```

#### 3.1.4 图层管理测试

**集成测试 (`apps/server/tests/layers.test.ts`)：**

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createTestApp, request } from './helpers';
import { v4 as uuid } from 'uuid';
import * as schema from '../src/db/schema';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let testImageId: string;

beforeAll(async () => {
  ctx = await createTestApp();
  testImageId = uuid();
  // ... seed image data
});

afterAll(() => {
  ctx.cleanup();
});

describe('Layers API', () => {
  test('POST /layers - 创建图层', async () => {
    const res = await request(ctx.app, 'POST', '/layers', {
      headers: ctx.authHeaders,
      body: {
        imageId: testImageId,
        name: '标注图层',
        type: 'annotation',
        visible: true,
        opacity: 1,
      },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe('标注图层');
  });

  test('PUT /layers/:id - 更新图层', async () => {
    const createRes = await request(ctx.app, 'POST', '/layers', {
      headers: ctx.authHeaders,
      body: { imageId: testImageId, name: '原始', type: 'annotation' },
    });
    const { data } = await createRes.json();

    const res = await request(ctx.app, 'PUT', `/layers/${data.id}`, {
      headers: ctx.authHeaders,
      body: { name: '修改后', opacity: 0.5 },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('修改后');
    expect(body.data.opacity).toBe(0.5);
  });

  test('DELETE /layers/:id - 删除图层', async () => {
    // 创建并删除
  });

  test('GET /layers?imageId= - 查询图层', async () => {
    const res = await request(ctx.app, 'GET', `/layers?imageId=${testImageId}`, {
      headers: ctx.authHeaders,
    });
    expect(res.status).toBe(200);
  });
});
```

### 3.2 报告管理测试

#### 3.2.1 报告CRUD测试

**集成测试 (`apps/server/tests/reports.test.ts`)：**

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createTestApp, request } from './helpers';
import { v4 as uuid } from 'uuid';
import * as schema from '../src/db/schema';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let testPatientId: string;
let testStudyId: string;
let testTemplateId: string;

beforeAll(async () => {
  ctx = await createTestApp();
  // ... seed patient, study, template
});

afterAll(() => {
  ctx.cleanup();
});

describe('Reports API', () => {
  test('POST /reports - 创建报告', async () => {
    const res = await request(ctx.app, 'POST', '/reports', {
      headers: ctx.authHeaders,
      body: {
        studyId: testStudyId,
        patientId: testPatientId,
        templateId: testTemplateId,
        title: '测试报告',
        content: { findings: '正常', conclusion: '无异常' },
        status: 'draft',
      },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.title).toBe('测试报告');
  });

  test('GET /reports - 获取报告列表（分页）', async () => {
    const res = await request(ctx.app, 'GET', '/reports?page=1&pageSize=10', {
      headers: ctx.authHeaders,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toBeDefined();
    expect(body.data.total).toBeDefined();
  });

  test('GET /reports/:id - 获取单个报告', async () => {
    const createRes = await request(ctx.app, 'POST', '/reports', {
      headers: ctx.authHeaders,
      body: { studyId: testStudyId, patientId: testPatientId, templateId: testTemplateId, title: '详情测试', content: {} },
    });
    const { data } = await createRes.json();

    const res = await request(ctx.app, 'GET', `/reports/${data.id}`, {
      headers: ctx.authHeaders,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.title).toBe('详情测试');
  });

  test('PUT /reports/:id - 更新报告', async () => {
    // 创建并更新
  });

  test('DELETE /reports/:id - 删除报告', async () => {
    // 创建并删除
  });

  test('GET /reports?studyId= - 按检查查询报告', async () => {
    const res = await request(ctx.app, 'GET', `/reports?studyId=${testStudyId}`, {
      headers: ctx.authHeaders,
    });
    expect(res.status).toBe(200);
  });
});
```

#### 3.2.2 报告状态管理测试

**集成测试 (`apps/server/tests/report-status.test.ts`)：**

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createTestApp, request } from './helpers';
import { v4 as uuid } from 'uuid';
import * as schema from '../src/db/schema';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let testReportId: string;

beforeAll(async () => {
  ctx = await createTestApp();
  // ... seed report with draft status
});

afterAll(() => {
  ctx.cleanup();
});

describe('Report Status Workflow', () => {
  test('草稿 → 待审核', async () => {
    const res = await request(ctx.app, 'PUT', `/reports/${testReportId}/status`, {
      headers: ctx.authHeaders,
      body: { status: 'pending_review' },
    });
    expect(res.status).toBe(200);
  });

  test('待审核 → 已审核（批准）', async () => {
    const res = await request(ctx.app, 'PUT', `/reports/${testReportId}/status`, {
      headers: ctx.authHeaders,
      body: { status: 'reviewed', reviewNotes: '审核通过' },
    });
    expect(res.status).toBe(200);
  });

  test('已审核 → 已发布', async () => {
    const res = await request(ctx.app, 'PUT', `/reports/${testReportId}/status`, {
      headers: ctx.authHeaders,
      body: { status: 'published' },
    });
    expect(res.status).toBe(200);
  });

  test('状态变更时自动创建版本', async () => {
    const res = await request(ctx.app, 'GET', `/reports/${testReportId}/versions`, {
      headers: ctx.authHeaders,
    });
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
  });
});
```

#### 3.2.3 报告版本控制测试

已在 `apps/server/tests/report-versions.test.ts` 中实现，包含：
- 版本列表查询
- 特定版本查询
- 版本对比 (diff)
- 版本号递增

#### 3.2.4 报告模板测试

**集成测试 (`apps/server/tests/report-templates.test.ts`)：**

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createTestApp, request } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(() => {
  ctx.cleanup();
});

describe('Report Templates', () => {
  test('POST /report-templates - 创建模板', async () => {
    const res = await request(ctx.app, 'POST', '/report-templates', {
      headers: ctx.authHeaders,
      body: {
        name: 'OCT报告模板',
        type: 'oct',
        fields: [
          { key: 'findings', label: '检查所见', type: 'textarea' },
          { key: 'diagnosis', label: '诊断', type: 'text' },
        ],
        layout: { columns: 1 },
        isSystem: false,
      },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe('OCT报告模板');
  });

  test('GET /report-templates - 获取模板列表', async () => {
    const res = await request(ctx.app, 'GET', '/report-templates', {
      headers: ctx.authHeaders,
    });
    expect(res.status).toBe(200);
  });

  test('系统模板不可删除', async () => {
    const createRes = await request(ctx.app, 'POST', '/report-templates', {
      headers: ctx.authHeaders,
      body: { name: '系统模板', type: 'oct', fields: [], layout: {}, isSystem: true },
    });
    const { data } = await createRes.json();

    const res = await request(ctx.app, 'DELETE', `/report-templates/${data.id}`, {
      headers: ctx.authHeaders,
    });
    expect(res.status).not.toBe(200);
  });
});
```

## 4. 功能合理性评估

### 4.1 ✅ 合理的设计

1. **模块化架构** - 图像编辑和报告管理分离清晰
2. **状态管理** - 使用Zustand，状态结构合理
3. **API设计** - RESTful风格，端点命名规范
4. **版本控制** - 报告版本自动创建，支持对比
5. **审核工作流** - 状态流转清晰，有审核记录
6. **图层系统** - 支持多种图层类型，有排序和可见性控制
7. **测量工具** - 覆盖常用测量需求
8. **滤镜系统** - 提供多种图像处理滤镜

### 4.2 ⚠️ 需要改进的地方

1. **前端-后端同步** - 编辑器状态（editorStore）与后端同步机制不完整
2. **错误处理** - 部分API调用缺少错误处理和用户提示
3. **性能优化** - 大图像处理、滤镜应用可能需要Web Worker
4. **用户体验** - 缺少操作反馈（加载状态、成功提示等）
5. **数据验证** - 前端表单验证不够完善
6. **权限控制** - 编辑、审核权限在前端未完全实现

## 5. 建议优先级

### P0（必须修复）
1. 标注持久化到后端
2. 图层与后端同步
3. 报告保存验证

### P1（高优先级）
1. 撤销/重做功能
2. 测量单位转换
3. 报告模板编辑器
4. PDF导出功能

### P2（中优先级）
1. 批量操作
2. 自定义滤镜预设
3. 报告搜索
4. 报告统计

### P3（低优先级）
1. 报告协作
2. 电子签名
3. 报告克隆
4. 高级导出格式

## 6. 测试环境配置

### 6.1 测试框架

本项目使用 **Bun 内置测试框架** (`bun:test`)，无需额外安装依赖。

- `describe` - 测试套件
- `test` - 测试用例
- `expect` - 断言
- `beforeAll` / `afterAll` - 生命周期钩子
- `beforeEach` / `afterEach` - 每个测试前后钩子

### 6.2 单元测试

- 框架：`bun:test`
- 运行命令：`bun test`
- 位置：`src/__tests__/*.test.ts` 或 `tests/*.test.ts`

### 6.3 集成测试（API）

- 框架：`bun:test` + Hono app.fetch()
- 数据库：内存 SQLite (`:memory:`)
- 辅助函数：`tests/helpers.ts` 中的 `createTestApp()` 和 `request()`
- 运行命令：`cd apps/server && bun test`

### 6.4 E2E测试

- 框架：Playwright
- 配置：`playwright.config.ts`
- 运行命令：`bunx playwright test`

## 7. 总结

### 功能完整性：85%

- 图像编辑功能基本完整，缺少撤销/重做和持久化
- 报告管理功能较为完整，缺少高级功能

### 测试覆盖建议

- 单元测试：工具函数、计算逻辑
- 集成测试：API端点、状态管理
- E2E测试：关键用户流程

### 改进建议

1. 完善前后端数据同步
2. 增加用户操作反馈
3. 优化大图像处理性能
4. 补充缺失的高级功能
