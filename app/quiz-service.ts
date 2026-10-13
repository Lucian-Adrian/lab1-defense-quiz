import { env } from "cloudflare:workers";
import { getQuestion } from "./quiz-bank";
import {
  FEEDBACK_SECONDS,
  QUESTION_SECONDS,
  QUIZ_LENGTH,
  type LeaderboardEntry,
  type LeaderboardState,
  type QuizReviewItem,
  type QuizState,
} from "./quiz-contract";

const QUESTION_MS = QUESTION_SECONDS * 1000;
const FEEDBACK_MS = FEEDBACK_SECONDS * 1000;
const SESSION_COOKIE = "lab1_quiz_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type AttemptRow = {
  token_hash: string;
  player_name: string;
  question_index: number;
  correct_count: number;
  total_elapsed_ms: number;
  started_at: number;
  question_started_at: number;
  deadline_at: number;
  finished_at: number | null;
  last_feedback_question_index: number | null;
  last_feedback_correct: number | null;
  last_feedback_timed_out: number;
  answers_json: string;
  review_version: number;
  created_at: number;
};

function database() {
  if (!env.DB) {
    throw new Error("The D1 database binding is not available.");
  }
  return env.DB;
}

function readSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name === SESSION_COOKIE) {
      const value = valueParts.join("=");
      return /^[0-9a-f-]{36}$/i.test(value) ? value : null;
    }
  }

  return null;
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function findAttempt(tokenHash: string): Promise<AttemptRow | null> {
  return database()
    .prepare(
      `SELECT token_hash, player_name, question_index, correct_count,
              total_elapsed_ms, started_at, question_started_at, deadline_at,
              finished_at, last_feedback_question_index, last_feedback_correct,
              last_feedback_timed_out, answers_json, review_version, created_at
       FROM quiz_attempts WHERE token_hash = ? LIMIT 1`,
    )
    .bind(tokenHash)
    .first<AttemptRow>();
}

function changedRows(result: D1Result<unknown>): number {
  return Number(result.meta?.changes ?? 0);
}

async function advanceExpiredQuestion(attempt: AttemptRow, now: number): Promise<boolean> {
  const nextQuestionIndex = Math.min(attempt.question_index + 1, QUIZ_LENGTH);
  const finishedAt = nextQuestionIndex === QUIZ_LENGTH ? now : null;
  // Continue the original ten-second cadence when a player reconnects late.
  const nextStartAt = attempt.deadline_at;
  const nextDeadlineAt = nextQuestionIndex === QUIZ_LENGTH ? nextStartAt : nextStartAt + QUESTION_MS;
  const result = await database()
    .prepare(
      `UPDATE quiz_attempts
       SET question_index = ?, total_elapsed_ms = total_elapsed_ms + ?,
           question_started_at = ?, deadline_at = ?, finished_at = ?,
           last_feedback_question_index = ?, last_feedback_correct = 0,
           last_feedback_timed_out = 1
       WHERE token_hash = ? AND question_index = ? AND deadline_at = ?
         AND finished_at IS NULL AND deadline_at <= ?`,
    )
    .bind(
      nextQuestionIndex,
      QUESTION_MS,
      nextStartAt,
      nextDeadlineAt,
      finishedAt,
      attempt.question_index,
      attempt.token_hash,
      attempt.question_index,
      attempt.deadline_at,
      now,
    )
    .run();
  return changedRows(result) === 1;
}

async function refreshAttempt(tokenHash: string, now = Date.now()): Promise<AttemptRow | null> {
  let attempt = await findAttempt(tokenHash);
  // At most one update per missed deadline, capped by the 15-question game.
  for (let missed = 0; attempt && missed < QUIZ_LENGTH; missed += 1) {
    if (attempt.finished_at !== null || attempt.deadline_at > now) break;
    const advanced = await advanceExpiredQuestion(attempt, now);
    const latest = await findAttempt(tokenHash);
    if (!latest) return null;
    attempt = latest;
    if (!advanced && attempt.deadline_at <= now && attempt.finished_at === null) continue;
  }
  return attempt;
}

