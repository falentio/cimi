PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_event_property` (
	`event_pk` integer NOT NULL,
	`property_key` text NOT NULL,
	`value_type` text NOT NULL,
	`string_value` text,
	`number_value` real,
	`boolean_value` integer,
	PRIMARY KEY(`event_pk`, `property_key`),
	FOREIGN KEY (`event_pk`) REFERENCES `accepted_event`(`event_pk`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "event_property_typed_value_check" CHECK(("__new_event_property"."value_type" = 'string' AND "__new_event_property"."string_value" IS NOT NULL AND "__new_event_property"."number_value" IS NULL AND "__new_event_property"."boolean_value" IS NULL) OR ("__new_event_property"."value_type" = 'number' AND "__new_event_property"."string_value" IS NULL AND "__new_event_property"."number_value" IS NOT NULL AND "__new_event_property"."boolean_value" IS NULL) OR ("__new_event_property"."value_type" = 'boolean' AND "__new_event_property"."string_value" IS NULL AND "__new_event_property"."number_value" IS NULL AND "__new_event_property"."boolean_value" IS NOT NULL) OR ("__new_event_property"."value_type" = 'null' AND "__new_event_property"."string_value" IS NULL AND "__new_event_property"."number_value" IS NULL AND "__new_event_property"."boolean_value" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_event_property`("event_pk", "property_key", "value_type", "string_value", "number_value", "boolean_value") SELECT "event_pk", "property_key", "value_type", "string_value", "number_value", "boolean_value" FROM `event_property`;--> statement-breakpoint
DROP TABLE `event_property`;--> statement-breakpoint
ALTER TABLE `__new_event_property` RENAME TO `event_property`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `event_property_key_idx` ON `event_property` (`property_key`);