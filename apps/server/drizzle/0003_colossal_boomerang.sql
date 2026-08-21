PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- #118 数据清洗: 存量 'anonymous' 违规行先置 NULL，再重建表。
-- 这些行在 users 表无对应记录，直接拷贝会让新表继续携带 FK 违规数据，
-- 并在任何启用 PRAGMA foreign_keys 的环境阻塞迁移。
UPDATE `audit_logs` SET `user_id` = NULL WHERE `user_id` = 'anonymous';--> statement-breakpoint
CREATE TABLE `__new_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
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
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `audit_logs_user_id_idx` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_resource_idx` ON `audit_logs` (`resource`);