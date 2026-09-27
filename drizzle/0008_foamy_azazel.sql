CREATE TABLE `injuries` (
	`id` text PRIMARY KEY NOT NULL,
	`area` text NOT NULL,
	`severity` text DEFAULT 'mild' NOT NULL,
	`notes` text,
	`avoid` text,
	`started_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE TABLE `progress_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`pose` text NOT NULL,
	`uri` text NOT NULL,
	`taken_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sets` ADD `set_type` text DEFAULT 'normal' NOT NULL;