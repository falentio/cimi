CREATE TEMP TABLE `__cimi_backup_restore_reference_legacy` AS
SELECT `id` AS `operation_id`, `restore_source_backup_id`, `pre_restore_safety_artifact_id`, `updated_at` AS `created_at`
FROM `backup_operation`
WHERE `restore_source_backup_id` IS NOT NULL AND `pre_restore_safety_artifact_id` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `backup_restore_reference` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`restore_source_backup_id` text NOT NULL,
	`pre_restore_safety_artifact_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`operation_id`) REFERENCES `backup_operation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`restore_source_backup_id`) REFERENCES `backup_operation`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pre_restore_safety_artifact_id`) REFERENCES `backup_artifact`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `backup_restore_reference`("operation_id", "restore_source_backup_id", "pre_restore_safety_artifact_id", "created_at")
SELECT "operation_id", "restore_source_backup_id", "pre_restore_safety_artifact_id", "created_at"
FROM `__cimi_backup_restore_reference_legacy`;
--> statement-breakpoint
DROP TABLE `__cimi_backup_restore_reference_legacy`;
--> statement-breakpoint
ALTER TABLE `backup_operation` DROP COLUMN `restore_source_backup_id`;--> statement-breakpoint
ALTER TABLE `backup_operation` DROP COLUMN `pre_restore_safety_artifact_id`;
