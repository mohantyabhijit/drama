import type { IncomingMessage, ServerResponse } from "node:http";
import { neon } from "@neondatabase/serverless";

export type SessionStatus = "active" | "ending" | "ended";
export type SessionSpeakerType = "user" | "agent" | "system";

export type DramaSession = {
  id: string;
  userId: string;
  title: string;
  originalQuestion: string | null;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  memorySummary: string | null;
};

export type SessionEvent = {
  id: string;
  sessionId: string;
  userId: string;
  speakerType: SessionSpeakerType;
  agentId: string | null;
  content: string;
  summary: string | null;
  createdAt: string;
  sequence: number;
  metadata: Record<string, unknown>;
};

export type LongTermMemory = {
  id: string;
  userId: string;
  sourceSessionId: string | null;
  kind: string;
  content: string;
  importance: number;
  createdAt: string;
  lastUsedAt: string | null;
  metadata: Record<string, unknown>;
};

type SessionRow = {
  id: string;
  user_id: string;
  title: string;
  original_question: string | null;
  status: SessionStatus;
  created_at: string | Date;
  updated_at: string | Date;
  ended_at: string | Date | null;
  memory_summary: string | null;
};

type EventRow = {
  id: string;
  session_id: string;
  user_id: string;
  speaker_type: SessionSpeakerType;
  agent_id: string | null;
  content: string;
  summary: string | null;
  created_at: string | Date;
  sequence: number;
  metadata: Record<string, unknown> | null;
};

type MemoryRow = {
  id: string;
  user_id: string;
  source_session_id: string | null;
  kind: string;
  content: string;
  importance: number;
  created_at: string | Date;
  last_used_at: string | Date | null;
  metadata: Record<string, unknown> | null;
};

let schemaReady: Promise<void> | null = null;

function getSql() {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return neon(databaseUrl);
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapSession(row: SessionRow): DramaSession {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    originalQuestion: row.original_question,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    endedAt: row.ended_at ? toIso(row.ended_at) : null,
    memorySummary: row.memory_summary,
  };
}

function mapEvent(row: EventRow): SessionEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    speakerType: row.speaker_type,
    agentId: row.agent_id,
    content: row.content,
    summary: row.summary,
    createdAt: toIso(row.created_at),
    sequence: row.sequence,
    metadata: row.metadata ?? {},
  };
}

function mapMemory(row: MemoryRow): LongTermMemory {
  return {
    id: row.id,
    userId: row.user_id,
    sourceSessionId: row.source_session_id,
    kind: row.kind,
    content: row.content,
    importance: row.importance,
    createdAt: toIso(row.created_at),
    lastUsedAt: row.last_used_at ? toIso(row.last_used_at) : null,
    metadata: row.metadata ?? {},
  };
}

export function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
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

export async function ensureSessionSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`create extension if not exists pgcrypto`;
      await sql`
        create table if not exists sessions (
          id uuid primary key default gen_random_uuid(),
          user_id text not null,
          title text not null,
          original_question text,
          status text not null default 'active',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          ended_at timestamptz,
          memory_summary text
        )
      `;
      await sql`
        create table if not exists session_events (
          id uuid primary key default gen_random_uuid(),
          session_id uuid not null references sessions(id) on delete cascade,
          user_id text not null,
          speaker_type text not null,
          agent_id text,
          content text not null,
          summary text,
          created_at timestamptz not null default now(),
          sequence integer not null,
          metadata jsonb not null default '{}'::jsonb,
          unique(session_id, sequence)
        )
      `;
      await sql`
        create table if not exists long_term_memories (
          id uuid primary key default gen_random_uuid(),
          user_id text not null,
          source_session_id uuid references sessions(id) on delete set null,
          kind text not null,
          content text not null,
          importance integer not null default 3,
          created_at timestamptz not null default now(),
          last_used_at timestamptz,
          metadata jsonb not null default '{}'::jsonb
        )
      `;
      await sql`create index if not exists sessions_user_updated_idx on sessions (user_id, updated_at desc)`;
      await sql`create index if not exists session_events_session_sequence_idx on session_events (session_id, sequence)`;
      await sql`create index if not exists memories_user_created_idx on long_term_memories (user_id, created_at desc)`;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  await schemaReady;
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function makeTitle(question: string | null): string {
  if (!question) {
    return "New Talk";
  }

  const normalized = question.replace(/\s+/g, " ").trim();
  if (normalized.length <= 54) {
    return normalized;
  }
  return `${normalized.slice(0, 51).trim()}...`;
}

