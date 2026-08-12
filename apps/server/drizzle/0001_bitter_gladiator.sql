CREATE TABLE `dicom_frames` (
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
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dicom_frames_image_idx` ON `dicom_frames` (`image_id`,`frame_index`);--> statement-breakpoint
CREATE INDEX `dicom_frames_image_id_idx` ON `dicom_frames` (`image_id`);--> statement-breakpoint
CREATE TABLE `follow_up_records` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`baseline_study_id` text NOT NULL,
	`comparison_study_id` text NOT NULL,
	`measurements` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`baseline_study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`comparison_study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `followup_patient_idx` ON `follow_up_records` (`patient_id`);--> statement-breakpoint
CREATE INDEX `followup_baseline_idx` ON `follow_up_records` (`baseline_study_id`);--> statement-breakpoint
CREATE INDEX `followup_comparison_idx` ON `follow_up_records` (`comparison_study_id`);--> statement-breakpoint
CREATE TABLE `measurement_definitions` (
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
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `measurement_definitions_key_unique` ON `measurement_definitions` (`key`);--> statement-breakpoint
CREATE INDEX `measurement_definitions_key_idx` ON `measurement_definitions` (`key`);--> statement-breakpoint
CREATE TABLE `measurement_points` (
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
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_annotation_id`) REFERENCES `annotations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `measurement_points_study_key_idx` ON `measurement_points` (`study_id`,`measurement_key`);--> statement-breakpoint
CREATE INDEX `measurement_points_study_idx` ON `measurement_points` (`study_id`);--> statement-breakpoint
CREATE INDEX `measurement_points_key_idx` ON `measurement_points` (`measurement_key`);--> statement-breakpoint
CREATE TABLE `worklist_items` (
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
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `worklist_date_idx` ON `worklist_items` (`scheduled_procedure_step_start_date`);--> statement-breakpoint
CREATE INDEX `worklist_modality_idx` ON `worklist_items` (`modality`);--> statement-breakpoint
CREATE INDEX `worklist_status_idx` ON `worklist_items` (`status`);--> statement-breakpoint
CREATE INDEX `worklist_accession_idx` ON `worklist_items` (`accession_number`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_patients`("id", "mrn", "name", "gender", "birth_date", "phone", "email", "id_card", "insurance_no", "address", "avatar", "notes", "tags", "custom_fields", "created_at", "updated_at") SELECT "id", "mrn", "name", "gender", "birth_date", "phone", "email", "id_card", "insurance_no", "address", "avatar", "notes", "tags", "custom_fields", "created_at", "updated_at" FROM `patients`;--> statement-breakpoint
DROP TABLE `patients`;--> statement-breakpoint
ALTER TABLE `__new_patients` RENAME TO `patients`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `patients_mrn_unique` ON `patients` (`mrn`);--> statement-breakpoint
CREATE INDEX `patients_name_idx` ON `patients` (`name`);--> statement-breakpoint
CREATE INDEX `patients_phone_idx` ON `patients` (`phone`);--> statement-breakpoint
CREATE INDEX `patients_created_at_idx` ON `patients` (`created_at`);--> statement-breakpoint
ALTER TABLE `images` ADD `sop_instance_uid` text;--> statement-breakpoint
ALTER TABLE `images` ADD `sop_class_uid` text;--> statement-breakpoint
ALTER TABLE `images` ADD `transfer_syntax_uid` text;--> statement-breakpoint
ALTER TABLE `images` ADD `pixel_spacing` text;--> statement-breakpoint
ALTER TABLE `images` ADD `window_center` text;--> statement-breakpoint
ALTER TABLE `images` ADD `window_width` text;--> statement-breakpoint
ALTER TABLE `images` ADD `rescale_slope` real DEFAULT 1;--> statement-breakpoint
ALTER TABLE `images` ADD `rescale_intercept` real DEFAULT 0;--> statement-breakpoint
ALTER TABLE `images` ADD `photometric_interpretation` text;--> statement-breakpoint
ALTER TABLE `images` ADD `number_of_frames` integer DEFAULT 1;--> statement-breakpoint
CREATE UNIQUE INDEX `images_sop_instance_uid_unique` ON `images` (`sop_instance_uid`);--> statement-breakpoint
CREATE INDEX `images_sop_instance_uid_idx` ON `images` (`sop_instance_uid`);--> statement-breakpoint
ALTER TABLE `series` ADD `series_instance_uid` text;--> statement-breakpoint
CREATE UNIQUE INDEX `series_series_instance_uid_unique` ON `series` (`series_instance_uid`);--> statement-breakpoint
ALTER TABLE `studies` ADD `study_instance_uid` text;--> statement-breakpoint
ALTER TABLE `studies` ADD `accession_number` text;--> statement-breakpoint
CREATE UNIQUE INDEX `studies_study_instance_uid_unique` ON `studies` (`study_instance_uid`);