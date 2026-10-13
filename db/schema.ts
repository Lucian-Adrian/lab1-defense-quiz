import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const quizAttempts = sqliteTable("quiz_attempts", {
  tokenHash: text("token_hash").primaryKey(),
  playerName: text("player_name").notNull(),
  questionIndex: integer("question_index").notNull().default(0),
  correctCount: integer("correct_count").notNull().default(0),
  totalElapsedMs: integer("total_elapsed_ms").notNull().default(0),
  startedAt: integer("started_at").notNull(),
  questionStartedAt: integer("question_started_at").notNull(),
  deadlineAt: integer("deadline_at").notNull(),
  finishedAt: integer("finished_at"),
  lastFeedbackQuestionIndex: integer("last_feedback_question_index"),
  lastFeedbackCorrect: integer("last_feedback_correct"),
  lastFeedbackTimedOut: integer("last_feedback_timed_out").notNull().default(0),
  answersJson: text("answers_json").notNull().default("[]"),
  reviewVersion: integer("review_version").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
