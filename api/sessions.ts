import type { IncomingMessage, ServerResponse } from "node:http";
import { handleSessionsIndex } from "./sessionStore.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handleSessionsIndex(req, res);
}