function gradeFor(correctCount: number): number {
  const rounded = Math.round((correctCount / QUIZ_LENGTH) * 100) / 10;
  return Math.min(10, Math.max(1, rounded));
}

function readRecordedAnswers(answersJson: string): Map<number, number> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(answersJson);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const answers = new Map<number, number>();
  for (const value of parsed) {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const questionIndex = record.questionIndex;
    const choiceIndex = record.choiceIndex;
    if (
      !Number.isInteger(questionIndex) ||
      (questionIndex as number) < 0 ||
      (questionIndex as number) >= QUIZ_LENGTH ||
      !Number.isInteger(choiceIndex) ||
      (choiceIndex as number) < 0 ||
      (choiceIndex as number) > 3 ||
      answers.has(questionIndex as number)
    ) {
      return null;
    }
    answers.set(questionIndex as number, choiceIndex as number);
  }
  return answers;
}

function buildReview(attempt: AttemptRow): QuizReviewItem[] | null {
  if (attempt.review_version !== 1) return null;
  const answers = readRecordedAnswers(attempt.answers_json);
  if (!answers) return null;

  let recordedCorrectCount = 0;
  const review: QuizReviewItem[] = [];
  for (let questionIndex = 0; questionIndex < QUIZ_LENGTH; questionIndex += 1) {
    const question = getQuestion(questionIndex);
    if (!question) return null;

    const choiceIndex = answers.get(questionIndex);
    const timedOut = choiceIndex === undefined;
    const correct = !timedOut && choiceIndex === question.correctIndex;
    if (correct) recordedCorrectCount += 1;

    review.push({
      questionNumber: questionIndex + 1,
      topic: question.topic,
      prompt: question.prompt,
      selectedAnswer: timedOut ? null : question.choices[choiceIndex],
      correctAnswer: question.choices[question.correctIndex],
      correct,
      timedOut,
      rationale: question.rationale,
    });
  }

  return recordedCorrectCount === attempt.correct_count ? review : null;
}

function makeState(attempt: AttemptRow, now: number): QuizState {
  const isComplete = attempt.finished_at !== null || attempt.question_index >= QUIZ_LENGTH;
  const review = isComplete ? buildReview(attempt) : null;
  const lastFeedbackIndex = attempt.last_feedback_question_index;
  const feedbackQuestion =
    lastFeedbackIndex !== null &&
    lastFeedbackIndex === Math.min(attempt.question_index - 1, QUIZ_LENGTH - 1)
      ? getQuestion(lastFeedbackIndex)
      : undefined;
  const feedback = lastFeedbackIndex !== null && feedbackQuestion
    ? {
        questionNumber: lastFeedbackIndex + 1,
        correct: attempt.last_feedback_correct === 1,
        timedOut: attempt.last_feedback_timed_out === 1,
        correctAnswer: feedbackQuestion.choices[feedbackQuestion.correctIndex],
        rationale: feedbackQuestion.rationale,
      }
    : null;
  const question = isComplete ? undefined : getQuestion(attempt.question_index);

  return {
    status: isComplete ? "complete" : "playing",
    attemptId: attempt.token_hash.slice(0, 16),
    playerName: attempt.player_name,
    questionIndex: attempt.question_index,
    questionNumber: Math.min(attempt.question_index + 1, QUIZ_LENGTH),
    completedQuestions: Math.min(attempt.question_index, QUIZ_LENGTH),
    correctCount: attempt.correct_count,
    ...(question
      ? {
          question: {
            prompt: question.prompt,
            choices: [...question.choices],
          },
        }
      : {}),
    questionStartedAt: attempt.question_started_at,
    deadlineAt: attempt.deadline_at,
    serverTime: now,
    feedback,
    ...(isComplete
      ? {
          grade: gradeFor(attempt.correct_count),
          reviewAvailable: review !== null,
          ...(review ? { review } : {}),
        }
      : {}),
    elapsedMs: attempt.total_elapsed_ms,
  };
}

