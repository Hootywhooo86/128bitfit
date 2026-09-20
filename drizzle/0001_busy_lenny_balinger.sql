CREATE TABLE `routine_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`target_sets` integer,
	`target_reps` integer,
	`rest_seconds` integer DEFAULT 60,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `session_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`rest_seconds` integer DEFAULT 60,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`session_exercise_id` text NOT NULL,
	`set_index` integer NOT NULL,
	`reps` integer,
	`weight` real,
	`weight_unit` text DEFAULT 'lb',
	`completed` integer DEFAULT 0 NOT NULL,
	`is_warmup` integer DEFAULT 0 NOT NULL,
	`rpe` real
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`notes` text
);
--> statement-breakpoint
INSERT INTO `__new_workout_sessions`("id", "routine_id", "started_at", "ended_at", "status", "notes") SELECT "id", "routine_id", COALESCE("started_at", 0), "ended_at", 'in_progress', "notes" FROM `workout_sessions`;--> statement-breakpoint
DROP TABLE `workout_sessions`;--> statement-breakpoint
ALTER TABLE `__new_workout_sessions` RENAME TO `workout_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `routines` ADD `notes` text;
