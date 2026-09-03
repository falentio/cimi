PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_organization_governance_operation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`operation_type` text NOT NULL,
	`previous_owner_user_id` text NOT NULL,
	`target_user_id` text NOT NULL,
	`target_role` text,
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
	CONSTRAINT "organization_governance_operation_attempt_count_check" CHECK("__new_organization_governance_operation"."attempt_count" >= 0),
	CONSTRAINT "organization_governance_operation_target_role_check" CHECK((
        ("__new_organization_governance_operation"."operation_type" = 'change-member-role' AND "__new_organization_governance_operation"."target_role" IS NOT NULL AND "__new_organization_governance_operation"."target_role" IN ('admin', 'member'))
        OR
        ("__new_organization_governance_operation"."operation_type" IN ('transfer-ownership', 'remove-member', 'leave-organization', 'delete-organization') AND "__new_organization_governance_operation"."target_role" IS NULL)
      ))
);
--> statement-breakpoint
INSERT INTO `__new_organization_governance_operation`("id", "organization_id", "operation_type", "previous_owner_user_id", "target_user_id", "target_role", "status", "attempt_count", "requested_at", "last_attempt_at", "completed_at", "failure_code", "failure_message", "created_at", "updated_at") SELECT "id", "organization_id", "operation_type", "previous_owner_user_id", "target_user_id", "target_role", "status", "attempt_count", "requested_at", "last_attempt_at", "completed_at", "failure_code", "failure_message", "created_at", "updated_at" FROM `organization_governance_operation`;--> statement-breakpoint
DROP TABLE `organization_governance_operation`;--> statement-breakpoint
ALTER TABLE `__new_organization_governance_operation` RENAME TO `organization_governance_operation`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `organization_governance_operation_organization_status_idx` ON `organization_governance_operation` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_governance_operation_active_unique` ON `organization_governance_operation` (`organization_id`) WHERE "organization_governance_operation"."status" = 'pending';