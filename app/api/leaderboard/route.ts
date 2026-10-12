import { getLeaderboard } from "../../quiz-service";
import { jsonResponse, unavailableResponse } from "../_http";

export async function GET(): Promise<Response> {
  try {
    return jsonResponse(await getLeaderboard());
  } catch {
    return unavailableResponse();
  }
}
