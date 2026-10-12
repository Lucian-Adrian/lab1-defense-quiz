import assert from "node:assert/strict";
import test from "node:test";

const origin = process.env.QUIZ_TEST_ORIGIN;
const safeLocalOrigin = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

async function startPlayer(name) {
  const response = await fetch(`${origin}/api/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const state = await response.json();
  assert.equal(response.status, 200, JSON.stringify(state));
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie?.startsWith("lab1_quiz_session="), "start response should set the HttpOnly attempt cookie");
  return { cookie, state };
}

async function stateFor(cookie) {
  const response = await fetch(`${origin}/api/state`, { headers: { cookie, cache: "no-store" } });
  assert.equal(response.status, 200);
  return response.json();
}

async function answer(cookie, questionIndex, choiceIndex) {
  return fetch(`${origin}/api/answer`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ questionIndex, choiceIndex }),
  });
}

test("timer, duplicate-submit guard, and shared class board work in local D1", { skip: !origin }, async () => {
  assert.ok(safeLocalOrigin, "QUIZ_TEST_ORIGIN must point to localhost or 127.0.0.1; never use a hosted board");

  // Find the first question's right choice through ordinary answer feedback.
  // Each probe is a separate local test attempt; no answer key enters the client app.
  let correctChoice;
  for (let choice = 0; choice < 4; choice += 1) {
    const probe = await startPlayer(`Probe ${choice}`);
    const response = await answer(probe.cookie, 0, choice);
    const state = await response.json();
    assert.equal(response.status, 200);
    if (state.feedback?.correct) correctChoice = choice;
  }
  assert.notEqual(correctChoice, undefined, "one answer should be marked correct");

  const doubleSubmit = await startPlayer("Double Check");
  const concurrent = await Promise.all([
    answer(doubleSubmit.cookie, 0, correctChoice),
    answer(doubleSubmit.cookie, 0, correctChoice),
  ]);
  const concurrentStates = await Promise.all(concurrent.map((response) => response.json()));
  assert.ok(concurrent.some((response) => response.status === 200));
  assert.equal((await stateFor(doubleSubmit.cookie)).correctCount, 1, "duplicate requests score the answer once");
  assert.ok(concurrentStates.every((state) => state.correctCount <= 1));

  const timerPlayer = await startPlayer("Timer Check");
  const tooSoon = await fetch(`${origin}/api/answer`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: timerPlayer.cookie },
    body: JSON.stringify({ questionIndex: 0, timedOut: true }),
  });
  assert.equal(tooSoon.status, 409, "client cannot end a question before the server deadline");
  assert.equal((await stateFor(timerPlayer.cookie)).questionIndex, 0);
  await new Promise((resolve) => setTimeout(resolve, 10_100));
  const afterDeadline = await stateFor(timerPlayer.cookie);
  assert.equal(afterDeadline.questionIndex, 1, "state access advances a missed question");
  assert.equal(afterDeadline.feedback?.timedOut, true);

  const boardResponse = await fetch(`${origin}/api/leaderboard`, { cache: "no-store" });
  assert.equal(boardResponse.status, 200);
  const board = await boardResponse.json();
  const names = new Set(board.players.map((player) => player.name));
  assert.ok(names.has("Double Check"));
  assert.ok(names.has("Timer Check"));
  assert.ok(board.playerCount >= 6, "separate phones share one D1 leaderboard");
});
