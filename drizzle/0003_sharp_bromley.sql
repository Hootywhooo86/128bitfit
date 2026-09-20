CREATE TABLE `weight_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`kg_or_lb` real NOT NULL,
	`unit` text DEFAULT 'lb' NOT NULL,
	`logged_at` integer NOT NULL,
	`note` text
);
