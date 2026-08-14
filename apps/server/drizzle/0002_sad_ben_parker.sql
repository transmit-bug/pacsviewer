PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`image_id` text,
	`study_id` text,
	`user_id` text NOT NULL,
	`layer_id` text,
	`type` text NOT NULL,
	`geometry` text NOT NULL,
	`style` text NOT NULL,
	`label` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`layer_id`) REFERENCES `layers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_annotations`("id", "image_id", "study_id", "user_id", "layer_id", "type", "geometry", "style", "label", "notes", "created_at", "updated_at") SELECT "id", "image_id", "study_id", "user_id", "layer_id", "type", "geometry", "style", "label", "notes", "created_at", "updated_at" FROM `annotations`;--> statement-breakpoint
DROP TABLE `annotations`;--> statement-breakpoint
ALTER TABLE `__new_annotations` RENAME TO `annotations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `annotations_image_id_idx` ON `annotations` (`image_id`);--> statement-breakpoint
CREATE INDEX `annotations_study_id_idx` ON `annotations` (`study_id`);--> statement-breakpoint
CREATE INDEX `annotations_user_id_idx` ON `annotations` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`resource` text NOT NULL,
	`resource_id` text,
	`details` text,
	`ip_address` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_audit_logs`("id", "user_id", "action", "resource", "resource_id", "details", "ip_address", "created_at") SELECT "id", "user_id", "action", "resource", "resource_id", "details", "ip_address", "created_at" FROM `audit_logs`;--> statement-breakpoint
DROP TABLE `audit_logs`;--> statement-breakpoint
ALTER TABLE `__new_audit_logs` RENAME TO `audit_logs`;--> statement-breakpoint
CREATE INDEX `audit_logs_user_id_idx` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_resource_idx` ON `audit_logs` (`resource`);--> statement-breakpoint
CREATE TABLE `__new_comparisons` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`config` text NOT NULL,
	`image_ids` text DEFAULT '[]' NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`snapshot_path` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_comparisons`("id", "patient_id", "name", "type", "config", "image_ids", "is_favorite", "snapshot_path", "created_by", "created_at", "updated_at") SELECT "id", "patient_id", "name", "type", "config", "image_ids", "is_favorite", "snapshot_path", "created_by", "created_at", "updated_at" FROM `comparisons`;--> statement-breakpoint
DROP TABLE `comparisons`;--> statement-breakpoint
ALTER TABLE `__new_comparisons` RENAME TO `comparisons`;--> statement-breakpoint
CREATE TABLE `__new_device_adapters` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`config` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_error` text,
	`last_image_at` text,
	`image_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_device_adapters`("id", "name", "type", "status", "config", "enabled", "last_error", "last_image_at", "image_count", "created_at", "updated_at") SELECT "id", "name", "type", "status", "config", "enabled", "last_error", "last_image_at", "image_count", "created_at", "updated_at" FROM `device_adapters`;--> statement-breakpoint
DROP TABLE `device_adapters`;--> statement-breakpoint
ALTER TABLE `__new_device_adapters` RENAME TO `device_adapters`;--> statement-breakpoint
CREATE TABLE `__new_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`manufacturer` text NOT NULL,
	`model` text NOT NULL,
	`serial_number` text,
	`adapter_id` text,
	`connection_info` text,
	`status` text DEFAULT 'offline' NOT NULL,
	`last_sync_at` text,
	`image_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`adapter_id`) REFERENCES `device_adapters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_devices`("id", "name", "type", "manufacturer", "model", "serial_number", "adapter_id", "connection_info", "status", "last_sync_at", "image_count", "created_at", "updated_at") SELECT "id", "name", "type", "manufacturer", "model", "serial_number", "adapter_id", "connection_info", "status", "last_sync_at", "image_count", "created_at", "updated_at" FROM `devices`;--> statement-breakpoint
DROP TABLE `devices`;--> statement-breakpoint
ALTER TABLE `__new_devices` RENAME TO `devices`;--> statement-breakpoint
CREATE TABLE `__new_dicom_frames` (
	`id` text PRIMARY KEY NOT NULL,
	`image_id` text NOT NULL,
	`frame_index` integer NOT NULL,
	`frame_type` text,
	`instance_number` integer,
	`temporal_position` integer,
	`frame_acquisition_datetime` text,
	`slice_location` real,
	`image_position_patient` text,
	`image_orientation_patient` text,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_dicom_frames`("id", "image_id", "frame_index", "frame_type", "instance_number", "temporal_position", "frame_acquisition_datetime", "slice_location", "image_position_patient", "image_orientation_patient", "metadata", "created_at") SELECT "id", "image_id", "frame_index", "frame_type", "instance_number", "temporal_position", "frame_acquisition_datetime", "slice_location", "image_position_patient", "image_orientation_patient", "metadata", "created_at" FROM `dicom_frames`;--> statement-breakpoint
