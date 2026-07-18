# Issues #61-#68 实现计划

> 创建时间: 2026-03-08
> 状态: 待审批

## 概览

本计划覆盖 7 个 GitHub Issues 的实现方案，按依赖关系分为 4 个阶段执行。

| Issue | 标题 | 复杂度 | 阶段 |
|-------|------|--------|------|
| #68 | STOW-RS 健壮性 + DICOM 渲染验证 | ★★☆ | Phase 1 |
| #67 | 审计日志增强 | ★★☆ | Phase 1 |
| #64 | 图像上传完善 | ★★★ | Phase 2 |
| #62 | DICOM C-STORE SCP | ★★★★ | Phase 2 |
| #63 | DICOM Worklist (C-FIND SCP) | ★★★ | Phase 3 |
| #61 | 眼科专用报告模板 | ★★★ | Phase 3 |
| #65 | 随访对比功能 | ★★★★ | Phase 4 |

---

## 依赖关系图

```
#68 (STOW-RS fix) ──────────────────┐
                                     ├──→ #64 (图像上传)
#67 (审计日志) ──────────────────────┤
                                     │
#62 (C-STORE SCP) ──────→ #63 (Worklist)
                                     │
#61 (报告模板) ──────────────────────┤
                                     │
                                     ▼
                              #65 (随访对比)
```

- **#68** 是基础设施修复，影响所有 DICOM 上传路径
- **#67** 是横切关注点，各功能都需要审计日志
- **#62 → #63** 是严格的前后依赖
- **#65** 依赖多个前置功能（测量、报告、对比视图）

---

## Phase 1: 基础设施修复 (Week 1-2)

### Issue #68: STOW-RS multipart 解析健壮性 + DICOM 渲染验证

**目标**: 修复 STOW-RS 上传路径的边界情况，确保 DICOM 文件能在浏览器中正确渲染。

#### 任务分解

| # | 任务 | 文件 | 估时 |
|---|------|------|------|
| 1 | 引入 `parse-multipart-data` 替换手写 multipart 解析 | `apps/server/src/routes/dicomweb.ts` | 2h |
| 2 | 对 UID 做路径安全 sanitize | `apps/server/src/services/dicom/storage.ts` | 1h |
| 3 | 注册 DICOM 压缩格式 codec | `apps/web/src/lib/cornerstone/init.ts` | 2h |
| 4 | DICOM 缩略图生成 | `apps/server/src/services/dicom/storage.ts` | 3h |
| 5 | 浏览器端 DICOM 渲染 E2E 验证 | 手动测试 + 截图 | 2h |

#### 实现细节

**1. 替换 multipart 解析器**

```typescript
// apps/server/src/routes/dicomweb.ts
import parseMultipart from 'parse-multipart-data';

function extractDicomFromMultipart(body: Buffer, contentType: string): Buffer[] {
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
  if (!boundaryMatch) return [];
  
  const boundary = boundaryMatch[1].replace(/"/g, '');
  const parts = parseMultipart(body, boundary);
  
  return parts
    .filter(part => {
      const ct = part.headers?.['content-type'] || '';
      return ct.includes('application/dicom') || ct.includes('application/octet-stream');
    })
    .map(part => Buffer.from(part.data));
}
```

**2. UID 路径安全化**

```typescript
// apps/server/src/services/dicom/storage.ts
function sanitizeUid(uid: string): string {
  // DICOM UID 只允许数字和点号，但防御性地做 sanitize
  return uid.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function storeFile(studyUid: string, seriesUid: string, sopUid: string, buffer: Buffer) {
  const dir = join(DICOM_STORE_DIR, sanitizeUid(studyUid), sanitizeUid(seriesUid));
  await mkdir(dir, { recursive: true });
  // ...
}
```

**3. 注册 Cornerstone Codec**

```bash
bun add @cornerstonejs/codec-charls  # JPEG-LS
bun add @cornerstonejs/codec-libjpeg-turbo-8  # JPEG
bun add @cornerstonejs/codec-openjpeg  # JPEG2000
```

```typescript
// apps/web/src/lib/cornerstone/init.ts
import { init as csInit } from '@cornerstonejs/core';
import cornerstoneCharls from '@cornerstonejs/codec-charls';
import cornerstoneJpeg from '@cornerstonejs/codec-libjpeg-turbo-8';
import cornerstoneOpenjpeg from '@cornerstonejs/codec-openjpeg';

export async function initCornerstone(): Promise<void> {
  // Register codecs before core init
  cornerstoneCharls.init();
  cornerstoneJpeg.init();
  cornerstoneOpenjpeg.init();
  
  await csInit();
  // ...
}
```

**4. DICOM 缩略图生成**

