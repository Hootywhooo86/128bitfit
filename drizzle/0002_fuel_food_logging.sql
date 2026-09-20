CREATE TABLE `water_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`ml` integer NOT NULL,
	`logged_at` integer NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_food_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`food_id` text,
	`custom_name` text,
	`meal_type` text DEFAULT 'snack' NOT NULL,
	`logged_at` integer NOT NULL,
	`servings` real DEFAULT 1 NOT NULL,
	`serving_size` real,
	`serving_unit` text,
	`calories` real DEFAULT 0 NOT NULL,
	`protein` real DEFAULT 0 NOT NULL,
	`fat` real DEFAULT 0 NOT NULL,
	`carb` real DEFAULT 0 NOT NULL,
	`notes` text
);
--> statement-breakpoint
INSERT INTO `__new_food_logs`("id", "food_id", "custom_name", "meal_type", "logged_at", "servings", "serving_size", "serving_unit", "calories", "protein", "fat", "carb", "notes") SELECT "id", "food_id", NULL, COALESCE("meal", 'snack'), COALESCE("logged_at", 0), COALESCE("servings", 1), NULL, NULL, 0, 0, 0, 0, NULL FROM `food_logs`;--> statement-breakpoint
DROP TABLE `food_logs`;--> statement-breakpoint
ALTER TABLE `__new_food_logs` RENAME TO `food_logs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
