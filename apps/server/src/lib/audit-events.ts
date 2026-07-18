/**
 * Audit Event Types
 *
 * Defines all audit events for compliance tracking.
 * Used with the audit logging system to record user actions.
 */

export const AuditEvents = {
  // ─── Image Operations ─────────────────────────────────────────────────────
  IMAGE_VIEW: 'image.view',
  IMAGE_DOWNLOAD: 'image.download',
  IMAGE_EXPORT: 'image.export',
  IMAGE_PRINT: 'image.print',
  IMAGE_DELETE: 'image.delete',

  // ─── Annotation Operations ────────────────────────────────────────────────
  ANNOTATION_CREATE: 'annotation.create',
  ANNOTATION_MODIFY: 'annotation.modify',
  ANNOTATION_DELETE: 'annotation.delete',

  // ─── Measurement Operations ───────────────────────────────────────────────
  MEASUREMENT_CREATE: 'measurement.create',
  MEASUREMENT_MODIFY: 'measurement.modify',
  MEASUREMENT_DELETE: 'measurement.delete',

  // ─── Report Operations ────────────────────────────────────────────────────
  REPORT_CREATE: 'report.create',
  REPORT_EDIT: 'report.edit',
  REPORT_SUBMIT: 'report.submit',
  REPORT_APPROVE: 'report.approve',
  REPORT_REJECT: 'report.reject',
  REPORT_PUBLISH: 'report.publish',
  REPORT_PRINT: 'report.print',

  // ─── Data Operations ──────────────────────────────────────────────────────
  DATA_IMPORT: 'data.import',
  DATA_EXPORT: 'data.export',
  DATA_DELETE: 'data.delete',

  // ─── DICOM Operations ─────────────────────────────────────────────────────
  DICOM_CSTORE_RECEIVE: 'dicom.cstore.receive',
  DICOM_STOW_RECEIVE: 'dicom.stow.receive',
  DICOM_QUERY: 'dicom.query',

  // ─── User/Session Operations ──────────────────────────────────────────────
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_PASSWORD_CHANGE: 'user.password_change',
  USER_PROFILE_UPDATE: 'user.profile.update',

  // ─── System Operations ────────────────────────────────────────────────────
  SYSTEM_CONFIG_CHANGE: 'system.config_change',
  SYSTEM_BACKUP: 'system.backup',
  SYSTEM_RESTORE: 'system.restore',

  // ─── Worklist Operations ──────────────────────────────────────────────────
  WORKLIST_CREATE: 'worklist.create',
  WORKLIST_UPDATE: 'worklist.update',
  WORKLIST_DELETE: 'worklist.delete',

  // ─── Follow-up Operations ─────────────────────────────────────────────────
  FOLLOWUP_CREATE: 'followup.create',
  FOLLOWUP_UPDATE: 'followup.update',
} as const;

export type AuditEvent = typeof AuditEvents[keyof typeof AuditEvents];

/**
 * Human-readable labels for audit events (Chinese).
 */
export const AuditEventLabels: Record<string, string> = {
  [AuditEvents.IMAGE_VIEW]: '查看图像',
  [AuditEvents.IMAGE_DOWNLOAD]: '下载图像',
  [AuditEvents.IMAGE_EXPORT]: '导出图像',
  [AuditEvents.IMAGE_PRINT]: '打印图像',
  [AuditEvents.IMAGE_DELETE]: '删除图像',

  [AuditEvents.ANNOTATION_CREATE]: '创建标注',
  [AuditEvents.ANNOTATION_MODIFY]: '修改标注',
  [AuditEvents.ANNOTATION_DELETE]: '删除标注',

  [AuditEvents.MEASUREMENT_CREATE]: '创建测量',
  [AuditEvents.MEASUREMENT_MODIFY]: '修改测量',
  [AuditEvents.MEASUREMENT_DELETE]: '删除测量',

  [AuditEvents.REPORT_CREATE]: '创建报告',
  [AuditEvents.REPORT_EDIT]: '编辑报告',
  [AuditEvents.REPORT_SUBMIT]: '提交审核',
  [AuditEvents.REPORT_APPROVE]: '审批报告',
  [AuditEvents.REPORT_REJECT]: '驳回报告',
  [AuditEvents.REPORT_PUBLISH]: '发布报告',
  [AuditEvents.REPORT_PRINT]: '打印报告',

  [AuditEvents.DATA_IMPORT]: '数据导入',
  [AuditEvents.DATA_EXPORT]: '数据导出',
  [AuditEvents.DATA_DELETE]: '数据删除',

  [AuditEvents.DICOM_CSTORE_RECEIVE]: 'DICOM C-STORE 接收',
  [AuditEvents.DICOM_STOW_RECEIVE]: 'DICOMweb STOW-RS 接收',
  [AuditEvents.DICOM_QUERY]: 'DICOM 查询',

  [AuditEvents.USER_LOGIN]: '用户登录',
  [AuditEvents.USER_LOGOUT]: '用户登出',
  [AuditEvents.USER_PASSWORD_CHANGE]: '密码变更',
  [AuditEvents.USER_PROFILE_UPDATE]: '更新个人信息',

  [AuditEvents.SYSTEM_CONFIG_CHANGE]: '系统配置变更',
  [AuditEvents.SYSTEM_BACKUP]: '系统备份',
  [AuditEvents.SYSTEM_RESTORE]: '系统恢复',

  [AuditEvents.WORKLIST_CREATE]: '创建 Worklist',
  [AuditEvents.WORKLIST_UPDATE]: '更新 Worklist',
  [AuditEvents.WORKLIST_DELETE]: '删除 Worklist',

  [AuditEvents.FOLLOWUP_CREATE]: '创建随访记录',
  [AuditEvents.FOLLOWUP_UPDATE]: '更新随访记录',
};

/**
 * Resource type categories for audit filtering.
 */
export const ResourceTypes = {
  IMAGE: 'image',
  ANNOTATION: 'annotation',
  MEASUREMENT: 'measurement',
  REPORT: 'report',
  PATIENT: 'patient',
  STUDY: 'study',
  USER: 'user',
  SYSTEM: 'system',
  WORKLIST: 'worklist',
  FOLLOWUP: 'followup',
  DICOM: 'dicom',
} as const;

export type ResourceType = typeof ResourceTypes[keyof typeof ResourceTypes];
