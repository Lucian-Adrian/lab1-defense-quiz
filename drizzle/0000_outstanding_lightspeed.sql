CREATE TABLE `quiz_attempts` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`player_name` text NOT NULL,
	`question_index` integer DEFAULT 0 NOT NULL,
	`correct_count` integer DEFAULT 0 NOT NULL,
	`total_elapsed_ms` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`question_started_at` integer NOT NULL,
	`deadline_at` integer NOT NULL,
	`finished_at` integer,
	`last_feedback_question_index` integer,
	`last_feedback_correct` integer,
	`last_feedback_timed_out` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
