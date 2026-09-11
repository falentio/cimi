CREATE TABLE `identity_projection_debt` (
	`singleton_key` text PRIMARY KEY NOT NULL,
	`debt_through` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT "identity_projection_debt_singleton_key_check" CHECK("identity_projection_debt"."singleton_key" = 'default')
);
