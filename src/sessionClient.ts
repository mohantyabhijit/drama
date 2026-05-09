import type {
  DramaSession,
  LongTermMemory,
  SessionBundle,
  SessionEvent,
  SessionSpeakerType,
} from "./sessionTypes";

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed with status ${response.status}.`);
  }

  if (!payload) {
    throw new Error("Empty server response.");
  }

  return payload as T;
}

export async function listSessions(userId: string): Promise<DramaSession[]> {
  const response = await fetch(`/api/sessions?userId=${encodeURIComponent(userId)}`);
  const payload = await parseResponse<{ sessions: DramaSession[] }>(response);
  return payload.sessions;
}

export async function createSession(input: {
  userId: string;
  originalQuestion?: string | null;
}): Promise<DramaSession> {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await parseResponse<{ session: DramaSession }>(response);
  return payload.session;
}

export async function getSessionBundle(input: {
  userId: string;
  sessionId: string;
}): Promise<SessionBundle> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(input.sessionId)}?userId=${encodeURIComponent(input.userId)}`,
  );
  return await parseResponse<SessionBundle>(response);
}

export async function appendSessionEvent(input: {
  userId: string;
  sessionId: string;
  speakerType: SessionSpeakerType;
  agentId?: string | null;
  content: string;
  summary?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<SessionEvent> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(input.sessionId)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await parseResponse<{ event: SessionEvent }>(response);
  return payload.event;
}

export async function endSession(input: {
  userId: string;
  sessionId: string;
}): Promise<{ session: DramaSession; events: SessionEvent[]; memory: LongTermMemory | null }> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(input.sessionId)}/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: input.userId }),
  });
  return await parseResponse<{
    session: DramaSession;
    events: SessionEvent[];
    memory: LongTermMemory | null;
  }>(response);
}

export async function listMemories(userId: string): Promise<LongTermMemory[]> {
  const response = await fetch(`/api/memories?userId=${encodeURIComponent(userId)}`);
  const payload = await parseResponse<{ memories: LongTermMemory[] }>(response);
  return payload.memories;
}
