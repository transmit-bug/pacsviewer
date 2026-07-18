import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
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
  permissions: text('permissions', { mode: 'json' }).notNull().default({}),
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
}, (table) => [
  index('sessions_user_id_idx').on(table.userId),
  index('sessions_expires_at_idx').on(table.expiresAt),
]);

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
  tags: text('tags', { mode: 'json' }).default([]),
  customFields: text('custom_fields', { mode: 'json' }),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
}, (table) => [
  index('patients_name_idx').on(table.name),
  index('patients_phone_idx').on(table.phone),
  index('patients_created_at_idx').on(table.createdAt),
]);

// Patient tags table - used as a tag registry; patients reference tags via their `tags` JSON field
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
  studyInstanceUid: text('study_instance_uid').unique(),  // DICOM StudyInstanceUID
  accessionNumber: text('accession_number'),              // DICOM AccessionNumber
  studyDate: text('study_date').notNull(),
  studyTime: text('study_time'),
  modality: text('modality'),  // Primary modality (denormalized from series for query convenience)
  device: text('device'),
  physicianId: text('physician_id').references(() => users.id),
  status: text('status', { 
    enum: ['pending', 'in_progress', 'diagnosed', 'reported'] 
  }).default('pending').notNull(),
  description: text('description'),
  tags: text('tags', { mode: 'json' }).default([]),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
}, (table) => [
  index('studies_patient_id_idx').on(table.patientId),
  index('studies_study_date_idx').on(table.studyDate),
  index('studies_status_idx').on(table.status),
  index('studies_modality_idx').on(table.modality),
  index('studies_physician_id_idx').on(table.physicianId),
]);

// Series table
export const series = sqliteTable('series', {
  id: text('id').primaryKey(),
  studyId: text('study_id').references(() => studies.id).notNull(),
  seriesInstanceUid: text('series_instance_uid').unique(),  // DICOM SeriesInstanceUID
  seriesNumber: integer('series_number').notNull(),
  seriesDescription: text('series_description'),
  modality: text('modality').notNull(),
  bodyPart: text('body_part'),
  imageCount: integer('image_count').default(0).notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
}, (table) => [
  index('series_study_id_idx').on(table.studyId),
  index('series_modality_idx').on(table.modality),
]);

// Images table
export const images = sqliteTable('images', {
  id: text('id').primaryKey(),
  seriesId: text('series_id').references(() => series.id).notNull(),
  sopInstanceUid: text('sop_instance_uid').unique(),       // DICOM SOPInstanceUID
  sopClassUid: text('sop_class_uid'),                     // DICOM SOPClassUID
  transferSyntaxUid: text('transfer_syntax_uid'),         // DICOM TransferSyntaxUID
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
  // DICOM display parameters
  pixelSpacing: text('pixel_spacing', { mode: 'json' }),          // [row, col] in mm
  windowCenter: text('window_center', { mode: 'json' }),          // number | number[]
  windowWidth: text('window_width', { mode: 'json' }),            // number | number[]
  rescaleSlope: real('rescale_slope').default(1),
  rescaleIntercept: real('rescale_intercept').default(0),
  photometricInterpretation: text('photometric_interpretation'),  // MONOCHROME1/2, RGB, YBR_FULL, etc.
  numberOfFrames: integer('number_of_frames').default(1),
  thumbnailPath: text('thumbnail_path'),
  metadata: text('metadata', { mode: 'json' }),                   // Full DICOM JSON metadata
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
}, (table) => [
  index('images_series_id_idx').on(table.seriesId),
  index('images_file_hash_idx').on(table.fileHash),
  index('images_sop_instance_uid_idx').on(table.sopInstanceUid),
]);

// DICOM Frames table — stores per-frame metadata for multi-frame DICOM images
export const dicomFrames = sqliteTable('dicom_frames', {
  id: text('id').primaryKey(),
  imageId: text('image_id').references(() => images.id).notNull(),
  frameIndex: integer('frame_index').notNull(),             // 0-based frame index
  frameType: text('frame_type'),                             // e.g. 'ORIGINAL\\PRIMARY'
  instanceNumber: integer('instance_number'),
  // Temporal info (for FFA/ICGA time series)
  temporalPositionIdentifier: integer('temporal_position'),
  frameAcquisitionDateTime: text('frame_acquisition_datetime'),
  // Spatial info (for OCT B-scan volume)
  sliceLocation: real('slice_location'),                     // mm from reference
  imagePositionPatient: text('image_position_patient', { mode: 'json' }),   // [x, y, z]
  imageOrientationPatient: text('image_orientation_patient', { mode: 'json' }), // [row cosines, col cosines]
  // Per-frame metadata from PerFrameFunctionalGroupsSequence
  metadata: text('metadata', { mode: 'json' }),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
}, (table) => [
  uniqueIndex('dicom_frames_image_idx').on(table.imageId, table.frameIndex),
  index('dicom_frames_image_id_idx').on(table.imageId),
]);

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
}, (table) => [
  index('annotations_image_id_idx').on(table.imageId),
  index('annotations_study_id_idx').on(table.studyId),
  index('annotations_user_id_idx').on(table.userId),
]);

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
}, (table) => [
  index('layers_image_id_idx').on(table.imageId),
]);

