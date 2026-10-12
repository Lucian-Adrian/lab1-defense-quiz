import { jsonResponse, readJson, unavailableResponse } from "../_http";
import { sessionCookie, startAttempt } from "../../quiz-service";

export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 32 || /[\u0000-\u001f\u007f]/.test(name)) {
    return jsonResponse({ error: "Use a name with 2 to 32 characters." }, { status: 400 });
  }

  try {
    const started = await startAttempt(name);
    return jsonResponse(started.state, {
      headers: { "Set-Cookie": sessionCookie(started.token, request) },
    });
  } catch {
    return unavailableResponse();
  }
}

