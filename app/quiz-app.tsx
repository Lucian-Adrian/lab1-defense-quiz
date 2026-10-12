"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LeaderboardState, QuizState } from "./quiz-contract";

type ApiMessage = { error?: string };

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
          <div className={`mini-board-row mini-rank-${player.rank}`} key={`${player.rank}-${player.name}`}>
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

async function readResponse<T>(response: Response): Promise<T & ApiMessage> {
  const body = (await response.json().catch(() => ({}))) as T & ApiMessage;
  if (!response.ok && !body.error) {
    throw new Error("The quiz could not save that step. Please reconnect.");
  }
  return body;
}

export default function QuizApp() {
  const [state, setState] = useState<QuizState | null>(null);
  const [name, setName] = useState("");
  const [serverOffset, setServerOffset] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const actionRef = useRef(false);
  const timeoutQuestionRef = useRef<number | null>(null);
  const serverNow = clock + serverOffset;

  const acceptState = useCallback((next: QuizState) => {
    timeoutQuestionRef.current = null;
    setState(next);
    setServerOffset(next.serverTime - Date.now());
    if (next.playerName) setName(next.playerName);
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const next = await readResponse<QuizState>(response);
      acceptState(next);
    } catch {
      setMessage("Connection paused. Your progress is safe. Try again when the network returns.");
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
    actionRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const next = await readResponse<QuizState>(response);
      if (response.ok) acceptState(next);
      else setMessage(next.error ?? "Use a name with 2 to 32 characters.");
    } catch {
      setMessage("Could not start the quiz. Check the connection and try again.");
    } finally {
      actionRef.current = false;
      setBusy(false);
    }
  };

  const answer = useCallback(
    async (choiceIndex?: number, timedOut = false) => {
      if (!state || state.status !== "playing" || typeof state.questionIndex !== "number") return;
      if (actionRef.current) return;
      actionRef.current = true;
      setBusy(true);
      setMessage("");
      try {
        const response = await fetch("/api/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionIndex: state.questionIndex, choiceIndex, timedOut }),
        });
        const next = await readResponse<QuizState>(response);
        acceptState(next);
        if (!response.ok) setMessage(next.error ?? "The server refreshed your question.");
      } catch {
        setMessage("Answer not confirmed yet. Reconnecting to check your saved progress.");
        await refreshState();
      } finally {
        actionRef.current = false;
        setBusy(false);
      }
    },
    [acceptState, refreshState, state],
  );

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
          <section className="result-card" aria-labelledby="result-title">
            <p className="eyebrow"><span className="eyebrow-dot" /> ROUND COMPLETE</p>
            <h1 id="result-title">Nice work, {state.playerName}.</h1>
            <p className="result-intro">Here is your practice result from this Lab 1 round.</p>
            <div className="result-grade"><span>Practice grade</span><strong>{state.grade?.toFixed(1)}<small> / 10</small></strong></div>
            <div className="result-stats"><div><b>{state.correctCount ?? 0}<small> / 15</small></b><span>correct</span></div><div><b>{((state.elapsedMs ?? 0) / 1000).toFixed(1)}<small> s</small></b><span>answer time</span></div></div>
            <div className="result-actions"><a className="primary-button" href="/leaderboard">See the class board <span aria-hidden="true">→</span></a><button className="secondary-button" type="button" onClick={() => { setState({ status: "not_started", serverTime: Date.now() }); setMessage(""); }}>Play another round</button></div>
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
                <button key={index} className={`answer-option answer-option-${index + 1}`} type="button" onClick={() => void answer(index)} disabled={busy}>
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
