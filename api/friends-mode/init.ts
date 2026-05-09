import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  FRIENDS_MODE_AGENTS,
  FRIENDS_MODE_VOICE_MODEL,
  type FriendVoiceAgentBlueprint,
  type FriendVoiceAgentRuntime,
} from "../../src/friendsMode.js";

const OPENAI_API_BASE = "https://api.openai.com/v1";
const CLIENT_SECRET_TTL_SECONDS = 600;
const KEYCHAIN_SERVICE_CANDIDATES = ["OPENAI_API_KEY", "openai_api_key", "openai"];

let cachedServerApiKey: string | null | undefined;

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("error", reject);
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body) as unknown);
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
  });
}

function getServerApiKey(): string | null {
  if (cachedServerApiKey !== undefined) {
    return cachedServerApiKey;
  }

  if (process.env.OPENAI_API_KEY?.trim()) {
    cachedServerApiKey = process.env.OPENAI_API_KEY.trim();
    return cachedServerApiKey;
  }

  for (const service of KEYCHAIN_SERVICE_CANDIDATES) {
    try {
      const value = execFileSync("security", ["find-generic-password", "-w", "-s", service], {
        encoding: "utf8",
      }).trim();

      if (value) {
        cachedServerApiKey = value;
        return value;
      }
    } catch {
      // Try the next candidate.
    }
  }

  cachedServerApiKey = null;
  return null;
}

function buildSafetyIdentifier(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

function getOpenAiErrorMessage(payload: unknown, statusCode: number): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }

  return `OpenAI request failed with status ${statusCode}.`;
}

async function createVoiceClientSecret(
  agent: FriendVoiceAgentBlueprint,
  apiKey: string,
  safetyIdentifier: string,
): Promise<FriendVoiceAgentRuntime> {
  const body = {
    expires_after: {
      anchor: "created_at",
      seconds: CLIENT_SECRET_TTL_SECONDS,
    },
    session: {
      type: "realtime",
      model: FRIENDS_MODE_VOICE_MODEL,
      instructions: agent.instructions,
      output_modalities: ["audio"],
      audio: {
        input: {
          turn_detection: {
            type: "semantic_vad",
            eagerness: "medium",
            create_response: true,
            interrupt_response: true,
          },
        },
        output: {
          voice: agent.voice,
          speed: 1.08,
        },
      },
      max_output_tokens: 900,
      tracing: "auto",
    },
  };

  const response = await fetch(`${OPENAI_API_BASE}/realtime/client_secrets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": safetyIdentifier,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        value?: string;
        expires_at?: number;
        session?: { id?: string };
      }
    | null;

  if (!response.ok || !payload?.value || typeof payload.expires_at !== "number") {
    throw new Error(getOpenAiErrorMessage(payload, response.status));
  }

  return {
    id: agent.id,
    kind: agent.kind,
    model: agent.model,
    voice: agent.voice,
    clientSecret: {
      value: payload.value,
      expiresAt: payload.expires_at,
    },
    sessionId: typeof payload.session?.id === "string" ? payload.session.id : null,
  };
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST /api/friends-mode/init." });
    return;
  }

  const apiKey = getServerApiKey();
  if (!apiKey) {
    sendJson(res, 500, {
      error: "OpenAI API key was not found. Set OPENAI_API_KEY in Vercel.",
    });
    return;
  }

  try {
    const body = (await readJsonBody(req)) as { userId?: unknown };
    const userId =
      typeof body.userId === "string" && body.userId.trim().length > 0
        ? body.userId.trim()
        : "anonymous-user";
    const safetyIdentifier = buildSafetyIdentifier(userId);

    const agents = await Promise.all(
      FRIENDS_MODE_AGENTS.map((agent) =>
        createVoiceClientSecret(agent, apiKey, safetyIdentifier),
      ),
    );

    sendJson(res, 200, {
      mode: "friends",
      models: [FRIENDS_MODE_VOICE_MODEL],
      initializedAt: new Date().toISOString(),
      agents,
    });
  } catch (error) {
    sendJson(res, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Unable to initialize Friends Mode voice agents.",
    });
  }
}
