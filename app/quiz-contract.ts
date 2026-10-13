export const QUIZ_LENGTH = 15;
export const QUESTION_SECONDS = 10;
export const FEEDBACK_SECONDS = 1.5;

export type PublicQuestion = {
  prompt: string;
  choices: string[];
};

export type QuizFeedback = {
  questionNumber: number;
  correct: boolean;
  timedOut: boolean;
  correctAnswer: string;
  rationale: string;
};

export type QuizReviewItem = {
  questionNumber: number;
  topic: string;
  prompt: string;
  selectedAnswer: string | null;
  correctAnswer: string;
  correct: boolean;
  timedOut: boolean;
  rationale: string;
};

export type QuizState = {
  status: "not_started" | "playing" | "complete";
  attemptId?: string;
  playerName?: string;
  questionIndex?: number;
  questionNumber?: number;
  completedQuestions?: number;
  correctCount?: number;
  question?: PublicQuestion;
  questionStartedAt?: number;
  deadlineAt?: number;
  serverTime: number;
  feedback?: QuizFeedback | null;
  grade?: number;
  elapsedMs?: number;
  reviewAvailable?: boolean;
  review?: QuizReviewItem[];
};

export type LeaderboardEntry = {
  id: string;
  rank: number;
  name: string;
  correctCount: number;
  completedQuestions: number;
  grade: number;
  finished: boolean;
};

export type LeaderboardState = {
  players: LeaderboardEntry[];
  playerCount: number;
  finishedCount: number;
  serverTime: number;
};