```typescript
// apps/server/src/services/dicom/thumbnail.ts
import sharp from 'sharp';
import dcmjs from 'dcmjs';

export async function generateDicomThumbnail(dicomBuffer: Buffer, outputPath: string): Promise<void> {
  // 解码 DICOM 像素数据
  const dataset = dcmjs.data.DicomMessage.readFile(dicomBuffer.buffer);
  const meta = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dataset.dict);
  
  // 提取像素数据（简化版，仅处理未压缩 MONOCHROME2）
  const pixelData = Buffer.from(meta.PixelData?.[0] || meta['7FE00010']?.InlineBinary || '');
  const rows = meta.Rows;
  const columns = meta.Columns;
  
  if (!pixelData.length || !rows || !columns) return;
  
  // 使用 Sharp 生成缩略图
  await sharp(pixelData, { raw: { width: columns, height: rows, channels: 1 } })
    .resize(128, 128, { fit: 'inside' })
    .jpeg({ quality: 80 })
    .toFile(outputPath);
}
```

**验收标准检查**:
- [ ] STOW-RS multipart 解析使用标准库，处理所有 boundary 格式
- [ ] 浏览器中能正确渲染上传的 DICOM 图像
- [ ] 窗宽窗位从 DICOM 元数据自动读取
- [ ] 缩略图对 DICOM 图像可用
- [ ] 压缩格式 codec 显式注册

---

### Issue #67: 审计日志增强

**目标**: 扩展审计事件覆盖范围，增强查询能力，确保合规性。

#### 任务分解

| # | 任务 | 文件 | 估时 |
|---|------|------|------|
| 1 | 扩展 audit middleware 覆盖更多事件 | `apps/server/src/middleware/audit.ts` | 3h |
| 2 | 在关键业务操作中插入细粒度审计 | 各 route/service 文件 | 4h |
| 3 | 增强审计日志查询 API（时间范围、用户、关键词） | `apps/server/src/routes/audit-logs.ts` | 2h |
| 4 | 前端审计日志查询界面 | `apps/web/src/pages/AuditLogsPage.tsx` | 4h |
| 5 | 审计日志保留策略配置 | `apps/server/src/db/schema.ts` + settings | 2h |

#### 实现细节

**1. 审计事件类型枚举**

```typescript
// apps/server/src/lib/audit-events.ts
export const AuditEvents = {
  // 图像操作
  IMAGE_VIEW: 'image.view',
  IMAGE_DOWNLOAD: 'image.download',
  IMAGE_EXPORT: 'image.export',
  
  // 标注操作
  ANNOTATION_CREATE: 'annotation.create',
  ANNOTATION_MODIFY: 'annotation.modify',
  ANNOTATION_DELETE: 'annotation.delete',
  
  // 报告操作
  REPORT_CREATE: 'report.create',
  REPORT_EDIT: 'report.edit',
  REPORT_SUBMIT: 'report.submit',
  REPORT_APPROVE: 'report.approve',
  REPORT_REJECT: 'report.reject',
  REPORT_PUBLISH: 'report.publish',
  
  // 数据操作
  DATA_IMPORT: 'data.import',
  DATA_EXPORT: 'data.export',
  DATA_DELETE: 'data.delete',
  
  // 系统操作
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_PASSWORD_CHANGE: 'user.password_change',
  SYSTEM_CONFIG_CHANGE: 'system.config_change',
} as const;
```

**2. 细粒度审计插入示例**

```typescript
// apps/server/src/routes/reports.ts
import { log } from '../lib/audit';
import { AuditEvents } from '../lib/audit-events';

// PUT /:id/status
router.put('/:id/status', async (c) => {
  const { status, reviewNotes } = await c.req.json();
  const userId = c.get('userId');
  
  // ... 更新逻辑 ...
  
  // 细粒度审计
  const eventName = {
    'pending_review': AuditEvents.REPORT_SUBMIT,
    'reviewed': AuditEvents.REPORT_APPROVE,
    'published': AuditEvents.REPORT_PUBLISH,
  }[status] || AuditEvents.REPORT_EDIT;
  
  log({
    userId,
    action: eventName,
    resource: 'report',
    resourceId: id,
    details: { 
      oldStatus: report.status, 
      newStatus: status,
      reviewNotes,
    },
    ipAddress: c.req.header('X-Forwarded-For'),
  });
});
```

**3. 查询 API 增强**

```typescript
// apps/server/src/routes/audit-logs.ts
auditLogsRouter.get('/', async (c) => {
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const userId = c.req.query('userId');
  const keyword = c.req.query('keyword');
  
  // 构建查询条件
  const conditions = [];
  if (startDate) conditions.push(gte(auditLogs.createdAt, startDate));
  if (endDate) conditions.push(lte(auditLogs.createdAt, endDate));
  if (userId) conditions.push(eq(auditLogs.userId, userId));
  // keyword 搜索 details JSON
  // ...
});
```

**验收标准检查**:
- [ ] 所有关键操作都有审计日志
- [ ] 审计日志包含完整的操作上下文
- [ ] 审计日志查询界面可用
- [ ] 支持多维度筛选和搜索
- [ ] 审计日志可导出为 CSV
- [ ] 审计日志不可删除（只追加）
- [ ] 日志保留期限可配置

---

## Phase 2: 核心功能完善 (Week 3-5)

### Issue #64: 图像上传完善

**目标**: 完善拖拽上传、批量上传、DICOMDIR 解析和进度显示。

#### 任务分解

