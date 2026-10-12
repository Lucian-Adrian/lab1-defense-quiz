import { jsonResponse, unavailableResponse } from "../_http";
import { getAttemptState } from "../../quiz-service";

export async function GET(request: Request): Promise<Response> {
  try {
    return jsonResponse(await getAttemptState(request));
  } catch {
    return unavailableResponse();
  }
}
