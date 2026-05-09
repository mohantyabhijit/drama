# Shared Session Memory With Neon Design

Date: 2026-05-09
Project: D.R.A.M.A.
Scope: Add a session sidebar and shared agent memory so every council member sees the same talk context, then automatically distill ended sessions into long-term memory.

## Goal

Make D.R.A.M.A. feel like talking to a group of friends instead of opening isolated one-agent calls.

The product should support three connected behaviors:

1. Every talk is a persistent session.
2. Sessions appear in a left sidebar so the user can start a new talk or revisit older talks.
3. All agents share the active session context, and ended sessions automatically become long-term memory for future talks.

## Chosen Storage

Use Neon Postgres as the database.

Neon is the preferred option for this feature because it is a lightweight serverless Postgres database that deploys cleanly with Vercel through the Vercel Marketplace. The data model is relational: sessions, transcript events, agent turns, and long-term memories all benefit from stable IDs, timestamps, ordering, and joins.

Do not use plain SQLite for the Vercel deployment. Vercel Functions do not provide a durable writable filesystem for an app-owned SQLite file. SQLite-like hosted services such as Turso/libSQL could work, but they add another provider while Postgres already fits the current requirements.

## Non-Goals

- Building multi-user accounts in the first pass.
- Adding billing, teams, or sharing.
- Building vector search or embeddings in the first pass.
- Saving raw audio.
- Treating every sentence as permanent memory.
- Replacing the existing friend personas.
- Rewriting the realtime voice transport unless transcript capture requires a small focused change.

## User Experience Summary

The app gains a left sidebar.

The sidebar contains:

- a `New Talk` action
- the current active session
- recent ended sessions sorted by latest activity
- generated session titles
- small status/timestamp labels

The main area shows the selected session's council room. When the user asks a question, the current session records it. When the user talks to Maya, Noah, Ari, Zoe, or Ivy, the selected agent receives the same session history that the other agents would receive. If one agent already gave advice, the next agent can respond to that advice naturally.

When the user ends the session, the app automatically generates a compact memory summary and saves it to long-term memory. Future sessions include those saved memories in the context sent to agents.

## Primary User Flow

### Start a talk

1. User opens the app.
2. App loads sessions from Neon.
3. If there is an active session, the app selects it.
4. If there is no active session, the app creates a new empty active session.
5. User enters a prompt and asks the council.

### Talk to agents

1. User asks the council a question.
2. The app appends a user event to the selected session.
3. The council enters the current thinking/ready flow.
4. User selects a ready agent.
5. Backend builds that agent's context from base memory, long-term memory, current session events, and agent instructions.
6. Agent responds.
7. The app appends the agent response to the same session.
8. Other agents receive that response in their next turn.

### End a session

1. User taps `End Session`.
2. App marks the session as ending.
3. Backend summarizes the session into long-term memory.
4. Backend saves the memory rows and marks the session ended.
5. Sidebar moves the session into ended history.
6. User can start a new talk with long-term memory available.

## Data Model

### `sessions`

Represents one talk.

Fields:

