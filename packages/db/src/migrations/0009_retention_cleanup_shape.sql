PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_retention_cleanup_run` (
  `id` text PRIMARY KEY NOT NULL,
  `installation_id` text NOT NULL,
  `site_id` text NOT NULL,
  `policy_id` text NOT NULL,
  `cleanup_kind` text NOT NULL,
  `status` text DEFAULT 'queued' NOT NULL,
  `event_occurrence_cutoff_at` integer NOT NULL,
  `raw_receipt_cutoff_at` integer NOT NULL,
  `profile_activity_cutoff_at` integer NOT NULL,
  `replay_receipt_cutoff_at` integer,
  `started_at` integer,
  `completed_at` integer,
  `last_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`installation_id`) REFERENCES `installation`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`policy_id`) REFERENCES `retention_policy`(`id`) ON UPDATE no action ON DELETE restrict
);--> statement-breakpoint
CREATE TABLE `__retention_cleanup_run_map` (
  `old_id` text NOT NULL,
  `new_id` text NOT NULL,
  PRIMARY KEY (`old_id`, `new_id`)
);--> statement-breakpoint
INSERT INTO `__new_retention_cleanup_run` (
  `id`, `installation_id`, `site_id`, `policy_id`, `cleanup_kind`, `status`,
  `event_occurrence_cutoff_at`, `raw_receipt_cutoff_at`, `profile_activity_cutoff_at`,
  `replay_receipt_cutoff_at`, `started_at`, `completed_at`, `last_error`, `created_at`, `updated_at`
)
SELECT
  old.`id`, old.`installation_id`, old.`site_id`, old.`policy_id`, old.`cleanup_kind`, old.`status`,
  old.`cutoff_at`, old.`cutoff_at`, old.`cutoff_at`, NULL,
  old.`started_at`, old.`completed_at`, old.`last_error`, old.`created_at`, old.`updated_at`
FROM `retention_cleanup_run` old
WHERE old.`site_id` IS NOT NULL;--> statement-breakpoint
INSERT INTO `__new_retention_cleanup_run` (
  `id`, `installation_id`, `site_id`, `policy_id`, `cleanup_kind`, `status`,
  `event_occurrence_cutoff_at`, `raw_receipt_cutoff_at`, `profile_activity_cutoff_at`,
  `replay_receipt_cutoff_at`, `started_at`, `completed_at`, `last_error`, `created_at`, `updated_at`
)
SELECT
  old.`id` || ':' || site.`id`, old.`installation_id`, site.`id`, old.`policy_id`, old.`cleanup_kind`, old.`status`,
  old.`cutoff_at`, old.`cutoff_at`, old.`cutoff_at`, NULL,
  old.`started_at`, old.`completed_at`, old.`last_error`, old.`created_at`, old.`updated_at`
FROM `retention_cleanup_run` old
JOIN `site` site ON site.`status` = 'active'
WHERE old.`site_id` IS NULL;--> statement-breakpoint
INSERT INTO `__retention_cleanup_run_map` (`old_id`, `new_id`)
SELECT old.`id`, old.`id`
FROM `retention_cleanup_run` old
WHERE old.`site_id` IS NOT NULL;--> statement-breakpoint
INSERT INTO `__retention_cleanup_run_map` (`old_id`, `new_id`)
SELECT old.`id`, old.`id` || ':' || site.`id`
FROM `retention_cleanup_run` old
JOIN `site` site ON site.`status` = 'active'
WHERE old.`site_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `__new_retention_cleanup_run_id_kind_unique`
  ON `__new_retention_cleanup_run` (`id`, `cleanup_kind`);--> statement-breakpoint
CREATE TABLE `__new_retention_cleanup_checkpoint` (
  `id` text PRIMARY KEY NOT NULL,
  `cleanup_run_id` text NOT NULL,
  `data_class` text NOT NULL,
  `stage` text NOT NULL,
  `cursor` text,
  `processed_through` integer,
  `status` text NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`cleanup_run_id`) REFERENCES `__new_retention_cleanup_run`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`cleanup_run_id`,`stage`) REFERENCES `__new_retention_cleanup_run`(`id`,`cleanup_kind`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_retention_cleanup_checkpoint` (
  `id`, `cleanup_run_id`, `data_class`, `stage`, `cursor`, `processed_through`, `status`, `updated_at`
)
SELECT
  CASE WHEN map.`new_id` = checkpoint.`cleanup_run_id`
    THEN checkpoint.`id`
    ELSE checkpoint.`id` || ':' || map.`new_id`
  END,
  map.`new_id`, checkpoint.`data_class`, checkpoint.`stage`, checkpoint.`cursor`,
  checkpoint.`processed_through`, checkpoint.`status`, checkpoint.`updated_at`
FROM `retention_cleanup_checkpoint` checkpoint
JOIN `__retention_cleanup_run_map` map ON map.`old_id` = checkpoint.`cleanup_run_id`;--> statement-breakpoint
DROP TABLE `retention_cleanup_checkpoint`;--> statement-breakpoint
DROP TABLE `retention_cleanup_run`;--> statement-breakpoint
ALTER TABLE `__new_retention_cleanup_run` RENAME TO `retention_cleanup_run`;--> statement-breakpoint
ALTER TABLE `__new_retention_cleanup_checkpoint` RENAME TO `retention_cleanup_checkpoint`;--> statement-breakpoint
DROP TABLE `__retention_cleanup_run_map`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `retention_cleanup_run_status_idx` ON `retention_cleanup_run` (`installation_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `retention_cleanup_run_active_unique` ON `retention_cleanup_run` (`installation_id`,`site_id`,`cleanup_kind`) WHERE `retention_cleanup_run`.`status` IN ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX `retention_cleanup_run_id_kind_unique` ON `retention_cleanup_run` (`id`,`cleanup_kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `retention_cleanup_checkpoint_unique` ON `retention_cleanup_checkpoint` (`cleanup_run_id`,`stage`,`data_class`);--> statement-breakpoint
CREATE INDEX `retention_cleanup_checkpoint_status_idx` ON `retention_cleanup_checkpoint` (`cleanup_run_id`,`status`);