DROP TABLE `dicom_frames`;--> statement-breakpoint
ALTER TABLE `__new_dicom_frames` RENAME TO `dicom_frames`;--> statement-breakpoint
CREATE UNIQUE INDEX `dicom_frames_image_idx` ON `dicom_frames` (`image_id`,`frame_index`);--> statement-breakpoint
CREATE INDEX `dicom_frames_image_id_idx` ON `dicom_frames` (`image_id`);--> statement-breakpoint
CREATE TABLE `__new_follow_up_records` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`baseline_study_id` text NOT NULL,
	`comparison_study_id` text NOT NULL,
	`measurements` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`baseline_study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`comparison_study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_follow_up_records`("id", "patient_id", "baseline_study_id", "comparison_study_id", "measurements", "notes", "created_by", "created_at", "updated_at") SELECT "id", "patient_id", "baseline_study_id", "comparison_study_id", "measurements", "notes", "created_by", "created_at", "updated_at" FROM `follow_up_records`;--> statement-breakpoint
DROP TABLE `follow_up_records`;--> statement-breakpoint
ALTER TABLE `__new_follow_up_records` RENAME TO `follow_up_records`;--> statement-breakpoint
CREATE INDEX `followup_patient_idx` ON `follow_up_records` (`patient_id`);--> statement-breakpoint
CREATE INDEX `followup_baseline_idx` ON `follow_up_records` (`baseline_study_id`);--> statement-breakpoint
CREATE INDEX `followup_comparison_idx` ON `follow_up_records` (`comparison_study_id`);--> statement-breakpoint
CREATE TABLE `__new_images` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`sop_instance_uid` text,
	`sop_class_uid` text,
	`transfer_syntax_uid` text,
	`instance_number` integer NOT NULL,
	`file_path` text NOT NULL,
	`file_size` integer NOT NULL,
	`file_hash` text NOT NULL,
	`format` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`bits_allocated` integer DEFAULT 8 NOT NULL,
	`pixel_spacing` text,
	`window_center` text,
	`window_width` text,
	`rescale_slope` real DEFAULT 1,
	`rescale_intercept` real DEFAULT 0,
	`photometric_interpretation` text,
	`number_of_frames` integer DEFAULT 1,
	`thumbnail_path` text,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_images`("id", "series_id", "sop_instance_uid", "sop_class_uid", "transfer_syntax_uid", "instance_number", "file_path", "file_size", "file_hash", "format", "width", "height", "bits_allocated", "pixel_spacing", "window_center", "window_width", "rescale_slope", "rescale_intercept", "photometric_interpretation", "number_of_frames", "thumbnail_path", "metadata", "created_at") SELECT "id", "series_id", "sop_instance_uid", "sop_class_uid", "transfer_syntax_uid", "instance_number", "file_path", "file_size", "file_hash", "format", "width", "height", "bits_allocated", "pixel_spacing", "window_center", "window_width", "rescale_slope", "rescale_intercept", "photometric_interpretation", "number_of_frames", "thumbnail_path", "metadata", "created_at" FROM `images`;--> statement-breakpoint
