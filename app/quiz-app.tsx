"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LeaderboardState, QuizReviewItem, QuizState } from "./quiz-contract";

type QuizApiResponse = { state: QuizState | null; error?: string };
type StateAcceptance = "accepted" | "stale" | "pending" | "missing";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isQuizFeedback(value: unknown): boolean {
  return value === null || (isRecord(value) &&
    typeof value.questionNumber === "number" && Number.isInteger(value.questionNumber) &&
    typeof value.correct === "boolean" &&
    typeof value.timedOut === "boolean" &&
    typeof value.correctAnswer === "string" &&
    typeof value.rationale === "string");
}

function isQuizReviewItem(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.questionNumber === "number" && Number.isInteger(value.questionNumber) &&
    value.questionNumber >= 1 && value.questionNumber <= 15 &&
    typeof value.topic === "string" &&
    typeof value.prompt === "string" &&
    (value.selectedAnswer === null || typeof value.selectedAnswer === "string") &&
    typeof value.correctAnswer === "string" &&
    typeof value.correct === "boolean" &&
    typeof value.timedOut === "boolean" &&
    typeof value.rationale === "string";
}

function isQuizState(value: unknown): value is QuizState {
  if (!isRecord(value) || !isFiniteNumber(value.serverTime)) return false;
  if (value.status === "not_started") return true;

  if (
    (value.status !== "playing" && value.status !== "complete") ||
    typeof value.playerName !== "string" || value.playerName.length < 2 || value.playerName.length > 32 ||
    typeof value.questionIndex !== "number" || !Number.isInteger(value.questionIndex) ||
    typeof value.questionNumber !== "number" || !Number.isInteger(value.questionNumber) ||
    typeof value.completedQuestions !== "number" || !Number.isInteger(value.completedQuestions) ||
    typeof value.correctCount !== "number" || !Number.isInteger(value.correctCount) ||
    !isFiniteNumber(value.questionStartedAt) ||
    !isFiniteNumber(value.deadlineAt) ||
    !isFiniteNumber(value.elapsedMs) ||
    !isQuizFeedback(value.feedback)
  ) {
    return false;
  }

  if (value.attemptId !== undefined && typeof value.attemptId !== "string") return false;

  const questionIndex = value.questionIndex as number;
  const completedQuestions = value.completedQuestions as number;
  const correctCount = value.correctCount as number;
  if (
    questionIndex !== completedQuestions ||
    value.questionNumber !== Math.min(questionIndex + 1, 15) ||
    correctCount < 0 ||
    correctCount > completedQuestions
  ) return false;

  if (value.status === "complete") {
    if (
      questionIndex !== 15 || completedQuestions !== 15 ||
      !isFiniteNumber(value.grade) || value.grade < 1 || value.grade > 10
    ) return false;
    if (value.reviewAvailable !== undefined && typeof value.reviewAvailable !== "boolean") return false;
    if (value.reviewAvailable === true) {
      return Array.isArray(value.review) && value.review.length === 15 && value.review.every(isQuizReviewItem);
    }
    return value.review === undefined;
  }

  if (value.reviewAvailable !== undefined || value.review !== undefined) return false;

  const question = value.question;
  return questionIndex >= 0 && questionIndex < 15 &&
    isRecord(question) &&
    typeof question.prompt === "string" &&
    Array.isArray(question.choices) &&
    question.choices.length === 4 &&
    question.choices.every((choice) => typeof choice === "string") &&
    (value.deadlineAt as number) > (value.questionStartedAt as number);
}

async function readQuizResponse(response: Response): Promise<QuizApiResponse> {
  const parsed: unknown = await response.json().catch(() => null);
  const error = isRecord(parsed) && typeof parsed.error === "string" ? parsed.error : undefined;

  if (response.status >= 500) {
    throw new Error(error ?? "The quiz service is temporarily unavailable.");
  }
  if (isQuizState(parsed)) {
    return { state: parsed, ...(error ? { error } : {}) };
  }
  if (!response.ok && error) return { state: null, error };
  throw new Error("The quiz returned an invalid response. Your saved progress was kept.");
}

