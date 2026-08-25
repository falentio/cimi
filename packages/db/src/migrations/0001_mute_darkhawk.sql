CREATE TABLE `projection_checkpoint` (
	`site_id` text PRIMARY KEY NOT NULL,
	`projected_replay_sequence` integer DEFAULT 0 NOT NULL,
	`occurrence_covered_from` integer,
	`occurrence_covered_through` integer,
	`effective_retention_from` integer,
	`statistics_refreshed_at` integer,
	`readiness` text DEFAULT 'ready' NOT NULL,
	`projection_version` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `projection_gap` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`occurrence_from` integer,
	`occurrence_to` integer,
	`unbounded` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`observed_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "projection_gap_interval_check" CHECK(("projection_gap"."unbounded" = 1 AND "projection_gap"."occurrence_from" IS NULL AND "projection_gap"."occurrence_to" IS NULL) OR ("projection_gap"."unbounded" = 0 AND "projection_gap"."occurrence_from" IS NOT NULL AND "projection_gap"."occurrence_to" IS NOT NULL AND "projection_gap"."occurrence_to" > "projection_gap"."occurrence_from")),
	CONSTRAINT "projection_gap_status_check" CHECK(("projection_gap"."status" = 'open' AND "projection_gap"."resolved_at" IS NULL) OR ("projection_gap"."status" = 'resolved' AND "projection_gap"."resolved_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `projection_gap_site_status_occurrence_idx` ON `projection_gap` (`site_id`,`status`,`occurrence_from`);--> statement-breakpoint
CREATE TABLE `site_tombstone` (
	`site_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`hostname` text NOT NULL,
	`purge_operation_id` text NOT NULL,
	`purged_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "site_tombstone_purge_time_check" CHECK("site_tombstone"."purged_at" >= "site_tombstone"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_tombstone_organization_hostname_unique` ON `site_tombstone` (`organization_id`,`hostname`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_retention_policy` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` text NOT NULL,
	`site_id` text,
	`scope` text NOT NULL,
	`event_months` integer NOT NULL,
	`profile_months` integer NOT NULL,
	`replay_months` integer,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`effective_from` integer NOT NULL,
	`effective_to` integer,
	`changed_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`installation_id`) REFERENCES `installation`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`changed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "retention_policy_scope_site_check" CHECK(("__new_retention_policy"."scope" = 'installation' AND "__new_retention_policy"."site_id" IS NULL) OR ("__new_retention_policy"."scope" = 'site' AND "__new_retention_policy"."site_id" IS NOT NULL)),
	CONSTRAINT "retention_policy_values_check" CHECK("__new_retention_policy"."event_months" > 0 AND "__new_retention_policy"."profile_months" > 0 AND "__new_retention_policy"."profile_months" <= "__new_retention_policy"."event_months" AND ("__new_retention_policy"."replay_months" IS NULL OR ("__new_retention_policy"."replay_months" > 0 AND "__new_retention_policy"."replay_months" < "__new_retention_policy"."event_months" AND "__new_retention_policy"."replay_months" < "__new_retention_policy"."profile_months")))
);
--> statement-breakpoint
INSERT INTO `__new_retention_policy`("id", "installation_id", "site_id", "scope", "event_months", "profile_months", "replay_months", "version", "status", "effective_from", "effective_to", "changed_by", "created_at", "updated_at") SELECT "id", "installation_id", "site_id", "scope", "event_months", "profile_months", "replay_months", "version", "status", "effective_from", "effective_to", "changed_by", "created_at", "updated_at" FROM `retention_policy`;--> statement-breakpoint
DROP TABLE `retention_policy`;--> statement-breakpoint
ALTER TABLE `__new_retention_policy` RENAME TO `retention_policy`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `retention_policy_installation_version_unique` ON `retention_policy` (`installation_id`,`version`) WHERE "retention_policy"."scope" = 'installation';--> statement-breakpoint
CREATE UNIQUE INDEX `retention_policy_site_version_unique` ON `retention_policy` (`installation_id`,`site_id`,`version`) WHERE "retention_policy"."scope" = 'site';--> statement-breakpoint
CREATE UNIQUE INDEX `retention_policy_current_installation_unique` ON `retention_policy` (`installation_id`) WHERE "retention_policy"."scope" = 'installation' AND "retention_policy"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX `retention_policy_current_site_unique` ON `retention_policy` (`installation_id`,`site_id`) WHERE "retention_policy"."scope" = 'site' AND "retention_policy"."status" = 'active';--> statement-breakpoint
CREATE INDEX `retention_policy_effective_idx` ON `retention_policy` (`installation_id`,`site_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `__new_installation` (
	`id` text PRIMARY KEY NOT NULL,
	`singleton_key` text DEFAULT 'default' NOT NULL,
	`status` text DEFAULT 'uninitialized' NOT NULL,
	`event_retention_months` integer DEFAULT 12 NOT NULL,
	`profile_retention_months` integer DEFAULT 12 NOT NULL,
	`replay_retention_months` integer,
	`data_directory_ready` integer DEFAULT false NOT NULL,
	`active_operation_id` text,
	`active_operation_kind` text,
	`active_operation_phase` text,
	`active_operation_progress` real,
	`active_operation_last_safe_sequence` integer,
	`active_operation_error_code` text,
	`cleanup_pending` integer DEFAULT false NOT NULL,
	`derived_cleanup_status` text DEFAULT 'not_applicable' NOT NULL,
	`derived_cleanup_started_at` integer,
	`derived_cleanup_completed_at` integer,
	`derived_cleanup_error_code` text,
	`backup_cleanup_status` text DEFAULT 'not_applicable' NOT NULL,
	`backup_cleanup_started_at` integer,
	`backup_cleanup_completed_at` integer,
	`backup_cleanup_error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "installation_singleton_key_check" CHECK("__new_installation"."singleton_key" = 'default'),
	CONSTRAINT "installation_retention_policy_check" CHECK("__new_installation"."event_retention_months" > 0 AND "__new_installation"."profile_retention_months" > 0 AND "__new_installation"."profile_retention_months" <= "__new_installation"."event_retention_months" AND ("__new_installation"."replay_retention_months" IS NULL OR ("__new_installation"."replay_retention_months" > 0 AND "__new_installation"."replay_retention_months" < "__new_installation"."event_retention_months" AND "__new_installation"."replay_retention_months" < "__new_installation"."profile_retention_months"))),
	CONSTRAINT "installation_cleanup_pending_check" CHECK("__new_installation"."cleanup_pending" = (("__new_installation"."derived_cleanup_status" NOT IN ('not_applicable', 'completed')) OR ("__new_installation"."backup_cleanup_status" NOT IN ('not_applicable', 'completed')))),
	CONSTRAINT "installation_cleanup_order_check" CHECK("__new_installation"."backup_cleanup_status" IN ('not_applicable', 'not_started', 'pending') OR "__new_installation"."derived_cleanup_status" = 'completed')
);
--> statement-breakpoint
INSERT INTO `__new_installation`("id", "singleton_key", "status", "event_retention_months", "profile_retention_months", "replay_retention_months", "data_directory_ready", "active_operation_id", "active_operation_kind", "active_operation_phase", "active_operation_progress", "active_operation_last_safe_sequence", "active_operation_error_code", "cleanup_pending", "derived_cleanup_status", "derived_cleanup_started_at", "derived_cleanup_completed_at", "derived_cleanup_error_code", "backup_cleanup_status", "backup_cleanup_started_at", "backup_cleanup_completed_at", "backup_cleanup_error_code", "created_at", "updated_at") SELECT "id", "singleton_key", "status", "event_retention_months", "profile_retention_months", "replay_retention_months", "data_directory_ready", "active_operation_id", "active_operation_kind", "active_operation_phase", "active_operation_progress", "active_operation_last_safe_sequence", "active_operation_error_code", "cleanup_pending", CASE WHEN "cleanup_pending" = 0 AND "derived_cleanup_status" = 'not_started' THEN 'not_applicable' ELSE "derived_cleanup_status" END, "derived_cleanup_started_at", "derived_cleanup_completed_at", "derived_cleanup_error_code", CASE WHEN "cleanup_pending" = 0 AND "backup_cleanup_status" = 'not_started' THEN 'not_applicable' ELSE "backup_cleanup_status" END, "backup_cleanup_started_at", "backup_cleanup_completed_at", "backup_cleanup_error_code", "created_at", "updated_at" FROM `installation`;--> statement-breakpoint
DROP TABLE `installation`;--> statement-breakpoint
ALTER TABLE `__new_installation` RENAME TO `installation`;--> statement-breakpoint
CREATE UNIQUE INDEX `installation_singleton_key_unique` ON `installation` (`singleton_key`);--> statement-breakpoint
CREATE INDEX `installation_status_updated_idx` ON `installation` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `__new_identity_redaction` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`identified_user_id` text NOT NULL,
	`profile_epoch` integer NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`requested_at` integer NOT NULL,
	`applied_at` integer,
	`derived_cleanup_status` text NOT NULL,
	`backup_cleanup_status` text NOT NULL,
	`derived_cleanup_updated_at` integer,
	`backup_cleanup_updated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`profile_id`) REFERENCES `identity_profile`(`profile_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`,`profile_epoch`) REFERENCES `identity_profile_epoch`(`profile_id`,`epoch`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_identity_redaction`("id", "site_id", "profile_id", "identified_user_id", "profile_epoch", "reason", "status", "requested_at", "applied_at", "derived_cleanup_status", "backup_cleanup_status", "derived_cleanup_updated_at", "backup_cleanup_updated_at", "created_at", "updated_at") SELECT "id", "site_id", (SELECT "profile_id" FROM "identity_profile" WHERE "identity_profile"."site_id" = "identity_redaction"."site_id" AND "identity_profile"."identified_user_id" = "identity_redaction"."identified_user_id" AND "identity_profile"."profile_epoch" = "identity_redaction"."profile_epoch" LIMIT 1), "identified_user_id", "profile_epoch", "reason", "status", "requested_at", "applied_at", "derived_cleanup_status", "backup_cleanup_status", "derived_cleanup_updated_at", "backup_cleanup_updated_at", "created_at", "updated_at" FROM `identity_redaction`;--> statement-breakpoint
DROP TABLE `identity_redaction`;--> statement-breakpoint
ALTER TABLE `__new_identity_redaction` RENAME TO `identity_redaction`;--> statement-breakpoint
CREATE UNIQUE INDEX `identity_redaction_profile_unique` ON `identity_redaction` (`site_id`,`identified_user_id`,`profile_epoch`);--> statement-breakpoint
CREATE INDEX `identity_redaction_status_idx` ON `identity_redaction` (`site_id`,`status`);--> statement-breakpoint
CREATE TABLE `__new_public_dashboard` (
	`site_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`public_identifier` text NOT NULL,
	`public_identifier_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`rotated_at` integer,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "public_dashboard_identifier_length_check" CHECK(length("__new_public_dashboard"."public_identifier") BETWEEN 1 AND 128)
);
--> statement-breakpoint
-- Legacy hashes cannot recover the prior public identifier; disable those dashboards until rotation issues a new one.
INSERT INTO `__new_public_dashboard`("site_id", "enabled", "public_identifier", "public_identifier_hash", "created_at", "updated_at", "rotated_at") SELECT "site_id", 0, 'legacy-' || "public_identifier_hash", "public_identifier_hash", "created_at", "updated_at", "rotated_at" FROM `public_dashboard`;--> statement-breakpoint
DROP TABLE `public_dashboard`;--> statement-breakpoint
ALTER TABLE `__new_public_dashboard` RENAME TO `public_dashboard`;--> statement-breakpoint
CREATE UNIQUE INDEX `public_dashboard_public_identifier_unique` ON `public_dashboard` (`public_identifier`);--> statement-breakpoint
CREATE UNIQUE INDEX `public_dashboard_public_identifier_hash_unique` ON `public_dashboard` (`public_identifier_hash`);--> statement-breakpoint
CREATE INDEX `public_dashboard_identifier_enabled_idx` ON `public_dashboard` (`public_identifier_hash`,`enabled`);--> statement-breakpoint
CREATE UNIQUE INDEX `accepted_event_acceptance_metadata_unique` ON `accepted_event` (`event_pk`,`replay_sequence`,`payload_fingerprint`,`receipt_time`,`policy_revision_id`);--> statement-breakpoint
CREATE TABLE `__new_identity_profile_epoch` (
	`profile_id` text NOT NULL,
	`site_id` text NOT NULL,
	`identified_user_id` text NOT NULL,
	`epoch` integer NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`redacted_at` integer,
	PRIMARY KEY(`profile_id`, `epoch`),
	FOREIGN KEY (`profile_id`) REFERENCES `identity_profile`(`profile_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "identity_profile_epoch_status_check" CHECK(("__new_identity_profile_epoch"."status" = 'active' AND "__new_identity_profile_epoch"."ended_at" IS NULL) OR ("__new_identity_profile_epoch"."status" = 'redacted' AND "__new_identity_profile_epoch"."ended_at" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_identity_profile_epoch`("profile_id", "site_id", "identified_user_id", "epoch", "status", "started_at", "ended_at", "redacted_at") SELECT "profile_id", "site_id", "identified_user_id", "epoch", "status", "started_at", "ended_at", "redacted_at" FROM `identity_profile_epoch`;--> statement-breakpoint
DROP TABLE `identity_profile_epoch`;--> statement-breakpoint
ALTER TABLE `__new_identity_profile_epoch` RENAME TO `identity_profile_epoch`;--> statement-breakpoint
CREATE UNIQUE INDEX `identity_profile_epoch_scope_unique` ON `identity_profile_epoch` (`site_id`,`identified_user_id`,`epoch`);--> statement-breakpoint
CREATE UNIQUE INDEX `identity_profile_epoch_site_profile_unique` ON `identity_profile_epoch` (`site_id`,`profile_id`,`epoch`);--> statement-breakpoint
CREATE UNIQUE INDEX `identity_profile_epoch_active_unique` ON `identity_profile_epoch` (`profile_id`) WHERE "identity_profile_epoch"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX `retention_cleanup_run_active_unique` ON `retention_cleanup_run` (`installation_id`) WHERE "retention_cleanup_run"."status" IN ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX `retention_cleanup_run_id_kind_unique` ON `retention_cleanup_run` (`id`,`cleanup_kind`);--> statement-breakpoint
CREATE TABLE `__new_backup_cleanup_stage` (
	`operation_id` text NOT NULL,
	`stage` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`error_code` text,
	PRIMARY KEY(`operation_id`, `stage`),
	FOREIGN KEY (`operation_id`) REFERENCES `backup_operation`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "backup_cleanup_stage_status_check" CHECK(("__new_backup_cleanup_stage"."status" IN ('not_applicable', 'not_started', 'pending') AND "__new_backup_cleanup_stage"."started_at" IS NULL AND "__new_backup_cleanup_stage"."completed_at" IS NULL AND "__new_backup_cleanup_stage"."error_code" IS NULL) OR ("__new_backup_cleanup_stage"."status" = 'running' AND "__new_backup_cleanup_stage"."started_at" IS NOT NULL AND "__new_backup_cleanup_stage"."completed_at" IS NULL AND "__new_backup_cleanup_stage"."error_code" IS NULL) OR ("__new_backup_cleanup_stage"."status" = 'completed' AND "__new_backup_cleanup_stage"."started_at" IS NOT NULL AND "__new_backup_cleanup_stage"."completed_at" IS NOT NULL AND "__new_backup_cleanup_stage"."error_code" IS NULL) OR ("__new_backup_cleanup_stage"."status" = 'failed' AND "__new_backup_cleanup_stage"."started_at" IS NOT NULL AND "__new_backup_cleanup_stage"."completed_at" IS NOT NULL AND "__new_backup_cleanup_stage"."error_code" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_backup_cleanup_stage`("operation_id", "stage", "status", "started_at", "completed_at", "error_code") SELECT "operation_id", "stage", "status", "started_at", "completed_at", "error_code" FROM `backup_cleanup_stage`;--> statement-breakpoint
DROP TABLE `backup_cleanup_stage`;--> statement-breakpoint
ALTER TABLE `__new_backup_cleanup_stage` RENAME TO `backup_cleanup_stage`;--> statement-breakpoint
CREATE TABLE `__new_backup_operation` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_type` text NOT NULL,
	`status` text NOT NULL,
	`scope` text DEFAULT 'installation' NOT NULL,
	`phase` text NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`checkpoint` text NOT NULL,
	`last_safe_sequence` integer,
	`control_readiness` text NOT NULL,
	`analytics_readiness` text NOT NULL,
	`structural_readiness` text NOT NULL,
	`cleanup_pending` integer DEFAULT false NOT NULL,
	`restore_source_backup_id` text,
	`pre_restore_safety_artifact_id` text,
	`error_code` text,
	`recovery_key` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT "backup_operation_progress_check" CHECK("__new_backup_operation"."progress" >= 0 AND "__new_backup_operation"."progress" <= 1)
);
--> statement-breakpoint
INSERT INTO `__new_backup_operation`("id", "operation_type", "status", "scope", "phase", "progress", "checkpoint", "last_safe_sequence", "control_readiness", "analytics_readiness", "structural_readiness", "cleanup_pending", "restore_source_backup_id", "pre_restore_safety_artifact_id", "error_code", "recovery_key", "created_at", "started_at", "completed_at", "updated_at") SELECT "id", "operation_type", "status", "scope", "phase", "progress", "checkpoint", "last_safe_sequence", "control_readiness", "analytics_readiness", "structural_readiness", "cleanup_pending", "restore_source_backup_id", "pre_restore_safety_artifact_id", "error_code", "recovery_key", "created_at", "started_at", "completed_at", "updated_at" FROM `backup_operation`;--> statement-breakpoint
DROP TABLE `backup_operation`;--> statement-breakpoint
ALTER TABLE `__new_backup_operation` RENAME TO `backup_operation`;--> statement-breakpoint
CREATE UNIQUE INDEX `backup_operation_recovery_key_unique` ON `backup_operation` (`recovery_key`);--> statement-breakpoint
CREATE INDEX `backup_operation_scope_created_idx` ON `backup_operation` (`scope`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `backup_operation_status_phase_idx` ON `backup_operation` (`status`,`phase`);--> statement-breakpoint
CREATE UNIQUE INDEX `backup_operation_active_unique` ON `backup_operation` (`scope`) WHERE "backup_operation"."status" IN ('creating', 'restoring');--> statement-breakpoint
CREATE TABLE `__new_cohort` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`identity_kind` text NOT NULL,
	`period` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "cohort_current_version_check" CHECK("__new_cohort"."current_version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_cohort`("id", "site_id", "name", "identity_kind", "period", "status", "current_version", "created_at", "updated_at") SELECT "id", "site_id", "name", "identity_kind", "period", "status", "current_version", "created_at", "updated_at" FROM `cohort`;--> statement-breakpoint
DROP TABLE `cohort`;--> statement-breakpoint
ALTER TABLE `__new_cohort` RENAME TO `cohort`;--> statement-breakpoint
CREATE INDEX `cohort_site_status_created_idx` ON `cohort` (`site_id`,`status`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `__new_cohort_version` (
	`id` text PRIMARY KEY NOT NULL,
	`cohort_id` text NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`entry_action_json` text NOT NULL,
	`retention_action_json` text NOT NULL,
	`identity_kind` text NOT NULL,
	`period` text NOT NULL,
	`effective_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`cohort_id`) REFERENCES `cohort`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cohort_version_number_check" CHECK("__new_cohort_version"."version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_cohort_version`("id", "cohort_id", "version", "name", "entry_action_json", "retention_action_json", "identity_kind", "period", "effective_at", "created_at") SELECT "id", "cohort_id", "version", "name", "entry_action_json", "retention_action_json", "identity_kind", "period", "effective_at", "created_at" FROM `cohort_version`;--> statement-breakpoint
DROP TABLE `cohort_version`;--> statement-breakpoint
ALTER TABLE `__new_cohort_version` RENAME TO `cohort_version`;--> statement-breakpoint
CREATE UNIQUE INDEX `cohort_version_unique` ON `cohort_version` (`cohort_id`,`version`);--> statement-breakpoint
CREATE INDEX `cohort_version_effective_idx` ON `cohort_version` (`cohort_id`,`effective_at`);--> statement-breakpoint
CREATE TABLE `__new_collection_policy_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` text NOT NULL,
	`scope` text NOT NULL,
	`site_id` text,
	`version` integer NOT NULL,
	`policy_json` text NOT NULL,
	`effective_from` integer NOT NULL,
	`effective_to` integer,
	`committed_at` integer NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`installation_id`) REFERENCES `installation`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "collection_policy_scope_site_check" CHECK(("__new_collection_policy_revision"."scope" = 'installation' AND "__new_collection_policy_revision"."site_id" IS NULL) OR ("__new_collection_policy_revision"."scope" = 'site' AND "__new_collection_policy_revision"."site_id" IS NOT NULL)),
	CONSTRAINT "collection_policy_effective_interval_check" CHECK("__new_collection_policy_revision"."effective_to" IS NULL OR "__new_collection_policy_revision"."effective_to" > "__new_collection_policy_revision"."effective_from")
);
--> statement-breakpoint
INSERT INTO `__new_collection_policy_revision`("id", "installation_id", "scope", "site_id", "version", "policy_json", "effective_from", "effective_to", "committed_at", "created_by", "created_at") SELECT "id", "installation_id", "scope", "site_id", "version", "policy_json", "effective_from", "effective_to", "committed_at", "created_by", "created_at" FROM `collection_policy_revision`;--> statement-breakpoint
DROP TABLE `collection_policy_revision`;--> statement-breakpoint
ALTER TABLE `__new_collection_policy_revision` RENAME TO `collection_policy_revision`;--> statement-breakpoint
CREATE UNIQUE INDEX `collection_policy_installation_version_unique` ON `collection_policy_revision` (`installation_id`,`version`) WHERE "collection_policy_revision"."scope" = 'installation';--> statement-breakpoint
CREATE UNIQUE INDEX `collection_policy_site_version_unique` ON `collection_policy_revision` (`installation_id`,`site_id`,`version`) WHERE "collection_policy_revision"."scope" = 'site';--> statement-breakpoint
CREATE UNIQUE INDEX `collection_policy_current_installation_unique` ON `collection_policy_revision` (`installation_id`) WHERE "collection_policy_revision"."scope" = 'installation' AND "collection_policy_revision"."effective_to" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `collection_policy_current_site_unique` ON `collection_policy_revision` (`installation_id`,`site_id`) WHERE "collection_policy_revision"."scope" = 'site' AND "collection_policy_revision"."effective_to" IS NULL;--> statement-breakpoint
CREATE INDEX `collection_policy_target_effective_idx` ON `collection_policy_revision` (`installation_id`,`site_id`,`effective_to`);--> statement-breakpoint
CREATE TABLE `__new_funnel` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`identity_kind` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "funnel_current_version_check" CHECK("__new_funnel"."current_version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_funnel`("id", "site_id", "name", "identity_kind", "status", "current_version", "created_at", "updated_at") SELECT "id", "site_id", "name", "identity_kind", "status", "current_version", "created_at", "updated_at" FROM `funnel`;--> statement-breakpoint
DROP TABLE `funnel`;--> statement-breakpoint
ALTER TABLE `__new_funnel` RENAME TO `funnel`;--> statement-breakpoint
CREATE INDEX `funnel_site_status_created_idx` ON `funnel` (`site_id`,`status`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `__new_funnel_version` (
	`id` text PRIMARY KEY NOT NULL,
	`funnel_id` text NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`steps_json` text NOT NULL,
	`identity_kind` text NOT NULL,
	`effective_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`funnel_id`) REFERENCES `funnel`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "funnel_version_number_check" CHECK("__new_funnel_version"."version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_funnel_version`("id", "funnel_id", "version", "name", "steps_json", "identity_kind", "effective_at", "created_at") SELECT "id", "funnel_id", "version", "name", "steps_json", "identity_kind", "effective_at", "created_at" FROM `funnel_version`;--> statement-breakpoint
DROP TABLE `funnel_version`;--> statement-breakpoint
ALTER TABLE `__new_funnel_version` RENAME TO `funnel_version`;--> statement-breakpoint
CREATE UNIQUE INDEX `funnel_version_unique` ON `funnel_version` (`funnel_id`,`version`);--> statement-breakpoint
CREATE INDEX `funnel_version_effective_idx` ON `funnel_version` (`funnel_id`,`effective_at`);--> statement-breakpoint
CREATE TABLE `__new_goal` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`action_json` text NOT NULL,
	`property_filters_json` text,
	`identity_kind` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "goal_current_version_check" CHECK("__new_goal"."current_version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_goal`("id", "site_id", "name", "action_json", "property_filters_json", "identity_kind", "status", "current_version", "created_at", "updated_at") SELECT "id", "site_id", "name", "action_json", "property_filters_json", "identity_kind", "status", "current_version", "created_at", "updated_at" FROM `goal`;--> statement-breakpoint
DROP TABLE `goal`;--> statement-breakpoint
ALTER TABLE `__new_goal` RENAME TO `goal`;--> statement-breakpoint
CREATE INDEX `goal_site_status_created_idx` ON `goal` (`site_id`,`status`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `__new_goal_version` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`action_json` text NOT NULL,
	`property_filters_json` text,
	`identity_kind` text NOT NULL,
	`effective_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goal`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "goal_version_number_check" CHECK("__new_goal_version"."version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_goal_version`("id", "goal_id", "version", "name", "action_json", "property_filters_json", "identity_kind", "effective_at", "created_at") SELECT "id", "goal_id", "version", "name", "action_json", "property_filters_json", "identity_kind", "effective_at", "created_at" FROM `goal_version`;--> statement-breakpoint
DROP TABLE `goal_version`;--> statement-breakpoint
ALTER TABLE `__new_goal_version` RENAME TO `goal_version`;--> statement-breakpoint
CREATE UNIQUE INDEX `goal_version_unique` ON `goal_version` (`goal_id`,`version`);--> statement-breakpoint
CREATE INDEX `goal_version_effective_idx` ON `goal_version` (`goal_id`,`effective_at`);--> statement-breakpoint
CREATE TABLE `__new_identity_profile` (
	`profile_id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`identified_user_id` text NOT NULL,
	`status` text NOT NULL,
	`profile_epoch` integer,
	`traits` text,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "identity_profile_active_epoch_check" CHECK("__new_identity_profile"."status" <> 'active' OR "__new_identity_profile"."profile_epoch" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_identity_profile`("profile_id", "site_id", "identified_user_id", "status", "profile_epoch", "traits", "first_seen_at", "last_seen_at", "created_at", "updated_at") SELECT "profile_id", "site_id", "identified_user_id", "status", "profile_epoch", "traits", "first_seen_at", "last_seen_at", "created_at", "updated_at" FROM `identity_profile`;--> statement-breakpoint
DROP TABLE `identity_profile`;--> statement-breakpoint
ALTER TABLE `__new_identity_profile` RENAME TO `identity_profile`;--> statement-breakpoint
CREATE UNIQUE INDEX `identity_profile_active_unique` ON `identity_profile` (`site_id`,`identified_user_id`) WHERE "identity_profile"."status" = 'active';--> statement-breakpoint
CREATE INDEX `identity_profile_site_status_created_idx` ON `identity_profile` (`site_id`,`status`,`created_at`,`identified_user_id`);--> statement-breakpoint
CREATE TABLE `__new_invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`accepted_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "invitation_role_check" CHECK("__new_invitation"."role" IN ('admin', 'member'))
);
--> statement-breakpoint
INSERT INTO `__new_invitation`("id", "organization_id", "role", "token_hash", "expires_at", "status", "accepted_at", "revoked_at", "created_at", "updated_at") SELECT "id", "organization_id", "role", "token_hash", "expires_at", "status", "accepted_at", "revoked_at", "created_at", "updated_at" FROM `invitation`;--> statement-breakpoint
DROP TABLE `invitation`;--> statement-breakpoint
ALTER TABLE `__new_invitation` RENAME TO `invitation`;--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_token_hash_unique` ON `invitation` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitation_organization_created_idx` ON `invitation` (`organization_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `invitation_organization_status_idx` ON `invitation` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `invitation_expiry_idx` ON `invitation` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `__new_membership` (
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `user_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "membership_role_check" CHECK("__new_membership"."role" IN ('owner', 'admin', 'member'))
);
--> statement-breakpoint
INSERT INTO `__new_membership`("organization_id", "user_id", "role", "created_at", "updated_at") SELECT "organization_id", "user_id", "role", "created_at", "updated_at" FROM `membership`;--> statement-breakpoint
DROP TABLE `membership`;--> statement-breakpoint
ALTER TABLE `__new_membership` RENAME TO `membership`;--> statement-breakpoint
CREATE UNIQUE INDEX `membership_one_owner_unique` ON `membership` (`organization_id`) WHERE "membership"."role" = 'owner';--> statement-breakpoint
CREATE INDEX `membership_organization_created_idx` ON `membership` (`organization_id`,`created_at`,`user_id`);--> statement-breakpoint
CREATE INDEX `membership_user_organization_idx` ON `membership` (`user_id`,`organization_id`);--> statement-breakpoint
CREATE TABLE `__new_event_acceptance_journal` (
	`event_pk` integer PRIMARY KEY NOT NULL,
	`replay_sequence` integer NOT NULL,
	`payload_fingerprint` text NOT NULL,
	`receipt_time` integer NOT NULL,
	`policy_revision_id` text NOT NULL,
	`acceptance_state` text DEFAULT 'accepted' NOT NULL,
	`projection_state` text DEFAULT 'pending' NOT NULL,
	`committed_at` integer NOT NULL,
	`flush_id` text,
	FOREIGN KEY (`event_pk`) REFERENCES `accepted_event`(`event_pk`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`policy_revision_id`) REFERENCES `collection_policy_revision`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`event_pk`,`replay_sequence`,`payload_fingerprint`,`receipt_time`,`policy_revision_id`) REFERENCES `accepted_event`(`event_pk`,`replay_sequence`,`payload_fingerprint`,`receipt_time`,`policy_revision_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_event_acceptance_journal`("event_pk", "replay_sequence", "payload_fingerprint", "receipt_time", "policy_revision_id", "acceptance_state", "projection_state", "committed_at", "flush_id") SELECT "event_pk", "replay_sequence", "payload_fingerprint", "receipt_time", "policy_revision_id", "acceptance_state", "projection_state", "committed_at", "flush_id" FROM `event_acceptance_journal`;--> statement-breakpoint
DROP TABLE `event_acceptance_journal`;--> statement-breakpoint
ALTER TABLE `__new_event_acceptance_journal` RENAME TO `event_acceptance_journal`;--> statement-breakpoint
CREATE UNIQUE INDEX `event_acceptance_journal_replay_sequence_unique` ON `event_acceptance_journal` (`replay_sequence`);--> statement-breakpoint
CREATE INDEX `event_acceptance_projection_sequence_idx` ON `event_acceptance_journal` (`projection_state`,`replay_sequence`);--> statement-breakpoint
CREATE TABLE `__new_identity_link` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`profile_epoch` integer NOT NULL,
	`anonymous_identity_id` text NOT NULL,
	`analytics_session_id` text,
	`effective_from` integer NOT NULL,
	`linked_at` integer NOT NULL,
	`unlinked_at` integer,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`profile_id`) REFERENCES `identity_profile`(`profile_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`,`profile_id`,`profile_epoch`) REFERENCES `identity_profile_epoch`(`site_id`,`profile_id`,`epoch`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_identity_link`("id", "site_id", "profile_id", "profile_epoch", "anonymous_identity_id", "analytics_session_id", "effective_from", "linked_at", "unlinked_at") SELECT "id", "site_id", "profile_id", "profile_epoch", "anonymous_identity_id", "analytics_session_id", "effective_from", "linked_at", "unlinked_at" FROM `identity_link`;--> statement-breakpoint
DROP TABLE `identity_link`;--> statement-breakpoint
ALTER TABLE `__new_identity_link` RENAME TO `identity_link`;--> statement-breakpoint
CREATE UNIQUE INDEX `identity_link_current_alias_unique` ON `identity_link` (`site_id`,`anonymous_identity_id`) WHERE "identity_link"."unlinked_at" IS NULL;--> statement-breakpoint
CREATE INDEX `identity_link_profile_epoch_idx` ON `identity_link` (`site_id`,`profile_id`,`profile_epoch`);--> statement-breakpoint
CREATE INDEX `identity_link_session_idx` ON `identity_link` (`site_id`,`analytics_session_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `__new_retention_cleanup_checkpoint` (
	`id` text PRIMARY KEY NOT NULL,
	`cleanup_run_id` text NOT NULL,
	`data_class` text NOT NULL,
	`stage` text NOT NULL,
	`cursor` text,
	`processed_through` integer,
	`status` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`cleanup_run_id`) REFERENCES `retention_cleanup_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cleanup_run_id`,`stage`) REFERENCES `retention_cleanup_run`(`id`,`cleanup_kind`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_retention_cleanup_checkpoint`("id", "cleanup_run_id", "data_class", "stage", "cursor", "processed_through", "status", "updated_at") SELECT "id", "cleanup_run_id", "data_class", "stage", "cursor", "processed_through", "status", "updated_at" FROM `retention_cleanup_checkpoint`;--> statement-breakpoint
DROP TABLE `retention_cleanup_checkpoint`;--> statement-breakpoint
ALTER TABLE `__new_retention_cleanup_checkpoint` RENAME TO `retention_cleanup_checkpoint`;--> statement-breakpoint
CREATE UNIQUE INDEX `retention_cleanup_checkpoint_unique` ON `retention_cleanup_checkpoint` (`cleanup_run_id`,`stage`,`data_class`);--> statement-breakpoint
CREATE INDEX `retention_cleanup_checkpoint_status_idx` ON `retention_cleanup_checkpoint` (`cleanup_run_id`,`status`);
