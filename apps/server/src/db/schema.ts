import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  avatar: text('avatar'),
  roleId: text('role_id').references(() => roles.id),
  status: text('status', { enum: ['active', 'disabled', 'locked'] }).default('active').notNull(),
  lastLoginAt: text('last_login_at'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

// Roles table
export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  permissions: text('permissions', { mode: 'json' }).notNull().default('{}'),
  isSystem: integer('is_system', { mode: 'boolean' }).default(false).notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
});

// Sessions table
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),
  token: text('token').notNull().unique(),
  refreshToken: text('refresh_token').notNull().unique(),
  deviceInfo: text('device_info', { mode: 'json' }),
  ipAddress: text('ip_address'),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
});

// Patients table
export const patients = sqliteTable('patients', {
  id: text('id').primaryKey(),
  mrn: text('mrn').notNull().unique(),
  name: text('name').notNull(),
  gender: text('gender', { enum: ['male', 'female', 'other'] }).notNull(),
  birthDate: text('birth_date').notNull(),
  phone: text('phone'),
  email: text('email'),
  idCard: text('id_card'),
  insuranceNo: text('insurance_no'),
  address: text('address'),
  avatar: text('avatar'),
  notes: text('notes'),
  tags: text('tags', { mode: 'json' }).default('[]'),
  customFields: text('custom_fields', { mode: 'json' }),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

// Patient tags table
export const patientTags = sqliteTable('patient_tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color').notNull(),
  description: text('description'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
});

// Studies table
export const studies = sqliteTable('studies', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').references(() => patients.id).notNull(),
  studyDate: text('study_date').notNull(),
  studyTime: text('study_time'),
  // studyType removed - modality is determined by child Series (DICOM standard)
  device: text('device'),
  physicianId: text('physician_id').references(() => users.id),
  status: text('status', { 
    enum: ['pending', 'in_progress', 'diagnosed', 'reported'] 
  }).default('pending').notNull(),
  description: text('description'),
  tags: text('tags', { mode: 'json' }),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

// Series table
export const series = sqliteTable('series', {
  id: text('id').primaryKey(),
  studyId: text('study_id').references(() => studies.id).notNull(),
  seriesNumber: integer('series_number').notNull(),
  seriesDescription: text('series_description'),
  modality: text('modality').notNull(),
  bodyPart: text('body_part'),
  imageCount: integer('image_count').default(0).notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
});

// Images table
export const images = sqliteTable('images', {
  id: text('id').primaryKey(),
  seriesId: text('series_id').references(() => series.id).notNull(),
  instanceNumber: integer('instance_number').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size').notNull(),
  fileHash: text('file_hash').notNull(),
  format: text('format', { 
    enum: ['dicom', 'jpeg', 'png', 'tiff', 'bmp'] 
  }).notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bitsAllocated: integer('bits_allocated').default(8).notNull(),
  thumbnailPath: text('thumbnail_path'),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
});

// Annotations table
export const annotations = sqliteTable('annotations', {
  id: text('id').primaryKey(),
  imageId: text('image_id').references(() => images.id),
  studyId: text('study_id').references(() => studies.id),
  userId: text('user_id').references(() => users.id).notNull(),
  layerId: text('layer_id').references(() => layers.id),
  type: text('type', { 
    enum: ['measurement', 'arrow', 'text', 'freehand', 'roi', 'highlight'] 
  }).notNull(),
  geometry: text('geometry', { mode: 'json' }).notNull(),
  style: text('style', { mode: 'json' }).notNull(),
  label: text('label'),
  notes: text('notes'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

// Layers table
export const layers = sqliteTable('layers', {
  id: text('id').primaryKey(),
  imageId: text('image_id').references(() => images.id).notNull(),
  name: text('name').notNull(),
  type: text('type', { enum: ['image', 'annotation', 'ai_result'] }).notNull(),
  visible: integer('visible', { mode: 'boolean' }).default(true).notNull(),
  opacity: real('opacity').default(1).notNull(),
  locked: integer('locked', { mode: 'boolean' }).default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
});

// Reports table
export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(),
  studyId: text('study_id').references(() => studies.id).notNull(),
  patientId: text('patient_id').references(() => patients.id).notNull(),
  templateId: text('template_id').references(() => reportTemplates.id).notNull(),
  title: text('title').notNull(),
  content: text('content', { mode: 'json' }).notNull(),
  images: text('images', { mode: 'json' }).default('[]'),
  status: text('status', { 
    enum: ['draft', 'pending_review', 'reviewed', 'published'] 
  }).default('draft').notNull(),
  reviewerId: text('reviewer_id').references(() => users.id),
  reviewNotes: text('review_notes'),
  publishedAt: text('published_at'),
  createdBy: text('created_by').references(() => users.id).notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

// Report templates table
export const reportTemplates = sqliteTable('report_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { 
    enum: ['oct', 'fundus', 'ffa', 'icga', 'vf', 'octa', 'comprehensive', 'custom'] 
  }).notNull(),
  description: text('description'),
  fields: text('fields', { mode: 'json' }).notNull(),
  layout: text('layout', { mode: 'json' }).notNull(),
  isSystem: integer('is_system', { mode: 'boolean' }).default(false).notNull(),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

// Device adapters table
export const deviceAdapters = sqliteTable('device_adapters', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['dicom', 'rest', 'file', 'custom'] }).notNull(),
  status: text('status', {
    enum: ['idle', 'starting', 'running', 'stopping', 'error', 'disabled']
  }).default('idle').notNull(),
  config: text('config', { mode: 'json' }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true).notNull(),
  lastError: text('last_error'),
  lastImageAt: text('last_image_at'),
  imageCount: integer('image_count').default(0).notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

export const deviceAdaptersRelations = relations(deviceAdapters, ({ many }) => ({
  devices: many(devices),
  inboundTransfers: many(inboundTransfers),
}));

// Devices table
export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),  // OCT, Fundus Camera, etc.
  manufacturer: text('manufacturer').notNull(),
  model: text('model').notNull(),
  serialNumber: text('serial_number'),
  adapterId: text('adapter_id').references(() => deviceAdapters.id).notNull(),
  connectionInfo: text('connection_info', { mode: 'json' }),
  status: text('status', {
    enum: ['online', 'offline', 'error']
  }).default('offline').notNull(),
  lastSyncAt: text('last_sync_at'),
  imageCount: integer('image_count').default(0).notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

export const devicesRelations = relations(devices, ({ one, many }) => ({
  adapter: one(deviceAdapters, {
    fields: [devices.adapterId],
    references: [deviceAdapters.id],
  }),
  inboundTransfers: many(inboundTransfers),
}));

// Inbound Transfers table
export const inboundTransfers = sqliteTable('inbound_transfers', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').references(() => devices.id),
  adapterId: text('adapter_id').references(() => deviceAdapters.id).notNull(),
  status: text('status', {
    enum: ['pending', 'processing', 'completed', 'failed']
  }).default('pending').notNull(),
  fileCount: integer('file_count').notNull(),
  processedCount: integer('processed_count').default(0).notNull(),
  errorCount: integer('error_count').default(0).notNull(),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  completedAt: text('completed_at'),
});

export const inboundTransfersRelations = relations(inboundTransfers, ({ one }) => ({
  device: one(devices, {
    fields: [inboundTransfers.deviceId],
    references: [devices.id],
  }),
  adapter: one(deviceAdapters, {
    fields: [inboundTransfers.adapterId],
    references: [deviceAdapters.id],
  }),
}));

// Audit logs table
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id'),
  details: text('details', { mode: 'json' }),
  ipAddress: text('ip_address'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const patientsRelations = relations(patients, ({ many }) => ({
  studies: many(studies),
}));

export const studiesRelations = relations(studies, ({ one, many }) => ({
  patient: one(patients, {
    fields: [studies.patientId],
    references: [patients.id],
  }),
  physician: one(users, {
    fields: [studies.physicianId],
    references: [users.id],
  }),
  series: many(series),
}));

export const seriesRelations = relations(series, ({ one, many }) => ({
  study: one(studies, {
    fields: [series.studyId],
    references: [studies.id],
  }),
  images: many(images),
}));

export const imagesRelations = relations(images, ({ one, many }) => ({
  series: one(series, {
    fields: [images.seriesId],
    references: [series.id],
  }),
  layers: many(layers),
  annotations: many(annotations),
}));

export const layersRelations = relations(layers, ({ one, many }) => ({
  image: one(images, {
    fields: [layers.imageId],
    references: [images.id],
  }),
  annotations: many(annotations),
}));

export const annotationsRelations = relations(annotations, ({ one }) => ({
  image: one(images, {
    fields: [annotations.imageId],
    references: [images.id],
  }),
  study: one(studies, {
    fields: [annotations.studyId],
    references: [studies.id],
  }),
  user: one(users, {
    fields: [annotations.userId],
    references: [users.id],
  }),
  layer: one(layers, {
    fields: [annotations.layerId],
    references: [layers.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one, many }) => ({
  study: one(studies, {
    fields: [reports.studyId],
    references: [studies.id],
  }),
  patient: one(patients, {
    fields: [reports.patientId],
    references: [patients.id],
  }),
  template: one(reportTemplates, {
    fields: [reports.templateId],
    references: [reportTemplates.id],
  }),
  creator: one(users, {
    fields: [reports.createdBy],
    references: [users.id],
  }),
  reviewer: one(users, {
    fields: [reports.reviewerId],
    references: [users.id],
  }),
  versions: many(reportVersions),
}));

// Report Versions table
export const reportVersions = sqliteTable('report_versions', {
  id: text('id').primaryKey(),
  reportId: text('report_id').references(() => reports.id).notNull(),
  version: integer('version').notNull(),
  content: text('content', { mode: 'json' }).notNull(),
  images: text('images', { mode: 'json' }).default('[]'),
  createdBy: text('created_by').references(() => users.id).notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
});

export const reportVersionsRelations = relations(reportVersions, ({ one }) => ({
  report: one(reports, {
    fields: [reportVersions.reportId],
    references: [reports.id],
  }),
  creator: one(users, {
    fields: [reportVersions.createdBy],
    references: [users.id],
  }),
}));

export const reportTemplatesRelations = relations(reportTemplates, ({ one, many }) => ({
  creator: one(users, {
    fields: [reportTemplates.createdBy],
    references: [users.id],
  }),
  reports: many(reports),
}));

// Comparisons table
export const comparisons = sqliteTable('comparisons', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').references(() => patients.id),
  name: text('name').notNull(),
  type: text('type', { enum: ['side_by_side', 'overlay', 'slider'] }).notNull(),
  config: text('config', { mode: 'json' }).notNull(),
  imageIds: text('image_ids', { mode: 'json' }).notNull().default('[]'),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).default(false).notNull(),
  snapshotPath: text('snapshot_path'),
  createdBy: text('created_by').references(() => users.id).notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

export const comparisonsRelations = relations(comparisons, ({ one }) => ({
  patient: one(patients, {
    fields: [comparisons.patientId],
    references: [patients.id],
  }),
  creator: one(users, {
    fields: [comparisons.createdBy],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertPatientSchema = createInsertSchema(patients);
export const selectPatientSchema = createSelectSchema(patients);
export const insertStudySchema = createInsertSchema(studies);
export const selectStudySchema = createSelectSchema(studies);
export const insertReportSchema = createInsertSchema(reports);
export const selectReportSchema = createSelectSchema(reports);
export const insertReportVersionSchema = createInsertSchema(reportVersions);
export const selectReportVersionSchema = createSelectSchema(reportVersions);
export const insertComparisonSchema = createInsertSchema(comparisons);
export const selectComparisonSchema = createSelectSchema(comparisons);
export const insertDeviceSchema = createInsertSchema(devices);
export const selectDeviceSchema = createSelectSchema(devices);
export const insertInboundTransferSchema = createInsertSchema(inboundTransfers);
export const selectInboundTransferSchema = createSelectSchema(inboundTransfers);