DROP TABLE `images`;--> statement-breakpoint
ALTER TABLE `__new_images` RENAME TO `images`;--> statement-breakpoint
CREATE UNIQUE INDEX `images_sop_instance_uid_unique` ON `images` (`sop_instance_uid`);--> statement-breakpoint
CREATE INDEX `images_series_id_idx` ON `images` (`series_id`);--> statement-breakpoint
CREATE INDEX `images_file_hash_idx` ON `images` (`file_hash`);--> statement-breakpoint
CREATE INDEX `images_sop_instance_uid_idx` ON `images` (`sop_instance_uid`);--> statement-breakpoint
CREATE TABLE `__new_inbound_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text,
	`adapter_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`file_count` integer NOT NULL,
	`processed_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`adapter_id`) REFERENCES `device_adapters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_inbound_transfers`("id", "device_id", "adapter_id", "status", "file_count", "processed_count", "error_count", "metadata", "created_at", "completed_at") SELECT "id", "device_id", "adapter_id", "status", "file_count", "processed_count", "error_count", "metadata", "created_at", "completed_at" FROM `inbound_transfers`;--> statement-breakpoint
DROP TABLE `inbound_transfers`;--> statement-breakpoint
ALTER TABLE `__new_inbound_transfers` RENAME TO `inbound_transfers`;--> statement-breakpoint
CREATE TABLE `__new_layers` (
	`id` text PRIMARY KEY NOT NULL,
	`image_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`opacity` real DEFAULT 1 NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_layers`("id", "image_id", "name", "type", "visible", "opacity", "locked", "sort_order", "created_at") SELECT "id", "image_id", "name", "type", "visible", "opacity", "locked", "sort_order", "created_at" FROM `layers`;--> statement-breakpoint
DROP TABLE `layers`;--> statement-breakpoint
ALTER TABLE `__new_layers` RENAME TO `layers`;--> statement-breakpoint
CREATE INDEX `layers_image_id_idx` ON `layers` (`image_id`);--> statement-breakpoint
CREATE TABLE `__new_measurement_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`display_name` text NOT NULL,
	`type` text NOT NULL,
	`unit` text NOT NULL,
	`trend_direction` text NOT NULL,
	`reference_range` text,
	`modality` text,
	`description` text,
	`is_preset` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_measurement_definitions`("id", "key", "display_name", "type", "unit", "trend_direction", "reference_range", "modality", "description", "is_preset", "created_at", "updated_at") SELECT "id", "key", "display_name", "type", "unit", "trend_direction", "reference_range", "modality", "description", "is_preset", "created_at", "updated_at" FROM `measurement_definitions`;--> statement-breakpoint
DROP TABLE `measurement_definitions`;--> statement-breakpoint
ALTER TABLE `__new_measurement_definitions` RENAME TO `measurement_definitions`;--> statement-breakpoint
CREATE UNIQUE INDEX `measurement_definitions_key_unique` ON `measurement_definitions` (`key`);--> statement-breakpoint
CREATE INDEX `measurement_definitions_key_idx` ON `measurement_definitions` (`key`);--> statement-breakpoint
CREATE TABLE `__new_measurement_points` (
	`id` text PRIMARY KEY NOT NULL,
	`study_id` text NOT NULL,
	`image_id` text,
	`measurement_key` text NOT NULL,
	`type` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`calibrated` integer DEFAULT true NOT NULL,
	`source_annotation_id` text,
	`captured_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_annotation_id`) REFERENCES `annotations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_measurement_points`("id", "study_id", "image_id", "measurement_key", "type", "value", "unit", "calibrated", "source_annotation_id", "captured_at", "created_at", "updated_at") SELECT "id", "study_id", "image_id", "measurement_key", "type", "value", "unit", "calibrated", "source_annotation_id", "captured_at", "created_at", "updated_at" FROM `measurement_points`;--> statement-breakpoint
DROP TABLE `measurement_points`;--> statement-breakpoint
ALTER TABLE `__new_measurement_points` RENAME TO `measurement_points`;--> statement-breakpoint
CREATE UNIQUE INDEX `measurement_points_study_key_idx` ON `measurement_points` (`study_id`,`measurement_key`);--> statement-breakpoint
CREATE INDEX `measurement_points_study_idx` ON `measurement_points` (`study_id`);--> statement-breakpoint
CREATE INDEX `measurement_points_key_idx` ON `measurement_points` (`measurement_key`);--> statement-breakpoint
CREATE TABLE `__new_patient_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_patient_tags`("id", "name", "color", "description", "created_at") SELECT "id", "name", "color", "description", "created_at" FROM `patient_tags`;--> statement-breakpoint
DROP TABLE `patient_tags`;--> statement-breakpoint
ALTER TABLE `__new_patient_tags` RENAME TO `patient_tags`;--> statement-breakpoint
CREATE UNIQUE INDEX `patient_tags_name_unique` ON `patient_tags` (`name`);--> statement-breakpoint
CREATE TABLE `__new_patients` (
	`id` text PRIMARY KEY NOT NULL,
	`mrn` text NOT NULL,
	`name` text NOT NULL,
	`gender` text NOT NULL,
	`birth_date` text,
	`phone` text,
	`email` text,
	`id_card` text,
	`insurance_no` text,
	`address` text,
	`avatar` text,
	`notes` text,
	`tags` text DEFAULT '[]',
	`custom_fields` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_patients`("id", "mrn", "name", "gender", "birth_date", "phone", "email", "id_card", "insurance_no", "address", "avatar", "notes", "tags", "custom_fields", "created_at", "updated_at") SELECT "id", "mrn", "name", "gender", "birth_date", "phone", "email", "id_card", "insurance_no", "address", "avatar", "notes", "tags", "custom_fields", "created_at", "updated_at" FROM `patients`;--> statement-breakpoint
