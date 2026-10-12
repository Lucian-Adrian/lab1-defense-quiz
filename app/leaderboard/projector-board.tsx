"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import type { LeaderboardState } from "../quiz-contract";

export default function LeaderboardBoard() {
  const [board, setBoard] = useState<LeaderboardState | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const updateBoard = useCallback(async () => {
    try {
      const response = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!response.ok) throw new Error("Leaderboard unavailable");
      setBoard((await response.json()) as LeaderboardState);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    }
  }, []);

  useEffect(() => {
    void updateBoard();
    const interval = window.setInterval(() => void updateBoard(), 4000);
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("fullscreenchange", syncFullscreen);
    };
  }, [updateBoard]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setUnavailable(true);
    }
  };

  return (
    <main className="board-page">
      <header className="board-topbar">
        <a className="board-brand" href="/" aria-label="Lab 1 Defense home">Lab 1 <b>Defense</b></a>
        <div className="board-top-actions">
          <button className="fullscreen-button" type="button" onClick={() => void toggleFullscreen()}><span aria-hidden="true">⛶</span>{fullscreen ? "Exit fullscreen" : "Fullscreen"}</button>
        </div>
      </header>

      <div className="board-heading">
        <div className="board-title-row"><h1>Live leaderboard</h1><span className="board-live"><i /> Live</span></div>
        <p className="board-count-line">{board?.playerCount ?? 0} players <span>·</span> {board?.finishedCount ?? 0} finished</p>
      </div>

      <div className="board-layout">
        <section className="leaderboard-panel" aria-label="Live class leaderboard">
          <div className="board-table-wrap">
            <table className="board-table">
              <thead><tr><th scope="col">#</th><th scope="col">Student</th><th scope="col">Grade / 10</th><th scope="col">Correct</th><th scope="col">Progress</th></tr></thead>
              <tbody>
                {board?.players.map((player) => (
                  <tr key={`${player.rank}-${player.name}`} className={player.rank <= 3 ? `top-rank top-rank-${player.rank}` : ""}>
                    <td><span className="rank-badge">{player.rank}</span></td>
                    <td><span className="student-cell"><span className="student-avatar">{player.name.trim().slice(0, 1).toLocaleUpperCase()}</span><span className="player-name">{player.name}</span></span></td>
                    <td><span className="grade-value">{player.grade.toFixed(1)}<small> / 10</small></span></td>
                    <td><span className="correct-value">{player.correctCount}<small> / 15</small></span></td>
                    <td>{player.finished ? <span className="done-label">Done</span> : <div className="progress-cell"><div className="board-progress-track"><span style={{ width: `${Math.round((player.completedQuestions / 15) * 100)}%` }} /></div><span>{player.completedQuestions}<small> / 15</small></span></div>}</td>
                  </tr>
                ))}
                {(!board || board.players.length === 0) && (
                  <tr className="empty-board-row"><td colSpan={5}>{unavailable ? "Waiting for the shared board connection…" : "Be the first to join the round."}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {unavailable && <p className="board-error" role="status">Connection paused. The board will retry automatically.</p>}
        </section>

        <aside className="join-qr-panel">
          <h2>Scan to join</h2>
          <div className="qr-frame"><Image src="/join-qr.svg" alt="QR code to join the Lab 1 quiz" width={208} height={208} priority /></div>
          <p className="qr-details">15 questions<br />10 seconds each</p>
          <p className="qr-ranking">Practice grade. Ranked by correct answers, then speed.</p>
        </aside>
      </div>
    </main>
  );
}
