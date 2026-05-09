import type { IncomingMessage, ServerResponse } from "node:http";
import { handleMemoriesIndex } from "../server/sessionStore.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handleMemoriesIndex(req, res);
}
