import assert from "node:assert/strict";
import test from "node:test";

const origin = process.env.QUIZ_TEST_ORIGIN;
const safeLocalOrigin = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function startPlayer(name) {
  const response = await fetch(`${origin}/api/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const state = await response.json();
  assert.equal(response.status, 200, JSON.stringify(state));
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie?.startsWith("lab1_quiz_session="));
  return { cookie, state };
}

async function getState(cookie) {
  const response = await fetch(`${origin}/api/state`, {
    headers: { cookie, cache: "no-store" },
  });
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

async function waitForQuestion(state) {
  const waitMs = Math.max(0, state.questionStartedAt - state.serverTime + 40);
  if (waitMs > 0) await delay(waitMs);
}

test("full round resumes, replays, and rejects a late answer in local D1", { skip: !origin }, async () => {
  assert.ok(safeLocalOrigin, "QUIZ_TEST_ORIGIN must point to localhost or 127.0.0.1; never use a hosted board");
  const suffix = Date.now().toString().slice(-6);
  const name = `Full round ${suffix}`;
  const round = await startPlayer(name);
  let current = round.state;
  assert.equal(current.review, undefined, "the review stays hidden during the round");
  assert.match(current.attemptId, /^[0-9a-f]{16}$/);

  for (let index = 0; index < 15; index += 1) {
    assert.equal(current.status, "playing");
    assert.equal(current.questionIndex, index);
    await waitForQuestion(current);
    if (index === 0) {
      await delay(Math.max(0, current.deadlineAt - Date.now() + 70));
      current = await getState(round.cookie);
      assert.equal(current.questionIndex, 1);
      continue;
    }
    const response = await answer(round.cookie, index, 0);
    current = await response.json();
    assert.equal(response.status, 200, JSON.stringify(current));
    assert.equal(current.questionIndex, index + 1);
    if (index < 14) assert.equal(current.review, undefined);
    if (index === 1) {
      const duplicate = await answer(round.cookie, index, 0);
      assert.equal(duplicate.status, 409);
    }
    if (index === 5) {
      current = await getState(round.cookie);
      assert.equal(current.status, "playing");
      assert.equal(current.questionIndex, 6, "refresh restores the in-progress question");
      assert.equal(current.playerName, name);
    }
  }

  assert.equal(current.status, "complete");
  assert.equal(current.completedQuestions, 15);
  assert.equal(current.correctCount, 5, "the all-A test run matches the question bank");
  assert.equal(current.grade, 3.3);
  assert.equal(current.reviewAvailable, true);
  assert.equal(current.review.length, 15);
  assert.equal(current.review.filter((item) => item.correct).length, 5);
  assert.equal(current.review.filter((item) => item.timedOut).length, 1);
  assert.equal(current.review[0].selectedAnswer, null);
  for (const [index, item] of current.review.entries()) {
    assert.equal(item.questionNumber, index + 1);
    assert.ok(item.topic && item.rationale && item.correctAnswer);
    if (index > 0) assert.ok(item.selectedAnswer);
  }

  const recovered = await getState(round.cookie);
  assert.equal(recovered.status, "complete", "refresh restores the finished result");
  assert.equal(recovered.correctCount, current.correctCount);
  assert.equal(recovered.grade, current.grade);
  assert.deepEqual(recovered.review, current.review, "saved answers survive a refresh without duplicate history");
  const board = await (await fetch(`${origin}/api/leaderboard`)).json();
  assert.ok(board.players.some((player) => player.id === current.attemptId));

  const replay = await startPlayer(name);
  assert.notEqual(replay.cookie, round.cookie, "replay starts a fresh opaque attempt");
  assert.equal(replay.state.status, "playing");
  assert.equal(replay.state.questionIndex, 0);
  assert.equal(replay.state.correctCount, 0);

  const late = await startPlayer(`Late ${suffix}`);
  const waitMs = Math.max(0, late.state.deadlineAt - late.state.serverTime + 60);
  await delay(waitMs);
  const lateResponse = await answer(late.cookie, 0, 0);
  const lateState = await lateResponse.json();
  assert.equal(lateResponse.status, 409, "a late answer cannot score after timeout");
  assert.equal(lateState.questionIndex, 1);
  assert.equal(lateState.correctCount, 0);
  assert.equal(lateState.feedback?.timedOut, true);

  const lateRefresh = await getState(late.cookie);
  assert.equal(lateRefresh.questionIndex, 1, "refresh does not skip or score the timed-out question twice");
  assert.equal(lateRefresh.feedback?.timedOut, true);
});