function JoinLeaderboard() {
  const [board, setBoard] = useState<LeaderboardState | null>(null);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/leaderboard", { cache: "no-store" });
        if (response.ok && mounted) setBoard((await response.json()) as LeaderboardState);
      } catch {
        // The full board link stays useful if the connection is briefly offline.
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 4000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="join-live-board">
      <div className="mini-board-head"><h2>Live leaderboard</h2><span className="board-live"><i /> Live</span></div>
      <p className="mini-grade-label">Practice grade / 10</p>
      <div className="mini-board-rows">
        {board?.players.slice(0, 3).map((player) => (
            <div className={`mini-board-row mini-rank-${player.rank}`} key={player.id}>
            <span className="mini-rank-number">{player.rank}</span>
            <span className="mini-avatar">{player.name.trim().slice(0, 1).toLocaleUpperCase()}</span>
            <b>{player.name}</b>
            <strong>{player.grade.toFixed(1)}</strong>
          </div>
        ))}
        {(!board || board.players.length === 0) && <p className="mini-empty">No players yet. Join to start the board.</p>}
      </div>
    </div>
  );
}

function ResultReview({ state }: { state: QuizState }) {
  const [rank, setRank] = useState<{ position: number; total: number } | null>(null);
  const [rankUnavailable, setRankUnavailable] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const attemptId = state.attemptId;
    if (!attemptId) {
      setRankUnavailable(true);
      return;
    }

    let mounted = true;
    const refreshRank = async () => {
      try {
        const response = await fetch("/api/leaderboard", { cache: "no-store" });
        if (!response.ok) throw new Error("Leaderboard unavailable");
        const board = (await response.json()) as LeaderboardState;
        if (!mounted) return;
        const player = board.players.find((entry) => entry.id === attemptId);
        setRank(player ? { position: player.rank, total: board.playerCount } : null);
        setRankUnavailable(false);
      } catch {
        if (mounted) setRankUnavailable(true);
      }
    };

    void refreshRank();
    const interval = window.setInterval(() => void refreshRank(), 4000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [state.attemptId]);

  const review = state.reviewAvailable && Array.isArray(state.review) ? state.review : [];
  const missed = review.filter((item) => !item.correct);
  const visibleReview = showAll ? review : missed;

  return (
    <>
      <div className="result-rank" aria-live="polite">
        <span>Your class rank</span>
        <strong>{rank ? `#${rank.position}` : rankUnavailable ? "Unavailable" : "…"}<small>{rank ? ` of ${rank.total}` : ""}</small></strong>
        {!rank && <span className="result-rank-note">{rankUnavailable ? "Rank unavailable for this round." : "Checking the live board…"}</span>}
      </div>

      {state.reviewAvailable && review.length > 0 && (
        <section className="result-review" aria-label="Answer review">
          <button
            className="review-toggle"
            type="button"
            aria-expanded={reviewOpen}
            onClick={() => setReviewOpen((open) => !open)}
          >
            <span>{reviewOpen ? "Hide review" : "Review missed answers"}</span>
            <b>{missed.length}</b>
          </button>
          {reviewOpen && (
            <>
              {review.length > 0 && (
                <div className="review-filter">
                  <button type="button" aria-pressed={!showAll} onClick={() => setShowAll(false)}>
                    Missed only ({missed.length})
                  </button>
                  <button type="button" aria-pressed={showAll} onClick={() => setShowAll(true)}>
                    All {review.length} questions
                  </button>
                </div>
              )}
              <div className="review-list">
                {visibleReview.map((item, index) => (
                  <ReviewCard key={item.questionNumber} item={item} initiallyOpen={index === 0} />
                ))}
                {visibleReview.length === 0 && (
                  <p className="review-empty">No missed answers. You can still review all {review.length} questions above.</p>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

function ReviewCard({ item, initiallyOpen }: { item: QuizReviewItem; initiallyOpen: boolean }) {
  return (
    <details className={`review-item ${item.correct ? "review-correct" : "review-missed"}`} open={initiallyOpen}>
      <summary>
        <span className="review-heading">
          <b>{item.topic}</b>
          <small>Question {item.questionNumber}</small>
        </span>
        <span className="review-prompt">{item.prompt}</span>
        <span className="review-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="review-answer-grid">
        <div>
          <span>Your answer</span>
          <p>{item.selectedAnswer ?? (item.timedOut ? "No answer (time ran out)" : "No answer recorded")}</p>
        </div>
        <div>
          <span>Correct answer</span>
          <p>{item.correctAnswer}</p>
        </div>
        <div className="review-rationale">
          <span>Why</span>
          <p>{item.rationale}</p>
        </div>
      </div>
    </details>
  );
}

export default function QuizApp() {
  const [state, setState] = useState<QuizState | null>(null);
  const [name, setName] = useState("");
  const [serverOffset, setServerOffset] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [message, setMessage] = useState("");
  const stateRef = useRef<QuizState | null>(null);
  const stateGenerationRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const freshStartPendingRef = useRef(false);
  const actionRef = useRef(false);
  const timeoutQuestionRef = useRef<number | null>(null);
  const serverNow = clock + serverOffset;

  const acceptState = useCallback((next: QuizState, generation: number, isFreshAttempt = false): StateAcceptance => {
    if (generation !== generationRef.current) return "stale";
    if (freshStartPendingRef.current && !isFreshAttempt) return "pending";

    const current = stateRef.current;
    const currentBelongsToGeneration = stateGenerationRef.current === generation;
    if (next.status === "not_started" && current && current.status !== "not_started") return "missing";
    if (currentBelongsToGeneration && current && current.status !== "not_started" && next.status !== "not_started") {
      const oldIndex = current.questionIndex ?? -1;
      const newIndex = next.questionIndex ?? -1;
      if (newIndex < oldIndex || (newIndex === oldIndex && next.serverTime < current.serverTime)) return "stale";
    }

    timeoutQuestionRef.current = null;
    stateRef.current = next;
    stateGenerationRef.current = generation;
    setState(next);
    setServerOffset(next.serverTime - Date.now());
    if (next.playerName) setName(next.playerName);
    setRecovering(false);
    return "accepted";
  }, []);

  const refreshState = useCallback(async (): Promise<boolean> => {
    const generation = generationRef.current;
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const result = await readQuizResponse(response);
      if (generation !== generationRef.current) return true;
      if (!result.state) {
        throw new Error(result.error ?? "The saved round could not be loaded.");
      }
      const acceptance = acceptState(result.state, generation);
      if (acceptance === "stale" || acceptance === "pending") return true;
      if (acceptance === "missing") throw new Error(result.error ?? "The saved round could not be loaded.");
      setMessage("");
      return true;
    } catch {
      setMessage("Connection paused. Your last saved progress is safe. Reconnecting…");
      setRecovering(true);
      return false;
    }
  }, [acceptState]);

  useEffect(() => {
    void refreshState();
    const timer = window.setInterval(() => setClock(Date.now()), 100);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshState();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshState]);

  const start = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (actionRef.current) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    freshStartPendingRef.current = true;
    actionRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await readQuizResponse(response);
      if (response.ok && result.state && acceptState(result.state, generation, true) === "accepted") {
        setMessage("");
      } else {
        setMessage(result.error ?? "Use a name with 2 to 32 characters.");
      }
    } catch {
      setMessage("Could not start the quiz. Check the connection and try again.");
    } finally {
      if (generation === generationRef.current) freshStartPendingRef.current = false;
      actionRef.current = false;
      setBusy(false);
    }
  };

  const answer = useCallback(
    async (choiceIndex?: number, timedOut = false) => {
      if (!state || state.status !== "playing" || typeof state.questionIndex !== "number") return;
      if (actionRef.current) return;
      const generation = generationRef.current;
      actionRef.current = true;
      setBusy(true);
      setMessage("");
      try {
        const response = await fetch("/api/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionIndex: state.questionIndex, choiceIndex, timedOut }),
        });
        const result = await readQuizResponse(response);
        if (generation !== generationRef.current) return;
        const acceptance = result.state ? acceptState(result.state, generation) : "missing";
        if (acceptance === "accepted") {
          setMessage(result.error ?? "");
        } else if (acceptance === "stale" || acceptance === "pending") {
          return;
        } else {
          setMessage(result.error ?? "The saved question is still being checked.");
          setRecovering(true);
        }
      } catch {
        if (generation !== generationRef.current) return;
        setMessage("Answer not confirmed. Checking the saved round…");
        setRecovering(true);
        const recovered = await refreshState();
        if (recovered) setMessage("Saved progress rechecked. Continue from the question shown.");
      } finally {
        actionRef.current = false;
        setBusy(false);
      }
    },
    [acceptState, refreshState, state],
  );

  const playAgain = useCallback(async () => {
    const playerName = stateRef.current?.playerName;
    if (!playerName || actionRef.current) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    freshStartPendingRef.current = true;
    actionRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: playerName }),
      });
      const result = await readQuizResponse(response);
      if (response.ok && result.state && acceptState(result.state, generation, true) === "accepted") {
        setMessage("");
      } else {
        setMessage(result.error ?? "Could not start another round.");
      }
    } catch {
      setMessage("Could not start another round. Your completed result is still shown.");
    } finally {
      if (generation === generationRef.current) freshStartPendingRef.current = false;
      actionRef.current = false;
      setBusy(false);
    }
  }, [acceptState]);

  const atFeedback =
    state?.status === "playing" &&
    state.feedback &&
    typeof state.questionStartedAt === "number" &&
    serverNow < state.questionStartedAt;
  const remainingSeconds =
    state?.status === "playing" && typeof state.deadlineAt === "number" && typeof state.questionStartedAt === "number"
      ? serverNow < state.questionStartedAt
        ? 10
        : Math.max(0, Math.ceil((state.deadlineAt - serverNow) / 1000))
      : 0;

  useEffect(() => {
    if (
      state?.status === "playing" &&
      !atFeedback &&
      typeof state.deadlineAt === "number" &&
      serverNow >= state.deadlineAt &&
      !busy &&
      timeoutQuestionRef.current !== state.questionIndex
    ) {
      timeoutQuestionRef.current = state.questionIndex ?? null;
      void answer(undefined, true);
    }
  }, [answer, atFeedback, busy, serverNow, state]);

  useEffect(() => {
    if (!recovering) return;
    const retry = window.setInterval(() => {
      if (navigator.onLine) void refreshState();
    }, 1500);
    return () => window.clearInterval(retry);
  }, [recovering, refreshState]);

  useEffect(() => {
    if (state?.status !== "playing") return;
    const recover = () => {
      if (navigator.onLine) void refreshState();
    };
    window.addEventListener("online", recover);
    return () => window.removeEventListener("online", recover);
  }, [refreshState, state?.status]);

  const progress = state?.completedQuestions ?? 0;

  return (
    <main className="quiz-page">
      {state && state.status !== "not_started" && (
        <header className="quiz-topbar">
          <a className="board-brand" href="/" aria-label="Lab 1 Defense home">Lab 1 <b>Defense</b></a>
          <a className="topbar-link" href="/leaderboard">Leaderboard</a>
        </header>
      )}

      <div className={`quiz-main ${!state || state.status === "not_started" ? "quiz-main-welcome" : ""}`}>
        {!state || state.status === "not_started" ? (
          <section className="welcome-layout" aria-labelledby="join-title">
            <div className="welcome-panel">
              <div className="welcome-header"><a className="board-brand" href="/" aria-label="Lab 1 Defense home">Lab 1 <b>Defense</b></a><a className="board-outline-link" href="/leaderboard">Leaderboard</a></div>
              <div className="welcome-panel-grid">
                <div className="join-copy">
                  <h1 id="join-title">See what grade<br />you get for Lab 1.</h1>
                  <p className="join-description">15 questions. 10 seconds each.</p>
                  <form className="join-form" onSubmit={start}>
                    <label htmlFor="player-name">Your name</label>
                    <input
                      id="player-name"
                      autoComplete="nickname"
                      maxLength={32}
                      minLength={2}
                      placeholder="e.g. Alex"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                    />
                    <button className="primary-button" type="submit" disabled={busy}>
                      {busy ? "Starting…" : "Start quiz"}
                    </button>
                    <p className="form-note">Name only. No account needed.</p>
                  </form>
                  {message && <p className="inline-message" role="alert">{message}</p>}
                </div>
                <JoinLeaderboard />
              </div>
            </div>
          </section>
        ) : state.status === "complete" ? (
          <section className="result-card review-result" aria-labelledby="result-title">
            <p className="eyebrow"><span className="eyebrow-dot" /> ROUND COMPLETE</p>
            <h1 id="result-title">Nice work, {state.playerName}.</h1>
            <p className="result-intro">Here is your practice result from this Lab 1 round.</p>
            <div className="result-grade"><span>Practice grade</span><strong>{state.grade?.toFixed(1)}<small> / 10</small></strong></div>
            <div className="result-stats"><div><b>{state.correctCount ?? 0}<small> / 15</small></b><span>correct</span></div><div><b>{((state.elapsedMs ?? 0) / 1000).toFixed(1)}<small> s</small></b><span>answer time</span></div></div>
            <ResultReview state={state} />
            <div className="result-actions"><a className="primary-button" href="/leaderboard">See the class board <span aria-hidden="true">→</span></a><button className="secondary-button" type="button" onClick={() => void playAgain()} disabled={busy}>Play another round</button></div>
            <p className="grade-note">Practice grade only. This is not an academic course grade.</p>
          </section>
        ) : atFeedback && state.feedback ? (
          <section className="feedback-card" aria-live="polite">
            <div className={`feedback-icon ${state.feedback.correct ? "is-correct" : "is-missed"}`}>{state.feedback.correct ? "✓" : "↗"}</div>
            <p className="eyebrow">QUESTION {state.feedback.questionNumber} {state.feedback.timedOut ? "· TIME" : "· ANSWER"}</p>
            <h1>{state.feedback.timedOut ? "Time is up." : state.feedback.correct ? "Exactly right." : "Good try."}</h1>
            <p className="feedback-answer">{state.feedback.correctAnswer}</p>
            <p className="feedback-rationale">{state.feedback.rationale}</p>
            <div className="next-countdown"><span className="countdown-pip" /> Next question in a moment</div>
          </section>
        ) : (
          <section className="question-card" aria-labelledby="question-title">
            <div className="question-meta">
              <p className="progress-label">{state.questionNumber ?? 1} / 15</p>
              <div className={`timer-pill ${remainingSeconds <= 3 ? "timer-urgent" : ""}`} aria-label={`${remainingSeconds} seconds remaining`}><b>{remainingSeconds}</b></div>
            </div>
            <div className="progress-track"><span style={{ width: `${(progress / 15) * 100}%` }} /></div>
            <h1 id="question-title">{state.question?.prompt}</h1>
            <div className="answer-grid">
              {state.question?.choices.map((choice, index) => (
                <button key={index} className={`answer-option answer-option-${index + 1}`} type="button" onClick={() => void answer(index)} disabled={busy || recovering}>
                  <span className="answer-letter">{String.fromCharCode(65 + index)}</span><span>{choice}</span>
                </button>
              ))}
            </div>
            {message && <p className="inline-message" role="status">{message}</p>}
          </section>
        )}
      </div>
    </main>
  );
}
