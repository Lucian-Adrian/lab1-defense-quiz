import { answerQuestion } from "../../quiz-service";
import { jsonResponse, readJson, unavailableResponse } from "../_http";

export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  const questionIndex = body?.questionIndex;
  if (typeof questionIndex !== "number" || !Number.isInteger(questionIndex) || questionIndex < 0) {
    return jsonResponse({ error: "The current question index is required." }, { status: 400 });
  }

  const timedOut = body?.timedOut === true;
  const choiceIndex = body?.choiceIndex;
  if (!timedOut && (typeof choiceIndex !== "number" || !Number.isInteger(choiceIndex))) {
    return jsonResponse({ error: "Choose one of the four answers." }, { status: 400 });
  }

  try {
    const input = timedOut
      ? { questionIndex, timedOut: true }
      : { questionIndex, choiceIndex: choiceIndex as number };
    const result = await answerQuestion(request, input);
    return jsonResponse({ ...result.state, ...(result.error ? { error: result.error } : {}) }, { status: result.httpStatus });
  } catch {
    return unavailableResponse();
  }
}
