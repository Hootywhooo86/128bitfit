ALTER TABLE `routine_exercises` ADD `track` text;--> statement-breakpoint
ALTER TABLE `session_exercises` ADD `track` text DEFAULT 'reps' NOT NULL;--> statement-breakpoint
ALTER TABLE `sets` ADD `distance_m` real;