| # | 任务 | 文件 | 估时 |
|---|------|------|------|
| 1 | 重构 ImageUpload 组件支持文件夹 | `apps/web/src/components/upload/ImageUpload.tsx` | 4h |
| 2 | 实现文件类型自动识别路由 | `apps/web/src/components/upload/` | 2h |
| 3 | DICOMDIR 解析器 | `packages/dicom/src/dicomdir.ts` | 4h |
| 4 | 上传进度聚合显示 | `apps/web/src/components/upload/UploadProgress.tsx` | 3h |
| 5 | 上传后关联/创建检查 UI | `apps/web/src/components/upload/UploadAssociation.tsx` | 3h |
| 6 | 患者详情页"新建检查"入口 | `apps/web/src/pages/PatientDetailPage.tsx` | 1h |

#### 实现细节

**1. 文件夹上传支持**

```typescript
// apps/web/src/components/upload/ImageUpload.tsx
const handleDrop = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(false);
  
  const items = Array.from(e.dataTransfer.items);
  const filePromises = items.map(item => {
    if (item.webkitGetAsEntry) {
      const entry = item.webkitGetAsEntry();
      if (entry?.isDirectory) {
        return readDirectory(entry as FileSystemDirectoryEntry);
      }
    }
    return Promise.resolve([item.getAsFile()].filter(Boolean));
  });
  
  Promise.all(filePromises).then(fileArrays => {
    const allFiles = fileArrays.flat().filter(Boolean) as File[];
    addFiles(allFiles);
  });
}, []);

async function readDirectory(entry: FileSystemDirectoryEntry): Promise<File[]> {
  const reader = entry.createReader();
  const files: File[] = [];
  
  const readBatch = (): Promise<void> => new Promise((resolve) => {
    reader.readEntries((entries) => {
      const promises = entries.map(async (e) => {
        if (e.isFile) {
          const file = await new Promise<File>((res) => (e as FileSystemFileEntry).file(res));
          files.push(file);
        } else if (e.isDirectory) {
          await readDirectory(e as FileSystemDirectoryEntry).then(f => files.push(...f));
        }
      });
      Promise.all(promises).then(() => resolve());
    });
  });
  
  await readBatch();
  return files;
}
```

**2. DICOMDIR 解析**

```typescript
// packages/dicom/src/dicomdir.ts
import dcmjs from 'dcmjs';

interface DicomdirEntry {
  type: 'PATIENT' | 'STUDY' | 'SERIES' | 'IMAGE';
  name: string;
  path: string;
  children: DicomdirEntry[];
}

export function parseDicomdir(buffer: Buffer): DicomdirEntry[] {
  const dataset = dcmjs.data.DicomMessage.readFile(buffer.buffer);
  const meta = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dataset.dict);
  
  // DICOMDIR 使用 Directory Record Sequence (0004,1220)
  const records = meta.DirectoryRecordSequence || [];
  
  // 构建树结构
  return buildTree(records);
}
```

**3. 上传进度聚合**

```typescript
// apps/web/src/components/upload/UploadProgress.tsx
interface UploadProgressProps {
  files: UploadFile[];
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
}

export function UploadProgress({ files, onRetry, onCancel }: UploadProgressProps) {
  const stats = useMemo(() => ({
    total: files.length,
    completed: files.filter(f => f.status === 'success').length,
    failed: files.filter(f => f.status === 'error').length,
    uploading: files.filter(f => f.status === 'uploading').length,
    pending: files.filter(f => f.status === 'pending').length,
  }), [files]);
  
  const overallProgress = stats.total > 0 
    ? Math.round((stats.completed / stats.total) * 100) 
    : 0;
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between text-sm">
        <span>{stats.completed}/{stats.total} 完成</span>
        <span>{overallProgress}%</span>
      </div>
      <Progress value={overallProgress} />
      <div className="max-h-60 overflow-auto space-y-2">
        {files.map(file => (
          <UploadFileItem key={file.id} file={file} onRetry={onRetry} onCancel={onCancel} />
        ))}
      </div>
    </div>
  );
}
```

**验收标准检查**:
- [ ] 支持拖拽上传 DICOM/JPG/PNG 图像
- [ ] 支持批量上传并显示进度条
- [ ] 支持文件夹选择上传
- [ ] DICOMDIR 解析正确
- [ ] 上传后可选择关联到已有检查或创建新检查
- [ ] 上传失败显示错误信息并支持重试
- [ ] 患者详情页有"新建检查"入口

---

### Issue #62: DICOM C-STORE SCP

**目标**: 实现 DICOM 网络协议层，接收设备推送的 DICOM 图像。

#### 任务分解

| # | 任务 | 文件 | 估时 |
|---|------|------|------|
| 1 | PDU 解析器 | `apps/server/src/dicom/ulp/pdu.ts` | 6h |
| 2 | Association 状态机 | `apps/server/src/dicom/ulp/association.ts` | 6h |
| 3 | C-STORE SCP 服务 | `apps/server/src/dicom/services/cstore.ts` | 4h |
| 4 | C-ECHO SCP 服务 | `apps/server/src/dicom/services/cecho.ts` | 2h |
| 5 | DICOM SCP 服务器入口 | `apps/server/src/dicom/server.ts` | 3h |
| 6 | DICOM 配置管理 | `apps/server/src/dicom/config.ts` | 2h |
| 7 | 连接日志 | `apps/server/src/dicom/logging.ts` | 2h |