DROP TABLE `patients`;--> statement-breakpoint
ALTER TABLE `__new_patients` RENAME TO `patients`;--> statement-breakpoint
CREATE UNIQUE INDEX `patients_mrn_unique` ON `patients` (`mrn`);--> statement-breakpoint
CREATE INDEX `patients_name_idx` ON `patients` (`name`);--> statement-breakpoint
CREATE INDEX `patients_phone_idx` ON `patients` (`phone`);--> statement-breakpoint
CREATE INDEX `patients_created_at_idx` ON `patients` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_report_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`fields` text NOT NULL,
	`layout` text NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_report_templates`("id", "name", "type", "description", "fields", "layout", "is_system", "created_by", "created_at", "updated_at") SELECT "id", "name", "type", "description", "fields", "layout", "is_system", "created_by", "created_at", "updated_at" FROM `report_templates`;--> statement-breakpoint
DROP TABLE `report_templates`;--> statement-breakpoint
ALTER TABLE `__new_report_templates` RENAME TO `report_templates`;--> statement-breakpoint
CREATE TABLE `__new_report_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`content` text NOT NULL,
	`images` text DEFAULT '[]',
	`change_notes` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_report_versions`("id", "report_id", "version", "status", "content", "images", "change_notes", "created_by", "created_at") SELECT "id", "report_id", "version", "status", "content", "images", "change_notes", "created_by", "created_at" FROM `report_versions`;--> statement-breakpoint
DROP TABLE `report_versions`;--> statement-breakpoint
ALTER TABLE `__new_report_versions` RENAME TO `report_versions`;--> statement-breakpoint
CREATE TABLE `__new_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`study_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`template_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`images` text DEFAULT '[]',
	`status` text DEFAULT 'draft' NOT NULL,
	`reviewer_id` text,
	`review_notes` text,
	`published_at` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `report_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_reports`("id", "study_id", "patient_id", "template_id", "title", "content", "images", "status", "reviewer_id", "review_notes", "published_at", "created_by", "created_at", "updated_at") SELECT "id", "study_id", "patient_id", "template_id", "title", "content", "images", "status", "reviewer_id", "review_notes", "published_at", "created_by", "created_at", "updated_at" FROM `reports`;--> statement-breakpoint
