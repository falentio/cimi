CREATE TABLE `organization_repair_operation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`local_organization_id` text NOT NULL,
	`operation_type` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`authority_organization_id` text,
	`authority_slug` text,
	`previous_name` text,
	`desired_name` text NOT NULL,
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
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "organization_repair_operation_attempt_count_check" CHECK("organization_repair_operation"."attempt_count" >= 0),
	CONSTRAINT "organization_repair_operation_shape_check" CHECK((
        ("organization_repair_operation"."operation_type" = 'create-organization' AND "organization_repair_operation"."authority_slug" IS NOT NULL AND "organization_repair_operation"."previous_name" IS NULL)
        OR
        ("organization_repair_operation"."operation_type" = 'update-organization' AND "organization_repair_operation"."organization_id" IS NOT NULL AND "organization_repair_operation"."authority_organization_id" IS NOT NULL AND "organization_repair_operation"."authority_slug" IS NULL AND "organization_repair_operation"."previous_name" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE INDEX `organization_repair_operation_organization_status_idx` ON `organization_repair_operation` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `organization_repair_operation_local_status_idx` ON `organization_repair_operation` (`local_organization_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_repair_operation_create_active_unique` ON `organization_repair_operation` (`owner_user_id`) WHERE "organization_repair_operation"."operation_type" = 'create-organization' AND "organization_repair_operation"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `organization_repair_operation_update_active_unique` ON `organization_repair_operation` (`organization_id`) WHERE "organization_repair_operation"."operation_type" = 'update-organization' AND "organization_repair_operation"."status" = 'pending';