#### 实现细节

**1. PDU 解析器**

```typescript
// apps/server/src/dicom/ulp/pdu.ts
export enum PduType {
  ASSOCIATE_RQ = 0x01,
  ASSOCIATE_AC = 0x02,
  ASSOCIATE_RJ = 0x03,
  P_DATA_TF = 0x04,
  RELEASE_RQ = 0x05,
  RELEASE_RP = 0x06,
  ABORT = 0x07,
}

export interface PduHeader {
  type: PduType;
  length: number;
}

export interface AssociateRq {
  calledAeTitle: string;
  callingAeTitle: string;
  applicationContext: string;
  presentationContexts: PresentationContext[];
  userInfo: UserInformation;
}

export function parsePduHeader(buffer: Buffer, offset: number): PduHeader {
  return {
    type: buffer[offset],
    length: buffer.readUInt32BE(offset + 2),
  };
}

export function parseAssociateRq(buffer: Buffer, offset: number): AssociateRq {
  // 解析 A-ASSOCIATE-RQ PDU
  // DICOM PS3.8 Section 9.3.2
  const calledAeTitle = buffer.subarray(offset + 4, offset + 20).toString('ascii').trim();
  const callingAeTitle = buffer.subarray(offset + 20, offset + 36).toString('ascii').trim();
  // ... 解析 Presentation Context Items
  // ... 解析 User Information Items
  return { calledAeTitle, callingAeTitle, /* ... */ };
}
```

**2. Association 状态机**

```typescript
// apps/server/src/dicom/ulp/association.ts
export enum AssociationState {
  IDLE = 'IDLE',
  ASSOCIATION_ESTABLISHED = 'ASSOCIATION_ESTABLISHED',
  AWAITING_RELEASE = 'AWAITING_RELEASE',
  TIMED_OUT = 'TIMED_OUT',
}

export class Association {
  private state: AssociationState = AssociationState.IDLE;
  private socket: Socket;
  private presentationContexts: Map<number, PresentationContext> = new Map();
  
  constructor(socket: Socket) {
    this.socket = socket;
  }
  
  async handleData(data: Buffer): Promise<void> {
    const pdu = parsePduHeader(data, 0);
    
    switch (pdu.type) {
      case PduType.ASSOCIATE_RQ:
        await this.handleAssociateRequest(data);
        break;
      case PduType.P_DATA_TF:
        await this.handleDataTransfer(data);
        break;
      case PduType.RELEASE_RQ:
        await this.handleReleaseRequest();
        break;
      case PduType.ABORT:
        this.handleAbort();
        break;
    }
  }
  
  private async handleAssociateRequest(data: Buffer): Promise<void> {
    const request = parseAssociateRq(data, 0);
    
    // 验证 AE Title
    if (!this.isAllowedAeTitle(request.calledAeTitle)) {
      this.sendAssociateRj('permanent', 'no-reason-given');
      return;
    }
    
    // 协商传输语法
    this.negotiatePresentationContexts(request.presentationContexts);
    
    // 发送 A-ASSOCIATE-AC
    this.sendAssociateAc();
    this.state = AssociationState.ASSOCIATION_ESTABLISHED;
  }
}
```

**3. C-STORE SCP**

```typescript
// apps/server/src/dicom/services/cstore.ts
import { parseDicomFile, storeDicomFile } from '../../services/dicom';
import { log } from '../../lib/audit';

export async function handleCStore(
  association: Association,
  presentationContextId: number,
  message: Buffer
): Promise<void> {
  try {
    // 解析 DICOM 文件
    const parseResult = await parseDicomFile(message);
    
    // 存储文件并入库
    const result = await storeDicomFile(parseResult);
    
    // 审计日志
    log({
      userId: 'system',
      action: 'dicom.cstore.receive',
      resource: 'image',
      resourceId: result.imageId,
      details: {
        sopInstanceUid: result.sopInstanceUid,
        studyId: result.studyId,
        seriesId: result.seriesId,
        isNew: result.isNew,
      },
    });
    
    // 发送 C-STORE-RSP (Success)
    association.sendCStoreResponse(presentationContextId, 0x0000);
  } catch (error) {
    // 发送 C-STORE-RSP (Failure)
    association.sendCStoreResponse(presentationContextId, 0xA700);
    throw error;
  }
}
```

**4. DICOM SCP 服务器入口**

```typescript
// apps/server/src/dicom/server.ts
import { createServer, Socket } from 'net';
import { Association } from './ulp/association';
import { getConfig } from './config';

export class DicomServer {
  private server: ReturnType<typeof createServer>;
  private connections: Map<string, Association> = new Map();
  
  async start(): Promise<void> {
    const config = getConfig();
    
    this.server = createServer((socket: Socket) => {
      const connectionId = `${socket.remoteAddress}:${socket.remotePort}`;
      console.log(`[DICOM] New connection from ${connectionId}`);
      
      const association = new Association(socket);
      this.connections.set(connectionId, association);
      
      socket.on('data', (data) => {
        association.handleData(data).catch(err => {
          console.error(`[DICOM] Error handling data:`, err);
          socket.destroy();
        });
      });
      
      socket.on('close', () => {
        this.connections.delete(connectionId);
        console.log(`[DICOM] Connection closed: ${connectionId}`);
      });
      
      socket.on('error', (err) => {
        console.error(`[DICOM] Socket error:`, err);
        this.connections.delete(connectionId);
      });
    });
    
    this.server.listen(config.port, () => {
      console.log(`[DICOM] SCP server listening on port ${config.port}`);
    });
  }
  
  async stop(): Promise<void> {
    this.server?.close();
  }
}
```

