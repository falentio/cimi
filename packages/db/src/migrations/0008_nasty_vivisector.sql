CREATE TABLE `retention_effective_cutoff` (
	`site_id` text PRIMARY KEY NOT NULL,
	`installation_id` text NOT NULL,
	`policy_id` text NOT NULL,
	`reporting_timezone` text NOT NULL,
	`local_day` text NOT NULL,
	`event_occurrence_cutoff_at` integer NOT NULL,
	`raw_receipt_cutoff_at` integer NOT NULL,
	`profile_activity_cutoff_at` integer NOT NULL,
	`replay_receipt_cutoff_at` integer,
	`effective_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`installation_id`) REFERENCES `installation`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`policy_id`) REFERENCES `retention_policy`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "retention_effective_cutoff_local_day_check" CHECK(length("retention_effective_cutoff"."local_day") = 10 AND "retention_effective_cutoff"."local_day" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `retention_effective_cutoff_installation_idx` ON `retention_effective_cutoff` (`installation_id`);