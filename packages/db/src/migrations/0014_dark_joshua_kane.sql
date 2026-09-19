PRAGMA foreign_keys=OFF;--> statement-breakpoint
UPDATE `public_dashboard` SET `enabled` = 0 WHERE `public_identifier` IS NULL;--> statement-breakpoint
CREATE TABLE `__new_public_dashboard` (
	`site_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`public_identifier` text,
	`public_identifier_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`rotated_at` integer,
	FOREIGN KEY (`site_id`) REFERENCES `site`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "public_dashboard_identifier_length_check" CHECK("__new_public_dashboard"."public_identifier" IS NULL OR length("__new_public_dashboard"."public_identifier") BETWEEN 1 AND 128)
);
--> statement-breakpoint
INSERT INTO `__new_public_dashboard`("site_id", "enabled", "public_identifier", "public_identifier_hash", "created_at", "updated_at", "rotated_at") SELECT "site_id", "enabled", "public_identifier", "public_identifier_hash", "created_at", "updated_at", "rotated_at" FROM `public_dashboard`;--> statement-breakpoint
DROP TABLE `public_dashboard`;--> statement-breakpoint
ALTER TABLE `__new_public_dashboard` RENAME TO `public_dashboard`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `public_dashboard_public_identifier_unique` ON `public_dashboard` (`public_identifier`);--> statement-breakpoint
CREATE UNIQUE INDEX `public_dashboard_public_identifier_hash_unique` ON `public_dashboard` (`public_identifier_hash`);--> statement-breakpoint
CREATE INDEX `public_dashboard_identifier_enabled_idx` ON `public_dashboard` (`public_identifier_hash`,`enabled`);