**验收标准检查**:
- [ ] TCP 服务器监听 DICOM 端口（默认 11112）
- [ ] 能接收 A-ASSOCIATE 握手
- [ ] 能接收 C-STORE 请求并存储 DICOM 文件
- [ ] 接收的文件正确解析入库（Patient/Study/Series/Image）
- [ ] 支持 Implicit VR 和 Explicit VR 传输语法
- [ ] 连接日志记录完整
- [ ] 并发连接处理（至少 5 个同时连接）

---

## Phase 3: 业务功能扩展 (Week 6-8)

### Issue #63: DICOM Worklist (C-FIND SCP)

**目标**: 实现 DICOM Worklist，使设备能查询待检查患者列表。

**前置依赖**: #62 (C-STORE SCP)

#### 任务分解

| # | 任务 | 文件 | 估时 |
|---|------|------|------|
| 1 | Worklist 数据表 | `apps/server/src/db/schema.ts` | 1h |
| 2 | Worklist CRUD API | `apps/server/src/routes/worklist.ts` | 3h |
| 3 | C-FIND SCP 实现 | `apps/server/src/dicom/services/cfind.ts` | 4h |
| 4 | 查询匹配逻辑 | `apps/server/src/dicom/services/worklist-query.ts` | 3h |
| 5 | 前端 Worklist 管理界面 | `apps/web/src/pages/WorklistPage.tsx` | 4h |

#### 实现细节

**1. Worklist 数据表**

```typescript
// apps/server/src/db/schema.ts
export const worklistItems = sqliteTable('worklist_items', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').references(() => patients.id),
  patientName: text('patient_name').notNull(),
  patientBirthDate: text('patient_birth_date'),
  patientSex: text('patient_sex'),
  accessionNumber: text('accession_number').notNull(),
  scheduledProcedureStepId: text('scheduled_procedure_step_id'),
  modality: text('modality').notNull(),
  scheduledStationName: text('scheduled_station_name'),
  scheduledProcedureStepStartDate: text('scheduled_procedure_step_start_date').notNull(),
  scheduledProcedureStepStartTime: text('scheduled_procedure_step_start_time'),
  requestedProcedureDescription: text('requested_procedure_description'),
  referringPhysicianName: text('referring_physician_name'),
  status: text('status', { enum: ['scheduled', 'in_progress', 'completed', 'cancelled'] }).default('scheduled').notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
}, (table) => [
  index('worklist_date_idx').on(table.scheduledProcedureStepStartDate),
  index('worklist_modality_idx').on(table.modality),
  index('worklist_status_idx').on(table.status),
]);
```

**2. C-FIND SCP**

```typescript
// apps/server/src/dicom/services/cfind.ts
import { db, worklistItems } from '../../db';
import { eq, and, gte, lte, like } from 'drizzle-orm';

export async function handleCFind(
  association: Association,
  presentationContextId: number,
  queryDataset: Record<string, any>
): Promise<void> {
  // 提取查询条件
  const conditions = [];
  
  if (queryDataset['00080020']) { // StudyDate
    const dateRange = queryDataset['00080020'].Value?.[0];
    if (dateRange) {
      if (dateRange.includes('-')) {
        const [start, end] = dateRange.split('-');
        if (start) conditions.push(gte(worklistItems.scheduledProcedureStepStartDate, start));
        if (end) conditions.push(lte(worklistItems.scheduledProcedureStepStartDate, end));
      } else {
        conditions.push(eq(worklistItems.scheduledProcedureStepStartDate, dateRange));
      }
    }
  }
  
  if (queryDataset['00080060']) { // Modality
    conditions.push(eq(worklistItems.modality, queryDataset['00080060'].Value?.[0]));
  }
  
  // 查询数据库
  const results = await db.query.worklistItems.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
  });
  
  // 逐条返回结果
  for (const item of results) {
    association.sendCFindResponse(presentationContextId, {
      '00100010': { vr: 'PN', Value: [{ Alphabetic: item.patientName }] },
      '00100020': { vr: 'LO', Value: [item.patientId] },
      '00080050': { vr: 'SH', Value: [item.accessionNumber] },
      '00080060': { vr: 'CS', Value: [item.modality] },
      '00400100': { vr: 'SQ', Value: [{
        '00400001': { vr: 'SH', Value: [item.scheduledStationName] },
        '00400002': { vr: 'DA', Value: [item.scheduledProcedureStepStartDate] },
        '00400003': { vr: 'TM', Value: [item.scheduledProcedureStepStartTime] },
      }]},
    }, false); // false = not final
  }
  
  // 发送最终响应
  association.sendCFindResponse(presentationContextId, null, true);
}
```

