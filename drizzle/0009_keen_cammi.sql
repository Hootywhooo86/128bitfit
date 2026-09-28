CREATE TABLE `cardio_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`t` integer NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`alt` real,
	`accuracy` real,
	`speed` real,
	`segment` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cardio_points_session_t` ON `cardio_points` (`session_id`,`t`);--> statement-breakpoint
CREATE TABLE `cardio_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`sport` text NOT NULL,
	`status` text DEFAULT 'recording' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`paused_at` integer,
	`paused_ms` integer DEFAULT 0 NOT NULL,
	`segment` integer DEFAULT 0 NOT NULL,
	`distance_m` real,
	`moving_s` integer,
	`elapsed_s` integer,
	`elev_gain_m` real,
	`manual` integer DEFAULT false NOT NULL,
	`notes` text
);
