CREATE TABLE `accepted_event` (
	`event_pk` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text NOT NULL,
	`event_id` text NOT NULL,
	`event_kind` text NOT NULL,
	`occurrence_time` integer NOT NULL,
	`receipt_time` integer NOT NULL,
	`late` integer DEFAULT false NOT NULL,
	`visitor_id` text,
	`identified_user_id` text,
	`analytics_session_id` text,
	`policy_revision_id` text NOT NULL,
	`replay_sequence` integer NOT NULL,
	`payload_fingerprint` text NOT NULL,
	`projection_state` text DEFAULT 'pending' NOT NULL,
	`projected_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`policy_revision_id`) REFERENCES `collection_policy_revision`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accepted_event_replay_sequence_unique` ON `accepted_event` (`replay_sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `accepted_event_site_event_unique` ON `accepted_event` (`site_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `accepted_event_site_occurrence_idx` ON `accepted_event` (`site_id`,`occurrence_time`);--> statement-breakpoint
CREATE INDEX `accepted_event_site_receipt_idx` ON `accepted_event` (`site_id`,`receipt_time`);--> statement-breakpoint
CREATE INDEX `accepted_event_identity_idx` ON `accepted_event` (`site_id`,`visitor_id`,`identified_user_id`);--> statement-breakpoint
CREATE INDEX `accepted_event_session_idx` ON `accepted_event` (`site_id`,`analytics_session_id`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`issuer` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `backup_artifact` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`generation_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`schema_version` text NOT NULL,
	`retention_boundary` integer,
	`acceptance_sequence` integer,
	`size_bytes` integer NOT NULL,
	`checksum_algorithm` text NOT NULL,
	`checksum_value` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`operation_id`) REFERENCES `backup_operation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backup_artifact_operation_type_unique` ON `backup_artifact` (`operation_id`,`artifact_type`);--> statement-breakpoint
CREATE INDEX `backup_artifact_generation_idx` ON `backup_artifact` (`generation_id`);--> statement-breakpoint
CREATE TABLE `backup_cleanup_stage` (
	`operation_id` text NOT NULL,
	`stage` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`error_code` text,
	PRIMARY KEY(`operation_id`, `stage`),
	FOREIGN KEY (`operation_id`) REFERENCES `backup_operation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `backup_operation` (
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
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backup_operation_recovery_key_unique` ON `backup_operation` (`recovery_key`);--> statement-breakpoint
CREATE INDEX `backup_operation_scope_created_idx` ON `backup_operation` (`scope`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `backup_operation_status_phase_idx` ON `backup_operation` (`status`,`phase`);--> statement-breakpoint
CREATE UNIQUE INDEX `backup_operation_active_unique` ON `backup_operation` (`scope`) WHERE "backup_operation"."status" IN ('creating', 'restoring');--> statement-breakpoint
CREATE TABLE `cohort` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`identity_kind` text NOT NULL,
	`period` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `cohort_site_status_created_idx` ON `cohort` (`site_id`,`status`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `cohort_version` (
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
	FOREIGN KEY (`cohort_id`) REFERENCES `cohort`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cohort_version_unique` ON `cohort_version` (`cohort_id`,`version`);--> statement-breakpoint
CREATE INDEX `cohort_version_effective_idx` ON `cohort_version` (`cohort_id`,`effective_at`);--> statement-breakpoint
CREATE TABLE `collection_policy_revision` (
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
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_policy_installation_version_unique` ON `collection_policy_revision` (`installation_id`,`version`) WHERE "collection_policy_revision"."scope" = 'installation';--> statement-breakpoint
CREATE UNIQUE INDEX `collection_policy_site_version_unique` ON `collection_policy_revision` (`installation_id`,`site_id`,`version`) WHERE "collection_policy_revision"."scope" = 'site';--> statement-breakpoint
CREATE UNIQUE INDEX `collection_policy_current_installation_unique` ON `collection_policy_revision` (`installation_id`) WHERE "collection_policy_revision"."scope" = 'installation' AND "collection_policy_revision"."effective_to" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `collection_policy_current_site_unique` ON `collection_policy_revision` (`installation_id`,`site_id`) WHERE "collection_policy_revision"."scope" = 'site' AND "collection_policy_revision"."effective_to" IS NULL;--> statement-breakpoint
CREATE INDEX `collection_policy_target_effective_idx` ON `collection_policy_revision` (`installation_id`,`site_id`,`effective_to`);--> statement-breakpoint
CREATE TABLE `event_acceptance_journal` (
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
	FOREIGN KEY (`policy_revision_id`) REFERENCES `collection_policy_revision`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_acceptance_journal_replay_sequence_unique` ON `event_acceptance_journal` (`replay_sequence`);--> statement-breakpoint
CREATE INDEX `event_acceptance_projection_sequence_idx` ON `event_acceptance_journal` (`projection_state`,`replay_sequence`);--> statement-breakpoint
CREATE TABLE `event_custom` (
	`event_pk` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`event_pk`) REFERENCES `accepted_event`(`event_pk`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `event_error` (
	`event_pk` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`message` text,
	FOREIGN KEY (`event_pk`) REFERENCES `accepted_event`(`event_pk`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `event_outbound` (
	`event_pk` integer PRIMARY KEY NOT NULL,
	`destination` text NOT NULL,
	`name` text,
	FOREIGN KEY (`event_pk`) REFERENCES `accepted_event`(`event_pk`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `event_page_view` (
	`event_pk` integer PRIMARY KEY NOT NULL,
	`page_path` text NOT NULL,
	`referrer` text,
	FOREIGN KEY (`event_pk`) REFERENCES `accepted_event`(`event_pk`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `event_payload` (
	`event_pk` integer PRIMARY KEY NOT NULL,
	`canonical_payload_json` text NOT NULL,
	FOREIGN KEY (`event_pk`) REFERENCES `accepted_event`(`event_pk`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `event_performance` (
	`event_pk` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`value` real NOT NULL,
	`unit` text,
	FOREIGN KEY (`event_pk`) REFERENCES `accepted_event`(`event_pk`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `event_property` (
	`event_pk` integer NOT NULL,
	`property_key` text NOT NULL,
	`value_type` text NOT NULL,
	`string_value` text,
	`number_value` real,
	`boolean_value` integer,
	PRIMARY KEY(`event_pk`, `property_key`),
	FOREIGN KEY (`event_pk`) REFERENCES `accepted_event`(`event_pk`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_property_key_idx` ON `event_property` (`property_key`);--> statement-breakpoint
CREATE TABLE `funnel` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`identity_kind` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `funnel_site_status_created_idx` ON `funnel` (`site_id`,`status`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `funnel_version` (
	`id` text PRIMARY KEY NOT NULL,
	`funnel_id` text NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`steps_json` text NOT NULL,
	`identity_kind` text NOT NULL,
	`effective_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`funnel_id`) REFERENCES `funnel`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `funnel_version_unique` ON `funnel_version` (`funnel_id`,`version`);--> statement-breakpoint
CREATE INDEX `funnel_version_effective_idx` ON `funnel_version` (`funnel_id`,`effective_at`);--> statement-breakpoint
CREATE TABLE `goal` (
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
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `goal_site_status_created_idx` ON `goal` (`site_id`,`status`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `goal_version` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`action_json` text NOT NULL,
	`property_filters_json` text,
	`identity_kind` text NOT NULL,
	`effective_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goal`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goal_version_unique` ON `goal_version` (`goal_id`,`version`);--> statement-breakpoint
CREATE INDEX `goal_version_effective_idx` ON `goal_version` (`goal_id`,`effective_at`);--> statement-breakpoint
CREATE TABLE `identity_link` (
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
	FOREIGN KEY (`profile_id`) REFERENCES `identity_profile`(`profile_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_link_current_alias_unique` ON `identity_link` (`site_id`,`anonymous_identity_id`) WHERE "identity_link"."unlinked_at" IS NULL;--> statement-breakpoint
CREATE INDEX `identity_link_profile_epoch_idx` ON `identity_link` (`site_id`,`profile_id`,`profile_epoch`);--> statement-breakpoint
CREATE INDEX `identity_link_session_idx` ON `identity_link` (`site_id`,`analytics_session_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `identity_profile` (
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
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_profile_active_unique` ON `identity_profile` (`site_id`,`identified_user_id`) WHERE "identity_profile"."status" = 'active';--> statement-breakpoint
CREATE INDEX `identity_profile_site_status_created_idx` ON `identity_profile` (`site_id`,`status`,`created_at`,`identified_user_id`);--> statement-breakpoint
CREATE TABLE `identity_profile_epoch` (
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
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_profile_epoch_scope_unique` ON `identity_profile_epoch` (`site_id`,`identified_user_id`,`epoch`);--> statement-breakpoint
CREATE TABLE `identity_redaction` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
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
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_redaction_profile_unique` ON `identity_redaction` (`site_id`,`identified_user_id`,`profile_epoch`);--> statement-breakpoint
CREATE INDEX `identity_redaction_status_idx` ON `identity_redaction` (`site_id`,`status`);--> statement-breakpoint
CREATE TABLE `installation` (
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
	`derived_cleanup_status` text DEFAULT 'not_started' NOT NULL,
	`derived_cleanup_started_at` integer,
	`derived_cleanup_completed_at` integer,
	`derived_cleanup_error_code` text,
	`backup_cleanup_status` text DEFAULT 'not_started' NOT NULL,
	`backup_cleanup_started_at` integer,
	`backup_cleanup_completed_at` integer,
	`backup_cleanup_error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `installation_singleton_key_unique` ON `installation` (`singleton_key`);--> statement-breakpoint
CREATE INDEX `installation_status_updated_idx` ON `installation` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `invitation` (
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
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_token_hash_unique` ON `invitation` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitation_organization_created_idx` ON `invitation` (`organization_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `invitation_organization_status_idx` ON `invitation` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `invitation_expiry_idx` ON `invitation` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `membership` (
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `user_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_one_owner_unique` ON `membership` (`organization_id`) WHERE "membership"."role" = 'owner';--> statement-breakpoint
CREATE INDEX `membership_organization_created_idx` ON `membership` (`organization_id`,`created_at`,`user_id`);--> statement-breakpoint
CREATE INDEX `membership_user_organization_idx` ON `membership` (`user_id`,`organization_id`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`is_personal` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `organization_owner_idx` ON `organization` (`owner_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_personal_owner_unique` ON `organization` (`owner_user_id`) WHERE "organization"."is_personal" = 1;--> statement-breakpoint
CREATE INDEX `organization_created_idx` ON `organization` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `public_dashboard` (
	`site_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`public_identifier_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`rotated_at` integer,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `public_dashboard_public_identifier_hash_unique` ON `public_dashboard` (`public_identifier_hash`);--> statement-breakpoint
CREATE INDEX `public_dashboard_identifier_enabled_idx` ON `public_dashboard` (`public_identifier_hash`,`enabled`);--> statement-breakpoint
CREATE TABLE `retention_cleanup_checkpoint` (
	`id` text PRIMARY KEY NOT NULL,
	`cleanup_run_id` text NOT NULL,
	`data_class` text NOT NULL,
	`stage` text NOT NULL,
	`cursor` text,
	`processed_through` integer,
	`status` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`cleanup_run_id`) REFERENCES `retention_cleanup_run`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `retention_cleanup_checkpoint_unique` ON `retention_cleanup_checkpoint` (`cleanup_run_id`,`stage`,`data_class`);--> statement-breakpoint
CREATE INDEX `retention_cleanup_checkpoint_status_idx` ON `retention_cleanup_checkpoint` (`cleanup_run_id`,`status`);--> statement-breakpoint
CREATE TABLE `retention_cleanup_run` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` text NOT NULL,
	`site_id` text,
	`policy_id` text NOT NULL,
	`cleanup_kind` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`cutoff_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`installation_id`) REFERENCES `installation`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`policy_id`) REFERENCES `retention_policy`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `retention_cleanup_run_status_idx` ON `retention_cleanup_run` (`installation_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `retention_policy` (
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
	FOREIGN KEY (`changed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `retention_policy_version_unique` ON `retention_policy` (`installation_id`,`site_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `retention_policy_current_installation_unique` ON `retention_policy` (`installation_id`) WHERE "retention_policy"."scope" = 'installation' AND "retention_policy"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX `retention_policy_current_site_unique` ON `retention_policy` (`installation_id`,`site_id`) WHERE "retention_policy"."scope" = 'site' AND "retention_policy"."status" = 'active';--> statement-breakpoint
CREATE INDEX `retention_policy_effective_idx` ON `retention_policy` (`installation_id`,`site_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `site` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`hostname` text NOT NULL,
	`ingestion_identifier` text NOT NULL,
	`reporting_timezone` text DEFAULT 'UTC' NOT NULL,
	`week_starts_on` text DEFAULT 'monday' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`delete_requested_at` integer,
	`deleted_at` integer,
	`recovery_deadline` integer,
	`purge_at` integer,
	`purged_at` integer,
	`current_operation_id` text,
	`cleanup_status` text DEFAULT 'not-required' NOT NULL,
	`cleanup_updated_at` integer,
	`cleanup_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_ingestion_identifier_unique` ON `site` (`ingestion_identifier`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_organization_hostname_unique` ON `site` (`organization_id`,`hostname`);--> statement-breakpoint
CREATE INDEX `site_organization_status_created_idx` ON `site` (`organization_id`,`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `site_status_recovery_idx` ON `site` (`status`,`recovery_deadline`);--> statement-breakpoint
CREATE TABLE `site_lifecycle_operation` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`operation_type` text NOT NULL,
	`status` text NOT NULL,
	`requested_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`error_summary` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_lifecycle_operation_site_status_idx` ON `site_lifecycle_operation` (`site_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_lifecycle_operation_active_unique` ON `site_lifecycle_operation` (`site_id`) WHERE "site_lifecycle_operation"."status" IN ('pending', 'running');--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`image` text,
	`role` text,
	`banned` integer,
	`ban_reason` text,
	`ban_expires` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