**验收标准检查**:
- [ ] 能响应设备的 C-FIND 查询请求
- [ ] 查询条件匹配正确（日期、模态、患者ID）
- [ ] 返回的 Worklist 条目格式符合 DICOM 标准
- [ ] Worklist 管理 API 可用
- [ ] 查询日志记录完整
- [ ] 支持 Modality Worklist (MWM) 标准

---

### Issue #61: 眼科专用报告模板

**目标**: 实现 7 种眼科专用报告模板，支持测量数据自动填充。

#### 任务分解

| # | 任务 | 文件 | 估时 |
|---|------|------|------|
| 1 | 扩展 reportTemplates fields 结构 | `apps/server/src/db/seed.ts` | 3h |
| 2 | 报告模板渲染组件 | `apps/web/src/components/report/TemplateRenderer.tsx` | 6h |
| 3 | 测量数据自动填充 Hook | `apps/web/src/hooks/useReportAutofill.ts` | 3h |
| 4 | 图像截图插入功能 | `apps/web/src/components/report/ImageInsert.tsx` | 3h |
| 5 | PDF 导出功能 | `apps/web/src/components/report/PdfExport.tsx` | 4h |

#### 实现细节

**1. 扩展模板字段结构**

```typescript
// apps/server/src/db/seed.ts - OCT 模板增强
{
  id: templateIds.oct,
  name: 'OCT 检查报告',
  type: 'oct',
  description: '光学相干断层扫描标准报告模板',
  fields: [
    // 基本信息
    { key: 'eye', label: '眼别', type: 'select', options: ['OD', 'OS', 'OU'], required: true, section: '基本信息' },
    { key: 'device', label: '设备', type: 'text', section: '基本信息' },
    
    // 视网膜厚度分析
    { key: 'centralThickness', label: '中心凹厚度', type: 'measurement', unit: 'μm', 
      normalRange: [215, 275], autoFill: 'oct.centralThickness', section: '视网膜厚度分析' },
    { key: 'averageThickness', label: '平均厚度', type: 'measurement', unit: 'μm', 
      autoFill: 'oct.averageThickness', section: '视网膜厚度分析' },
    { key: 'etdrsMap', label: 'ETDRS 9 区厚度图', type: 'image', section: '视网膜厚度分析' },
    
    // RNFL 厚度分析
    { key: 'rnflAverage', label: '平均 RNFL', type: 'measurement', unit: 'μm',
      normalRange: [80, 120], autoFill: 'oct.rnflAverage', section: 'RNFL 厚度分析' },
    { key: 'rnflSuperior', label: '上方 RNFL', type: 'measurement', unit: 'μm', section: 'RNFL 厚度分析' },
    { key: 'rnflInferior', label: '下方 RNFL', type: 'measurement', unit: 'μm', section: 'RNFL 厚度分析' },
    { key: 'rnflNasal', label: '鼻侧 RNFL', type: 'measurement', unit: 'μm', section: 'RNFL 厚度分析' },
    { key: 'rnflTemporal', label: '颞侧 RNFL', type: 'measurement', unit: 'μm', section: 'RNFL 厚度分析' },
    { key: 'rnflMap', label: 'RNFL 厚度图', type: 'image', section: 'RNFL 厚度分析' },
    
    // 关键切面
    { key: 'bscanImages', label: 'B-scan 切面', type: 'image[]', section: '关键切面' },
    
    // 诊断
    { key: 'findings', label: '所见', type: 'textarea', required: true, section: '诊断建议' },
    { key: 'impression', label: '印象', type: 'textarea', required: true, section: '诊断建议' },
  ],
  layout: { 
    columns: 2, 
    sections: ['基本信息', '视网膜厚度分析', 'RNFL 厚度分析', '关键切面', '诊断建议'] 
  },
}
```

**2. 报告模板渲染组件**

```typescript
// apps/web/src/components/report/TemplateRenderer.tsx
interface TemplateRendererProps {
  template: ReportTemplate;
  studyId: string;
  initialValues?: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
}

export function TemplateRenderer({ template, studyId, initialValues, onChange }: TemplateRendererProps) {
  const { autofillData } = useReportAutofill(studyId, template.type);
  
  const sections = useMemo(() => {
    const grouped: Record<string, FieldDefinition[]> = {};
    template.fields.forEach(field => {
      const section = field.section || '默认';
      if (!grouped[section]) grouped[section] = [];
      grouped[section].push(field);
    });
    return grouped;
  }, [template.fields]);
  
  return (
    <div className="space-y-6">
      {template.layout.sections.map(sectionName => (
        <Card key={sectionName}>
          <CardHeader>
            <CardTitle>{sectionName}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`grid grid-cols-${template.layout.columns} gap-4`}>
              {sections[sectionName]?.map(field => (
                <FieldRenderer
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  autoValue={autofillData[field.autoFill]}
                  onChange={(v) => handleChange(field.key, v)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

**3. 测量数据自动填充**

```typescript
// apps/web/src/hooks/useReportAutofill.ts
export function useReportAutofill(studyId: string, templateType: string) {
  const [autofillData, setAutofillData] = useState<Record<string, any>>({});
  
  useEffect(() => {
    async function fetchMeasurements() {
      // 获取该检查的所有测量数据
      const annotations = await annotationApi.list({ studyId });
      const measurements = annotations.filter(a => a.type === 'measurement');
      
      // 根据模板类型提取相关测量
      const extracted = extractMeasurements(measurements, templateType);
      setAutofillData(extracted);
    }
    
    fetchMeasurements();
  }, [studyId, templateType]);
  
  return { autofillData };
}