- `id uuid primary key`
- `user_id text not null`
- `title text not null`
- `original_question text`
- `status text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `ended_at timestamptz`
- `memory_summary text`

Allowed statuses:

- `active`
- `ending`
- `ended`

The first version can use a generated local `user_id`, matching the current app's `friendsUserId` approach. When auth arrives, this becomes the authenticated user ID.

### `session_events`

Represents the shared session transcript.

Fields:

- `id uuid primary key`
- `session_id uuid not null references sessions(id)`
- `user_id text not null`
- `speaker_type text not null`
- `agent_id text`
- `content text not null`
- `summary text`
- `created_at timestamptz not null default now()`
- `sequence integer not null`
- `metadata jsonb not null default '{}'::jsonb`

Allowed speaker types:

- `user`
- `agent`
- `system`

The `sequence` field gives stable ordering even if events arrive close together.

### `long_term_memories`

Represents durable memory distilled from ended sessions.

Fields:

- `id uuid primary key`
- `user_id text not null`
- `source_session_id uuid references sessions(id)`
- `kind text not null`
- `content text not null`
- `importance integer not null default 3`
- `created_at timestamptz not null default now()`
- `last_used_at timestamptz`
- `metadata jsonb not null default '{}'::jsonb`

Suggested memory kinds:

- `preference`
- `decision`
- `project`
- `constraint`
- `follow_up`
- `personal_context`

The app should save a compact set of durable memories rather than one memory per transcript line.

## Context Assembly

Every agent turn should receive context in this order:

1. Base user memory from the existing prompt.
2. Long-term memories for the user, ordered by importance and recency.
3. Current session summary if available.
4. Recent current session events in chronological order.
5. Selected agent persona instructions.
6. Latest user message or opening instruction.

The goal is for the agent to sound like a friend who was present in the same room. If Maya already suggested a tiny beta, Ari should be able to critique that suggestion. If Ivy later speaks, she should be able to synthesize what Maya and Ari said.

## Memory Distillation

When a session ends, generate a memory summary automatically.

The memory distillation prompt should ask for:

- decisions the user made
- preferences revealed
- project details worth reusing
- constraints that affect future advice
- follow-ups the user likely cares about
- important emotional or interpersonal context only when useful

The prompt should reject:

- throwaway banter
- duplicate facts already known
- sensitive details that do not help future sessions
- exact private transcript replay
- uncertain claims presented as facts

The result should update `sessions.memory_summary` and insert a small number of `long_term_memories` rows.

## API Surface

Use Vercel serverless API routes.

Recommended endpoints:

- `GET /api/sessions?userId=...`
- `POST /api/sessions`
- `GET /api/sessions/:sessionId`
- `POST /api/sessions/:sessionId/events`
- `POST /api/sessions/:sessionId/end`
- `GET /api/memories?userId=...`

The existing `/api/friends-mode/init` flow should remain responsible for creating realtime voice sessions or client secrets. The new session APIs are responsible for durable app state.

## Realtime Voice Integration

The current realtime flow sends an opening line through the data channel. The shared-context version should generate that opening line from the selected session context, not only from the latest question.

Minimum viable behavior:

- append typed or transcribed user prompts to `session_events`
- include prior session events in the next agent opening line
- append known generated opening/take text for the selected agent

Improved behavior:

- listen for realtime transcript or output text events from the data channel
- append final agent transcript text to `session_events`
- append final user transcript text when realtime voice input is available

If full realtime transcript capture is not reliable in the first implementation, the UI should still persist the explicit user prompt and generated agent opening responses. The design should leave room to improve capture without changing the data model.

## UI Changes

### App shell

Add a two-column layout:

- fixed or responsive left sidebar
- main council session area

On mobile, the sidebar can collapse behind a history button or become a top drawer.

### Session sidebar

Requirements:

- show `New Talk`
- show active and ended sessions
- sort by `updated_at desc`
- select a session
- visually mark the selected session
- visually mark an active session
- show short generated titles

Session titles can initially come from the original question. Later, the backend can generate better titles.

### Main session area

Requirements:

- show the selected session's prompt composer and council row
- show session status
- show or summarize current transcript events
- provide `End Session` when the session is active
- disable agent interaction after a session is ended

## Error Handling

If Neon is unavailable:

- show a clear failure state in the sidebar or status area
- avoid pretending memory was saved
- keep the current prompt in component state so the user does not lose typed text immediately

If ending memory distillation fails:

- keep the session in `active` or `ending`
- show a retryable error
- do not mark the session as fully ended until memory persistence succeeds

If agent transcript capture fails:

- continue the live voice session
- save whatever explicit text is available
- show no noisy error unless persistence itself fails

## Testing

### Unit tests

Cover:

- session title fallback generation
- context assembly ordering
- memory distillation output validation
- event sequence assignment

### Integration tests

Cover:

- creating a session
- appending user and agent events
- listing sessions in recency order
- ending a session and writing long-term memory
- loading memories into a new session context

### UI tests

Cover:

- sidebar renders sessions
- `New Talk` creates/selects a session
- selecting a prior session updates the main area
- ending a session updates status and sidebar state

## Implementation Notes

Recommended stack additions:

- Neon Postgres through Vercel Marketplace
- `drizzle-orm`
- `drizzle-kit`
- `@neondatabase/serverless`

Recommended environment variable:

- `DATABASE_URL`

Keep schema and DB access behind small modules so the React UI does not import database code directly.

Suggested folders:

- `api/` or framework-appropriate Vercel functions for endpoints
- `src/sessionTypes.ts` for shared client/server types if staying close to the current Vite shape
- `src/sessionClient.ts` for frontend API calls
- `src/sessionContext.ts` or server equivalent for prompt assembly helpers
- `drizzle/` for migrations

## Rollout Plan

1. Add Neon and schema.
2. Add session API routes.
3. Add frontend session sidebar and selection state.
4. Persist user prompts and generated agent turns.
5. Assemble agent context from session and long-term memory.
6. Add `End Session` and automatic memory distillation.
7. Improve realtime transcript capture if the API event stream exposes reliable final transcript events.

## Product Decisions

The first implementation should use one generated `user_id` for the local prototype. Auth and multi-device identity can wait until session memory proves useful.

The first implementation should save automatic long-term memory on every ended session. Manual memory controls such as `forget`, `pin`, or `edit memory` should be designed later once the automatic loop exists.
