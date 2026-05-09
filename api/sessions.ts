import type { IncomingMessage, ServerResponse } from "node:http";
import { handleSessionsIndex } from "../server/sessionStore.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handleSessionsIndex(req, res);
}