function summarizeSession(events: SessionEvent[]): string {
  const useful = events
    .filter((event) => event.speakerType !== "system")
    .slice(0, 12)
    .map((event) => {
      const speaker = event.speakerType === "agent" ? event.agentId ?? "agent" : "user";
      return `${speaker}: ${event.content.replace(/\s+/g, " ").trim()}`;
    });

  if (useful.length === 0) {
    return "Session ended without durable conversation details.";
  }

  return useful.join("\n").slice(0, 1800);
}

export async function listSessions(userId: string): Promise<DramaSession[]> {
  await ensureSessionSchema();
  const sql = getSql();
  const rows = (await sql`
    select *
    from sessions
    where user_id = ${userId}
    order by updated_at desc
    limit 60
  `) as SessionRow[];
  return rows.map(mapSession);
}

export async function createSession(input: {
  userId: string;
  originalQuestion?: string | null;
}): Promise<DramaSession> {
  await ensureSessionSchema();
  const sql = getSql();
  const originalQuestion = input.originalQuestion?.trim() || null;
  const title = makeTitle(originalQuestion);
  const [row] = (await sql`
    insert into sessions (user_id, title, original_question)
    values (${input.userId}, ${title}, ${originalQuestion})
    returning *
  `) as SessionRow[];
  return mapSession(row);
}

export async function getSessionBundle(input: {
  userId: string;
  sessionId: string;
}): Promise<{ session: DramaSession; events: SessionEvent[] }> {
  await ensureSessionSchema();
  const sql = getSql();
  const [sessionRow] = (await sql`
    select *
    from sessions
    where id = ${input.sessionId} and user_id = ${input.userId}
    limit 1
  `) as SessionRow[];

  if (!sessionRow) {
    throw new Error("Session not found.");
  }

  const eventRows = (await sql`
    select *
    from session_events
    where session_id = ${input.sessionId} and user_id = ${input.userId}
    order by sequence asc
  `) as EventRow[];

  return {
    session: mapSession(sessionRow),
    events: eventRows.map(mapEvent),
  };
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
  await ensureSessionSchema();
  const sql = getSql();
  const content = input.content.trim();
  if (!content) {
    throw new Error("content is required.");
  }

  const [row] = (await sql`
    with next_sequence as (
      select coalesce(max(sequence), 0) + 1 as value
      from session_events
      where session_id = ${input.sessionId}
    ), owner_session as (
      select id
      from sessions
      where id = ${input.sessionId} and user_id = ${input.userId} and status = 'active'
    ), inserted_event as (
      insert into session_events (
        session_id,
        user_id,
        speaker_type,
        agent_id,
        content,
        summary,
        sequence,
        metadata
      )
      select
        owner_session.id,
        ${input.userId},
        ${input.speakerType},
        ${input.agentId ?? null},
        ${content},
        ${input.summary?.trim() || null},
        next_sequence.value,
        ${JSON.stringify(input.metadata ?? {})}::jsonb
      from owner_session, next_sequence
      returning *
    )
    update sessions
    set updated_at = now(),
        title = case
          when original_question is null and ${input.speakerType} = 'user'
          then ${makeTitle(content)}
          else title
        end,
        original_question = case
          when original_question is null and ${input.speakerType} = 'user'
          then ${content}
          else original_question
        end
    where id = ${input.sessionId}
      and exists (select 1 from inserted_event)
    returning (select id from inserted_event) as id,
              (select session_id from inserted_event) as session_id,
              (select user_id from inserted_event) as user_id,
              (select speaker_type from inserted_event) as speaker_type,
              (select agent_id from inserted_event) as agent_id,
              (select content from inserted_event) as content,
              (select summary from inserted_event) as summary,
              (select created_at from inserted_event) as created_at,
              (select sequence from inserted_event) as sequence,
              (select metadata from inserted_event) as metadata
  `) as EventRow[];

  if (!row) {
    throw new Error("Active session not found.");
  }

  return mapEvent(row);
}

