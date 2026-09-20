CREATE TABLE `off_food_cache` (
	`barcode` text PRIMARY KEY NOT NULL,
	`source_id` text,
	`name` text NOT NULL,
	`brand` text,
	`serving_size` real,
	`serving_unit` text,
	`nutrition_basis` text,
	`nutrients` text DEFAULT '{}' NOT NULL,
	`cached_at` integer NOT NULL,
	`product_url` text,
	`nutrient_keys_present` text DEFAULT '[]' NOT NULL
);
