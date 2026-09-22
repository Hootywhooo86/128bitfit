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
	`protein` real,
	`fat` real,
	`carb` real,
	`notes` text
);
--> statement-breakpoint
INSERT INTO `__new_food_logs`("id", "food_id", "custom_name", "meal_type", "logged_at", "servings", "serving_size", "serving_unit", "calories", "protein", "fat", "carb", "notes") SELECT "id", "food_id", "custom_name", "meal_type", "logged_at", "servings", "serving_size", "serving_unit", "calories", "protein", "fat", "carb", "notes" FROM `food_logs`;--> statement-breakpoint
DROP TABLE `food_logs`;--> statement-breakpoint
ALTER TABLE `__new_food_logs` RENAME TO `food_logs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
-- Rows the AI estimator wrote recorded which macros it could not estimate, in
-- the note. Those were forced to 0 by the old NOT NULL columns; now that null
-- is possible, put the truth back rather than leaving a fake zero behind.
UPDATE `food_logs` SET `protein` = NULL WHERE `notes` LIKE '%not estimated:%protein%';--> statement-breakpoint
UPDATE `food_logs` SET `fat` = NULL WHERE `notes` LIKE '%not estimated:%fat%';--> statement-breakpoint
UPDATE `food_logs` SET `carb` = NULL WHERE `notes` LIKE '%not estimated:%carb%';