export function sessionCookie(token: string, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

export async function startAttempt(playerName: string): Promise<{ token: string; state: QuizState }> {
  const token = crypto.randomUUID();
  const tokenHash = await hashToken(token);
  const now = Date.now();
  await database()
    .prepare(
      `INSERT INTO quiz_attempts (
         token_hash, player_name, question_index, correct_count, total_elapsed_ms,
         started_at, question_started_at, deadline_at, finished_at,
         last_feedback_question_index, last_feedback_correct, last_feedback_timed_out,
         answers_json, review_version, created_at
       ) VALUES (?, ?, 0, 0, 0, ?, ?, ?, NULL, NULL, NULL, 0, '[]', 1, ?)`,
    )
    .bind(tokenHash, playerName, now, now, now + QUESTION_MS, now)
    .run();

  const attempt = await findAttempt(tokenHash);
  if (!attempt) throw new Error("The new quiz attempt could not be read.");
  return { token, state: makeState(attempt, Date.now()) };
}

export async function getAttemptState(request: Request): Promise<QuizState> {
  const token = readSessionToken(request);
  if (!token) return { status: "not_started", serverTime: Date.now() };
  const attempt = await refreshAttempt(await hashToken(token));
  return attempt ? makeState(attempt, Date.now()) : { status: "not_started", serverTime: Date.now() };
}

export type AnswerInput = {
  questionIndex: number;
  choiceIndex?: number;
  timedOut?: boolean;
};

export type AnswerResult = {
  httpStatus: number;
  state: QuizState;
  error?: string;
};

export async function answerQuestion(request: Request, input: AnswerInput): Promise<AnswerResult> {
  const token = readSessionToken(request);
  if (!token) {
    return { httpStatus: 401, state: { status: "not_started", serverTime: Date.now() }, error: "Start a quiz first." };
  }

  const tokenHash = await hashToken(token);
  let attempt = await refreshAttempt(tokenHash);
  const now = Date.now();
  if (!attempt) {
    return { httpStatus: 401, state: { status: "not_started", serverTime: now }, error: "Start a quiz first." };
  }
  if (attempt.finished_at !== null || attempt.question_index >= QUIZ_LENGTH) {
    return { httpStatus: 200, state: makeState(attempt, now) };
  }
  if (input.questionIndex !== attempt.question_index) {
    return { httpStatus: 409, state: makeState(attempt, now), error: "That question has already moved on." };
  }
  if (now < attempt.question_started_at) {
    return { httpStatus: 409, state: makeState(attempt, now), error: "Read the answer note, then choose." };
  }

  if (now >= attempt.deadline_at) {
    attempt = await refreshAttempt(tokenHash, now);
    return {
      httpStatus: 200,
      state: attempt ? makeState(attempt, Date.now()) : { status: "not_started", serverTime: Date.now() },
    };
  }

  if (input.timedOut) {
    return { httpStatus: 409, state: makeState(attempt, now), error: "The server timer has not expired yet." };
  }
  if (!Number.isInteger(input.choiceIndex) || input.choiceIndex! < 0 || input.choiceIndex! > 3) {
    return { httpStatus: 400, state: makeState(attempt, now), error: "Choose one of the four answers." };
  }

  const question = getQuestion(attempt.question_index);
  if (!question) {
    return { httpStatus: 200, state: makeState(attempt, now) };
  }
  const isCorrect = input.choiceIndex === question.correctIndex;
  const isLastQuestion = attempt.question_index === QUIZ_LENGTH - 1;
  const nextQuestionIndex = attempt.question_index + 1;
  const nextStartAt = isLastQuestion ? now : now + FEEDBACK_MS;
  const nextDeadlineAt = isLastQuestion ? now : nextStartAt + QUESTION_MS;
  const elapsedMs = Math.max(0, Math.min(QUESTION_MS, now - attempt.question_started_at));
  const newFinishedAt = isLastQuestion ? now : null;
  const result = await database()
    .prepare(
      `UPDATE quiz_attempts
       SET question_index = ?, correct_count = correct_count + ?,
           total_elapsed_ms = total_elapsed_ms + ?,
           answers_json = json_insert(answers_json, '$[#]',
             json_object('questionIndex', ?, 'choiceIndex', ?)),
           question_started_at = ?, deadline_at = ?, finished_at = ?,
           last_feedback_question_index = ?, last_feedback_correct = ?,
           last_feedback_timed_out = 0
       WHERE token_hash = ? AND question_index = ? AND question_started_at = ?
         AND deadline_at = ? AND finished_at IS NULL
         AND question_started_at <= ? AND deadline_at > ?`,
    )
    .bind(
      nextQuestionIndex,
      isCorrect ? 1 : 0,
      elapsedMs,
      attempt.question_index,
      input.choiceIndex!,
      nextStartAt,
      nextDeadlineAt,
      newFinishedAt,
      attempt.question_index,
      isCorrect ? 1 : 0,
      tokenHash,
      attempt.question_index,
      attempt.question_started_at,
      attempt.deadline_at,
      now,
      now,
    )
    .run();

  const updated = await refreshAttempt(tokenHash);
  const state = updated ? makeState(updated, Date.now()) : { status: "not_started" as const, serverTime: Date.now() };
  if (changedRows(result) !== 1) {
    return { httpStatus: 409, state, error: "That answer was already received." };
  }
  return { httpStatus: 200, state };
}

function leaderboardGrade(correctCount: number): number {
  return gradeFor(correctCount);
}

export async function getLeaderboard(): Promise<LeaderboardState> {
  const now = Date.now();
  const db = database();
  await db
    .prepare(
      `WITH expired AS (
         SELECT token_hash, deadline_at,
                MIN(${QUIZ_LENGTH} - question_index,
                    1 + CAST((? - deadline_at) / ${QUESTION_MS} AS INTEGER)) AS missed
         FROM quiz_attempts
         WHERE finished_at IS NULL AND question_index < ${QUIZ_LENGTH} AND deadline_at <= ?
       )
       UPDATE quiz_attempts
       SET question_index = quiz_attempts.question_index + expired.missed,
           total_elapsed_ms = quiz_attempts.total_elapsed_ms + expired.missed * ${QUESTION_MS},
           question_started_at = expired.deadline_at + (expired.missed - 1) * ${QUESTION_MS},
           deadline_at = CASE
             WHEN quiz_attempts.question_index + expired.missed >= ${QUIZ_LENGTH}
               THEN expired.deadline_at + (expired.missed - 1) * ${QUESTION_MS}
             ELSE expired.deadline_at + expired.missed * ${QUESTION_MS}
           END,
           finished_at = CASE
             WHEN quiz_attempts.question_index + expired.missed >= ${QUIZ_LENGTH} THEN ?
             ELSE NULL
           END,
           last_feedback_question_index = quiz_attempts.question_index + expired.missed - 1,
           last_feedback_correct = 0,
           last_feedback_timed_out = 1
       FROM expired
       WHERE quiz_attempts.token_hash = expired.token_hash
         AND quiz_attempts.deadline_at = expired.deadline_at
         AND quiz_attempts.finished_at IS NULL`,
    )
    .bind(now, now, now)
    .run();

  const latest = await db
    .prepare(
      `SELECT token_hash, player_name, question_index, correct_count,
              total_elapsed_ms, started_at, question_started_at, deadline_at,
              finished_at, last_feedback_question_index, last_feedback_correct,
              last_feedback_timed_out, answers_json, review_version, created_at
       FROM quiz_attempts
       ORDER BY correct_count DESC, total_elapsed_ms ASC, created_at ASC, player_name COLLATE NOCASE ASC
       LIMIT 2000`,
    )
    .all<AttemptRow>();

  const players: LeaderboardEntry[] = (latest.results ?? []).map((attempt, index) => ({
    id: attempt.token_hash.slice(0, 16),
    rank: index + 1,
    name: attempt.player_name,
    correctCount: attempt.correct_count,
    completedQuestions: Math.min(attempt.question_index, QUIZ_LENGTH),
    grade: leaderboardGrade(attempt.correct_count),
    finished: attempt.finished_at !== null,
  }));

  return {
    players,
    playerCount: players.length,
    finishedCount: players.filter((player) => player.finished).length,
    serverTime: Date.now(),
  };
}