DROP TABLE `reports`;--> statement-breakpoint
ALTER TABLE `__new_reports` RENAME TO `reports`;--> statement-breakpoint
CREATE INDEX `reports_study_id_idx` ON `reports` (`study_id`);--> statement-breakpoint
CREATE INDEX `reports_patient_id_idx` ON `reports` (`patient_id`);--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `reports` (`status`);--> statement-breakpoint
CREATE INDEX `reports_created_by_idx` ON `reports` (`created_by`);--> statement-breakpoint
CREATE TABLE `__new_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`permissions` text DEFAULT '{}' NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_roles`("id", "name", "description", "permissions", "is_system", "created_at") SELECT "id", "name", "description", "permissions", "is_system", "created_at" FROM `roles`;--> statement-breakpoint
DROP TABLE `roles`;--> statement-breakpoint
ALTER TABLE `__new_roles` RENAME TO `roles`;--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `__new_series` (
	`id` text PRIMARY KEY NOT NULL,
	`study_id` text NOT NULL,
	`series_instance_uid` text,
	`series_number` integer NOT NULL,
	`series_description` text,
	`modality` text NOT NULL,
	`body_part` text,
	`image_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_series`("id", "study_id", "series_instance_uid", "series_number", "series_description", "modality", "body_part", "image_count", "created_at") SELECT "id", "study_id", "series_instance_uid", "series_number", "series_description", "modality", "body_part", "image_count", "created_at" FROM `series`;--> statement-breakpoint
DROP TABLE `series`;--> statement-breakpoint
ALTER TABLE `__new_series` RENAME TO `series`;--> statement-breakpoint
CREATE UNIQUE INDEX `series_series_instance_uid_unique` ON `series` (`series_instance_uid`);--> statement-breakpoint
CREATE INDEX `series_study_id_idx` ON `series` (`study_id`);--> statement-breakpoint
CREATE INDEX `series_modality_idx` ON `series` (`modality`);--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`device_info` text,
	`ip_address` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("id", "user_id", "token", "refresh_token", "device_info", "ip_address", "expires_at", "created_at") SELECT "id", "user_id", "token", "refresh_token", "device_info", "ip_address", "expires_at", "created_at" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_refresh_token_unique` ON `sessions` (`refresh_token`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `__new_studies` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`study_instance_uid` text,
	`accession_number` text,
	`study_date` text NOT NULL,
	`study_time` text,
	`modality` text,
	`device` text,
	`physician_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`description` text,
	`tags` text DEFAULT '[]',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`physician_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_studies`("id", "patient_id", "study_instance_uid", "accession_number", "study_date", "study_time", "modality", "device", "physician_id", "status", "description", "tags", "created_at", "updated_at") SELECT "id", "patient_id", "study_instance_uid", "accession_number", "study_date", "study_time", "modality", "device", "physician_id", "status", "description", "tags", "created_at", "updated_at" FROM `studies`;--> statement-breakpoint
DROP TABLE `studies`;--> statement-breakpoint
ALTER TABLE `__new_studies` RENAME TO `studies`;--> statement-breakpoint
CREATE UNIQUE INDEX `studies_study_instance_uid_unique` ON `studies` (`study_instance_uid`);--> statement-breakpoint
CREATE INDEX `studies_patient_id_idx` ON `studies` (`patient_id`);--> statement-breakpoint
CREATE INDEX `studies_study_date_idx` ON `studies` (`study_date`);--> statement-breakpoint
CREATE INDEX `studies_status_idx` ON `studies` (`status`);--> statement-breakpoint
CREATE INDEX `studies_modality_idx` ON `studies` (`modality`);--> statement-breakpoint
CREATE INDEX `studies_physician_id_idx` ON `studies` (`physician_id`);--> statement-breakpoint
CREATE TABLE `__new_system_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`description` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_system_settings`("id", "category", "key", "value", "description", "updated_at") SELECT "id", "category", "key", "value", "description", "updated_at" FROM `system_settings`;--> statement-breakpoint
DROP TABLE `system_settings`;--> statement-breakpoint
ALTER TABLE `__new_system_settings` RENAME TO `system_settings`;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar` text,
	`role_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_login_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "username", "email", "password_hash", "display_name", "avatar", "role_id", "status", "last_login_at", "created_at", "updated_at") SELECT "id", "username", "email", "password_hash", "display_name", "avatar", "role_id", "status", "last_login_at", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `__new_worklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text,
	`patient_name` text NOT NULL,
	`patient_birth_date` text,
	`patient_sex` text,
	`accession_number` text NOT NULL,
	`scheduled_procedure_step_id` text,
	`modality` text NOT NULL,
	`scheduled_station_name` text,
	`scheduled_procedure_step_start_date` text NOT NULL,
	`scheduled_procedure_step_start_time` text,
	`requested_procedure_description` text,
	`referring_physician_name` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_worklist_items`("id", "patient_id", "patient_name", "patient_birth_date", "patient_sex", "accession_number", "scheduled_procedure_step_id", "modality", "scheduled_station_name", "scheduled_procedure_step_start_date", "scheduled_procedure_step_start_time", "requested_procedure_description", "referring_physician_name", "status", "created_at", "updated_at") SELECT "id", "patient_id", "patient_name", "patient_birth_date", "patient_sex", "accession_number", "scheduled_procedure_step_id", "modality", "scheduled_station_name", "scheduled_procedure_step_start_date", "scheduled_procedure_step_start_time", "requested_procedure_description", "referring_physician_name", "status", "created_at", "updated_at" FROM `worklist_items`;--> statement-breakpoint
DROP TABLE `worklist_items`;--> statement-breakpoint
ALTER TABLE `__new_worklist_items` RENAME TO `worklist_items`;--> statement-breakpoint
CREATE INDEX `worklist_date_idx` ON `worklist_items` (`scheduled_procedure_step_start_date`);--> statement-breakpoint
CREATE INDEX `worklist_modality_idx` ON `worklist_items` (`modality`);--> statement-breakpoint
CREATE INDEX `worklist_status_idx` ON `worklist_items` (`status`);--> statement-breakpoint
CREATE INDEX `worklist_accession_idx` ON `worklist_items` (`accession_number`);