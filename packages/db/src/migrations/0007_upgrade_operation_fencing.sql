ALTER TABLE `installation` ADD `active_operation_checkpoint` text;
--> statement-breakpoint
ALTER TABLE `installation` ADD `active_operation_owner_token` text;
--> statement-breakpoint
ALTER TABLE `backup_operation` ADD `owner_token` text;