function extractMeasurements(measurements: Annotation[], type: string): Record<string, any> {
  const result: Record<string, any> = {};
  
  measurements.forEach(m => {
    const geometry = m.geometry as any;
    if (type === 'oct') {
      if (m.label?.includes('中心凹厚度')) {
        result['oct.centralThickness'] = geometry.value;
      }
      if (m.label?.includes('RNFL')) {
        result['oct.rnflAverage'] = geometry.value;
      }
    }
    // ... 其他模板类型
  });
  
  return result;
}
```

**验收标准检查**:
- [ ] 7 种眼科报告模板预置可用
- [ ] 报告模板可自定义编辑
- [ ] 测量数据自动填充到报告
- [ ] 支持插入图像截图
- [ ] 报告可导出为 PDF
- [ ] 报告版本管理（已有功能扩展）
- [ ] 报告审核工作流（已有功能扩展）

---

## Phase 4: 高级功能 (Week 9-12)

### Issue #65: 随访对比功能

**目标**: 实现同一患者不同时间点的检查数据纵向对比分析。

**前置依赖**: #61 (报告模板), #64 (图像上传)

#### 任务分解

| # | 任务 | 文件 | 估时 |
|---|------|------|------|
| 1 | followUpRecords 数据表 | `apps/server/src/db/schema.ts` | 2h |
| 2 | 随访对比 API | `apps/server/src/routes/follow-up.ts` | 4h |
| 3 | 测量数据提取与对比逻辑 | `apps/server/src/services/follow-up.ts` | 4h |
| 4 | 趋势图组件 | `apps/web/src/components/followup/TrendChart.tsx` | 6h |
| 5 | 随访对比视图 | `apps/web/src/components/followup/FollowUpComparison.tsx` | 6h |
| 6 | 随访报告生成 | `apps/web/src/components/followup/FollowUpReport.tsx` | 4h |

#### 实现细节

**1. 数据表**

```typescript
// apps/server/src/db/schema.ts
export const followUpRecords = sqliteTable('follow_up_records', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').references(() => patients.id).notNull(),
  baselineStudyId: text('baseline_study_id').references(() => studies.id).notNull(),
  comparisonStudyId: text('comparison_study_id').references(() => studies.id).notNull(),
  measurements: text('measurements', { mode: 'json' }).notNull().default([]),
  notes: text('notes'),
  createdBy: text('created_by').references(() => users.id).notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
}, (table) => [
  index('followup_patient_idx').on(table.patientId),
  index('followup_baseline_idx').on(table.baselineStudyId),
  index('followup_comparison_idx').on(table.comparisonStudyId),
]);
```

**2. 测量对比逻辑**

```typescript
// apps/server/src/services/follow-up.ts
interface MeasurementComparison {
  type: string;
  label: string;
  baselineValue: number;
  comparisonValue: number;
  delta: number;
  deltaPercent: number;
  unit: string;
  trend: 'improving' | 'stable' | 'worsening';
  isSignificant: boolean;
}

export async function compareMeasurements(
  baselineStudyId: string,
  comparisonStudyId: string
): Promise<MeasurementComparison[]> {
  // 获取两次检查的测量数据
  const baselineAnnotations = await getMeasurements(baselineStudyId);
  const comparisonAnnotations = await getMeasurements(comparisonStudyId);
  
  // 按测量类型匹配
  const comparisons: MeasurementComparison[] = [];
  
  for (const baseline of baselineAnnotations) {
    const matching = comparisonAnnotations.find(a => a.label === baseline.label);
    if (!matching) continue;
    
    const baselineValue = baseline.geometry.value;
    const comparisonValue = matching.geometry.value;
    const delta = comparisonValue - baselineValue;
    const deltaPercent = (delta / baselineValue) * 100;
    
    // 判断趋势（根据测量类型）
    const trend = determineTrend(baseline.label, delta, deltaPercent);
    
    // 判断是否显著变化
    const isSignificant = Math.abs(deltaPercent) > getSignificanceThreshold(baseline.label);
    
    comparisons.push({
      type: baseline.measurementType || baseline.label,
      label: baseline.label,
      baselineValue,
      comparisonValue,
      delta,
      deltaPercent,
      unit: baseline.geometry.unit || 'μm',
      trend,
      isSignificant,
    });
  }
  
  return comparisons;
}

