CREATE TABLE `organization_governance_operation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`operation_type` text NOT NULL,
	`previous_owner_user_id` text NOT NULL,
	`target_user_id` text NOT NULL,
	`status` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`requested_at` integer NOT NULL,
	`last_attempt_at` integer,
	`completed_at` integer,
	`failure_code` text,
	`failure_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`previous_owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`target_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "organization_governance_operation_attempt_count_check" CHECK("organization_governance_operation"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `organization_governance_operation_organization_status_idx` ON `organization_governance_operation` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_governance_operation_active_unique` ON `organization_governance_operation` (`organization_id`) WHERE "organization_governance_operation"."status" = 'pending';