// Reports table
export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(),
  studyId: text('study_id').references(() => studies.id).notNull(),
  patientId: text('patient_id').references(() => patients.id).notNull(),
  templateId: text('template_id').references(() => reportTemplates.id).notNull(),
  title: text('title').notNull(),
  content: text('content', { mode: 'json' }).notNull(),
  images: text('images', { mode: 'json' }).default([]),
  status: text('status', { 
    enum: ['draft', 'pending_review', 'reviewed', 'published'] 
  }).default('draft').notNull(),
  reviewerId: text('reviewer_id').references(() => users.id),
  reviewNotes: text('review_notes'),
  publishedAt: text('published_at'),
  createdBy: text('created_by').references(() => users.id).notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
}, (table) => [
  index('reports_study_id_idx').on(table.studyId),
  index('reports_patient_id_idx').on(table.patientId),
  index('reports_status_idx').on(table.status),
  index('reports_created_by_idx').on(table.createdBy),
]);

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
  type: text('type', {
    enum: ['oct', 'fundus_camera', 'ffa', 'icga', 'vf', 'octa', 'slit_lamp', 'topographer', 'biometer', 'other']
  }).notNull(),
  manufacturer: text('manufacturer').notNull(),
  model: text('model').notNull(),
  serialNumber: text('serial_number'),
  adapterId: text('adapter_id').references(() => deviceAdapters.id),  // nullable: device can exist without adapter
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

// System settings table
export const systemSettings = sqliteTable('system_settings', {
  id: text('id').primaryKey(),
  category: text('category').notNull(), // 'dicom', 'storage', 'general'
  key: text('key').notNull(),
  value: text('value', { mode: 'json' }),
  description: text('description'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

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
}, (table) => [
  index('audit_logs_user_id_idx').on(table.userId),
  index('audit_logs_created_at_idx').on(table.createdAt),
  index('audit_logs_resource_idx').on(table.resource),
]);

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
  frames: many(dicomFrames),
}));

export const dicomFramesRelations = relations(dicomFrames, ({ one }) => ({
  image: one(images, {
    fields: [dicomFrames.imageId],
    references: [images.id],
  }),
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
  status: text('status', { 
    enum: ['draft', 'pending_review', 'reviewed', 'published'] 
  }).notNull(),
  content: text('content', { mode: 'json' }).notNull(),
  images: text('images', { mode: 'json' }).default([]),
  changeNotes: text('change_notes'),
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
  imageIds: text('image_ids', { mode: 'json' }).notNull().default([]),
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

// Worklist Items table (DICOM Modality Worklist)
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
  index('worklist_accession_idx').on(table.accessionNumber),
]);

export const worklistItemsRelations = relations(worklistItems, ({ one }) => ({
  patient: one(patients, {
    fields: [worklistItems.patientId],
    references: [patients.id],
  }),
}));

// Follow-up Records table
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

export const followUpRecordsRelations = relations(followUpRecords, ({ one }) => ({
  patient: one(patients, {
    fields: [followUpRecords.patientId],
    references: [patients.id],
  }),
  baselineStudy: one(studies, {
    fields: [followUpRecords.baselineStudyId],
    references: [studies.id],
  }),
  comparisonStudy: one(studies, {
    fields: [followUpRecords.comparisonStudyId],
    references: [studies.id],
  }),
  creator: one(users, {
    fields: [followUpRecords.createdBy],
    references: [users.id],
  }),
}));

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertPatientSchema = createInsertSchema(patients);
export const selectPatientSchema = createSelectSchema(patients);
export const insertStudySchema = createInsertSchema(studies).omit({ id: true });
export const selectStudySchema = createSelectSchema(studies);
export const insertSeriesSchema = createInsertSchema(series).omit({ id: true });
export const selectSeriesSchema = createSelectSchema(series);
export const insertImageSchema = createInsertSchema(images).omit({ id: true });
export const selectImageSchema = createSelectSchema(images);
export const insertDeviceAdapterSchema = createInsertSchema(deviceAdapters).omit({ id: true });
export const selectDeviceAdapterSchema = createSelectSchema(deviceAdapters);
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true });
export const selectAuditLogSchema = createSelectSchema(auditLogs);
export const insertReportTemplateSchema = createInsertSchema(reportTemplates).omit({ id: true });
export const selectReportTemplateSchema = createSelectSchema(reportTemplates);
export const insertPatientTagSchema = createInsertSchema(patientTags).omit({ id: true });
export const selectPatientTagSchema = createSelectSchema(patientTags);
export const insertReportSchema = createInsertSchema(reports);
export const selectReportSchema = createSelectSchema(reports);
export const insertReportVersionSchema = createInsertSchema(reportVersions);
export const selectReportVersionSchema = createSelectSchema(reportVersions);
export const insertComparisonSchema = createInsertSchema(comparisons);
export const selectComparisonSchema = createSelectSchema(comparisons);
export const insertDeviceSchema = createInsertSchema(devices).omit({ id: true });
export const selectDeviceSchema = createSelectSchema(devices);
export const insertInboundTransferSchema = createInsertSchema(inboundTransfers);
export const selectInboundTransferSchema = createSelectSchema(inboundTransfers);
export const insertAnnotationSchema = createInsertSchema(annotations);
export const selectAnnotationSchema = createSelectSchema(annotations);
export const insertDicomFrameSchema = createInsertSchema(dicomFrames).omit({ id: true });
export const selectDicomFrameSchema = createSelectSchema(dicomFrames);
export const insertLayerSchema = createInsertSchema(layers);
export const selectLayerSchema = createSelectSchema(layers);
export const insertSystemSettingsSchema = createInsertSchema(systemSettings);
export const selectSystemSettingsSchema = createSelectSchema(systemSettings);
export const insertWorklistItemSchema = createInsertSchema(worklistItems).omit({ id: true });
export const selectWorklistItemSchema = createSelectSchema(worklistItems);
export const insertFollowUpRecordSchema = createInsertSchema(followUpRecords).omit({ id: true });
export const selectFollowUpRecordSchema = createSelectSchema(followUpRecords);
