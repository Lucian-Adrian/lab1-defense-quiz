ALTER TABLE `quiz_attempts` ADD `answers_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `quiz_attempts` ADD `review_version` integer DEFAULT 0 NOT NULL;