function determineTrend(label: string, delta: number, deltaPercent: number): 'improving' | 'stable' | 'worsening' {
  // 对于厚度测量，减少通常是恶化的信号（如 RNFL 变薄）
  // 对于眼压，降低通常是改善
  const threshold = 5; // 5% 变化阈值
  
  if (Math.abs(deltaPercent) < threshold) return 'stable';
  
  // 特定测量的趋势判断逻辑
  if (label.includes('RNFL') || label.includes('厚度')) {
    return delta < 0 ? 'worsening' : 'improving';
  }
  if (label.includes('眼压') || label.includes('IOP')) {
    return delta < 0 ? 'improving' : 'worsening';
  }
  
  return delta > 0 ? 'improving' : 'worsening';
}
```

**3. 趋势图组件**

```typescript
// apps/web/src/components/followup/TrendChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';

interface TrendChartProps {
  data: Array<{
    date: string;
    value: number;
    isBaseline?: boolean;
  }>;
  label: string;
  unit: string;
  normalRange?: [number, number];
  significantThreshold?: number;
}

export function TrendChart({ data, label, unit, normalRange, significantThreshold }: TrendChartProps) {
  return (
    <div className="w-full h-64">
      <h4 className="text-sm font-medium mb-2">{label} ({unit})</h4>
      <LineChart width={600} height={200} data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        
        {/* 正常范围 */}
        {normalRange && (
          <>
            <ReferenceLine y={normalRange[0]} stroke="green" strokeDasharray="3 3" />
            <ReferenceLine y={normalRange[1]} stroke="green" strokeDasharray="3 3" />
          </>
        )}
        
        {/* 数据线 */}
        <Line 
          type="monotone" 
          dataKey="value" 
          stroke="#8884d8" 
          strokeWidth={2}
          dot={{ r: 4 }}
        />
      </LineChart>
    </div>
  );
}
```

**验收标准检查**:
- [ ] 支持选择基线和对比检查
- [ ] 测量数据自动对比并显示变化
- [ ] 趋势图正确渲染
- [ ] 自动判断趋势（改善/稳定/恶化）
- [ ] 随访记录可保存到后端
- [ ] 支持多次随访的纵向分析
- [ ] 随访报告可导出为 PDF

---

## 实施建议

### 代码组织

```
apps/server/src/
├── dicom/                  # DICOM 网络协议（#62, #63）
│   ├── ulp/               # Upper Layer Protocol
│   │   ├── pdu.ts
│   │   └── association.ts
│   ├── services/          # DIMSE 服务
│   │   ├── cstore.ts
│   │   ├── cfind.ts
│   │   └── cecho.ts
│   ├── server.ts
│   └── config.ts
├── routes/
│   ├── worklist.ts        # Worklist API（#63）
│   └── follow-up.ts       # 随访 API（#65）
└── services/
    └── follow-up.ts       # 随访业务逻辑（#65）

apps/web/src/
├── components/
│   ├── upload/            # 上传组件（#64）
│   │   ├── ImageUpload.tsx
│   │   ├── UploadProgress.tsx
│   │   └── UploadAssociation.tsx
│   ├── report/            # 报告组件（#61）
│   │   ├── TemplateRenderer.tsx
│   │   ├── FieldRenderer.tsx
│   │   ├── ImageInsert.tsx
│   │   └── PdfExport.tsx
│   └── followup/          # 随访组件（#65）
│       ├── TrendChart.tsx
│       ├── FollowUpComparison.tsx
│       └── FollowUpReport.tsx
└── pages/
    ├── WorklistPage.tsx   # Worklist 管理（#63）
    └── AuditLogsPage.tsx  # 审计日志（#67）
```

### 测试策略

| Issue | 单元测试 | 集成测试 | E2E 测试 |
|-------|---------|---------|---------|
| #68 | multipart 解析 | STOW-RS 上传 | 浏览器渲染 |
| #67 | 审计事件记录 | API 查询 | 审计日志页面 |
| #64 | DICOMDIR 解析 | 上传流程 | 拖拽上传 |
| #62 | PDU 解析 | C-STORE 流程 | 设备对接 |
| #63 | 查询匹配 | C-FIND 流程 | Worklist 页面 |
| #61 | 字段渲染 | 模板保存 | 报告编辑 |
| #65 | 趋势计算 | 对比 API | 随访视图 |

### 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| DICOM ULP 实现复杂度 | #62 延期 | 参考 dcm4che 开源实现 |
| Cornerstone codec 兼容性 | #68 渲染失败 | 准备 fallback 到后端转码 |
| 测量数据格式不统一 | #65 对比失败 | 定义统一的测量数据 schema |
| 设备厂商协议变体 | #62/#63 对接困难 | 保留协议调试日志 |

---

## 总结

| 阶段 | Issues | 估时 | 交付物 |
|------|--------|------|--------|
| Phase 1 | #68, #67 | 2 周 | 稳定的 DICOM 上传 + 完整审计日志 |
| Phase 2 | #64, #62 | 3 周 | 完善的上传体验 + DICOM 网络接收 |
| Phase 3 | #63, #61 | 3 周 | Worklist 查询 + 专业报告模板 |
| Phase 4 | #65 | 3 周 | 随访对比功能 |
| **总计** | 7 issues | **~11 周** | 完整的眼科 PACS 系统 |

建议按照上述阶段顺序执行，每个阶段完成后进行验收测试，确保质量后再进入下一阶段。