export async function endSession(input: {
  userId: string;
  sessionId: string;
}): Promise<{ session: DramaSession; memory: LongTermMemory | null }> {
  await ensureSessionSchema();
  const sql = getSql();
  const bundle = await getSessionBundle(input);
  if (bundle.session.status === "ended") {
    const memoryRows = (await sql`
      select *
      from long_term_memories
      where source_session_id = ${input.sessionId} and user_id = ${input.userId}
      order by created_at desc
      limit 1
    `) as MemoryRow[];
    return {
      session: bundle.session,
      memory: memoryRows[0] ? mapMemory(memoryRows[0]) : null,
    };
  }

  const memorySummary = summarizeSession(bundle.events);
  const [sessionRow] = (await sql`
    update sessions
    set status = 'ended',
        ended_at = now(),
        updated_at = now(),
        memory_summary = ${memorySummary}
    where id = ${input.sessionId} and user_id = ${input.userId}
    returning *
  `) as SessionRow[];

  if (!sessionRow) {
    throw new Error("Session not found.");
  }

  const shouldRemember = bundle.events.some((event) => event.speakerType !== "system");
  if (!shouldRemember) {
    return { session: mapSession(sessionRow), memory: null };
  }

  const [memoryRow] = (await sql`
    insert into long_term_memories (
      user_id,
      source_session_id,
      kind,
      content,
      importance,
      metadata
    )
    values (
      ${input.userId},
      ${input.sessionId},
      'session_summary',
      ${memorySummary},
      3,
      ${JSON.stringify({ title: sessionRow.title })}::jsonb
    )
    returning *
  `) as MemoryRow[];

  return {
    session: mapSession(sessionRow),
    memory: memoryRow ? mapMemory(memoryRow) : null,
  };
}

export async function listMemories(userId: string): Promise<LongTermMemory[]> {
  await ensureSessionSchema();
  const sql = getSql();
  const rows = (await sql`
    select *
    from long_term_memories
    where user_id = ${userId}
    order by importance desc, created_at desc
    limit 40
  `) as MemoryRow[];
  return rows.map(mapMemory);
}

export function getPathParts(req: IncomingMessage): string[] {
  const rawUrl =
    "originalUrl" in req && typeof req.originalUrl === "string" ? req.originalUrl : req.url;
  const url = new URL(rawUrl ?? "/", "http://localhost");
  return url.pathname.split("/").filter(Boolean);
}

export function getQueryText(req: IncomingMessage, name: string): string | null {
  const url = new URL(req.url ?? "/", "http://localhost");
  const value = url.searchParams.get(name);
  return value?.trim() || null;
}

export async function handleSessionsIndex(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (req.method === "GET") {
      const userId = requireText(getQueryText(req, "userId"), "userId");
      sendJson(res, 200, { sessions: await listSessions(userId) });
      return;
    }

    if (req.method === "POST") {
      const body = (await readJsonBody(req)) as {
        userId?: unknown;
        originalQuestion?: unknown;
      };
      const userId = requireText(body.userId, "userId");
      const originalQuestion =
        typeof body.originalQuestion === "string" ? body.originalQuestion : null;
      sendJson(res, 201, { session: await createSession({ userId, originalQuestion }) });
      return;
    }

    sendJson(res, 405, { error: "Use GET or POST." });
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Request failed." });
  }
}

export async function handleSessionById(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
): Promise<void> {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Use GET." });
      return;
    }

    const userId = requireText(getQueryText(req, "userId"), "userId");
    sendJson(res, 200, await getSessionBundle({ userId, sessionId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    sendJson(res, message === "Session not found." ? 404 : 400, { error: message });
  }
}

export async function handleSessionEvents(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
): Promise<void> {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Use POST." });
      return;
    }

    const body = (await readJsonBody(req)) as {
      userId?: unknown;
      speakerType?: unknown;
      agentId?: unknown;
      content?: unknown;
      summary?: unknown;
      metadata?: unknown;
    };
    const userId = requireText(body.userId, "userId");
    const speakerType = requireText(body.speakerType, "speakerType");
    if (!["user", "agent", "system"].includes(speakerType)) {
      throw new Error("speakerType must be user, agent, or system.");
    }
    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};

    const event = await appendSessionEvent({
      userId,
      sessionId,
      speakerType: speakerType as SessionSpeakerType,
      agentId: typeof body.agentId === "string" ? body.agentId : null,
      content: requireText(body.content, "content"),
      summary: typeof body.summary === "string" ? body.summary : null,
      metadata,
    });

    sendJson(res, 201, { event });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    sendJson(res, message.includes("not found") ? 404 : 400, { error: message });
  }
}

export async function handleSessionEnd(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
): Promise<void> {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Use POST." });
      return;
    }

    const body = (await readJsonBody(req)) as { userId?: unknown };
    const userId = requireText(body.userId, "userId");
    sendJson(res, 200, await endSession({ userId, sessionId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    sendJson(res, message.includes("not found") ? 404 : 400, { error: message });
  }
}

export async function handleMemoriesIndex(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Use GET." });
      return;
    }

    const userId = requireText(getQueryText(req, "userId"), "userId");
    sendJson(res, 200, { memories: await listMemories(userId) });
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Request failed." });
  }
}
