PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_backup_restore_reference` (
  `operation_id` text PRIMARY KEY NOT NULL,
  `restore_source_backup_id` text NOT NULL,
  `pre_restore_safety_artifact_id` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`operation_id`) REFERENCES `backup_operation`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`restore_source_backup_id`) REFERENCES `backup_operation`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`pre_restore_safety_artifact_id`) REFERENCES `backup_artifact`(`id`) ON UPDATE no action ON DELETE restrict
);--> statement-breakpoint
INSERT INTO `__new_backup_restore_reference` (`operation_id`, `restore_source_backup_id`, `pre_restore_safety_artifact_id`, `created_at`)
SELECT `operation_id`, `restore_source_backup_id`, `pre_restore_safety_artifact_id`, `created_at`
FROM `backup_restore_reference`;--> statement-breakpoint
DROP TABLE `backup_restore_reference`;--> statement-breakpoint
ALTER TABLE `__new_backup_restore_reference` RENAME TO `backup_restore_reference`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
