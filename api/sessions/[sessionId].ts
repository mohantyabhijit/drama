import type { IncomingMessage, ServerResponse } from "node:http";
import { handleSessionById } from "../sessionStore.js";

export default async function handler(
  req: IncomingMessage & { query?: { sessionId?: string } },
  res: ServerResponse,
) {
  const sessionId = Array.isArray(req.query?.sessionId)
    ? req.query?.sessionId[0]
    : req.query?.sessionId;

  if (!sessionId) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "sessionId is required." }));
    return;
  }

  await handleSessionById(req, res, sessionId);
}
