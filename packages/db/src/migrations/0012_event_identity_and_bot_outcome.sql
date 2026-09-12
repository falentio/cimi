ALTER TABLE `accepted_event` ADD `anonymous_identity_id` text;
--> statement-breakpoint
ALTER TABLE `accepted_event` ADD `bot_policy_outcome` text NOT NULL DEFAULT 'included';
--> statement-breakpoint
ALTER TABLE `accepted_event` ADD `page_view_id` text;
--> statement-breakpoint
CREATE INDEX `accepted_event_anonymous_identity_idx` ON `accepted_event` (`site_id`,`anonymous_identity_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `accepted_event_page_view_unique` ON `accepted_event` (`site_id`,`page_view_id`) WHERE `page_view_id` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `accepted_event` ADD `utm_source` text;
--> statement-breakpoint
ALTER TABLE `accepted_event` ADD `utm_medium` text;
--> statement-breakpoint
ALTER TABLE `accepted_event` ADD `utm_campaign` text;
--> statement-breakpoint
ALTER TABLE `accepted_event` ADD `device_type` text;
--> statement-breakpoint
ALTER TABLE `accepted_event` ADD `browser` text;
--> statement-breakpoint
ALTER TABLE `accepted_event` ADD `operating_system` text;
--> statement-breakpoint
ALTER TABLE `accepted_event` ADD `country` text;
