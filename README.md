# D.R.A.M.A.

D.R.A.M.A. stands for **Decision Review by Artificial Moronic Advisors**: it's your closest group of friends always live as an AI council.

You ask a question, choose a friend-style AI advisor, speak live, review the conversation transcript, and keep session history so recurring dilemmas can build context over time.

- Live app: https://drama-dun.vercel.app/
- YouTube demo: https://youtu.be/NrdoRJlTaFQ

## What It Does

- Runs a friend council with opinionated AI personas such as Bobo, Sandy, and Adi.
- Starts realtime voice previews through OpenAI Realtime sessions.
- Captures live transcript lines from user and agent turns.
- Stores sessions, transcript events, text summaries, and long-term memories without keeping voice recordings.
- Supports voice prompt input in browsers with Speech Recognition support.
- Provides a polished prototype surface for demos, product critique, and roadmap conversations.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **UI and interaction:** Framer Motion, Lucide React, custom CSS
- **Voice AI:** OpenAI Realtime API, WebRTC, data channels, browser microphone APIs
- **Speech input:** Browser Speech Recognition / `webkitSpeechRecognition`
- **Backend:** Vercel serverless API routes using Node.js request handlers
- **Database:** Neon serverless Postgres via `@neondatabase/serverless`
- **Persistence:** Sessions, transcript events, multilingual text summaries, and long-term memories
- **Deployment:** Vercel

## Local Development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Run a production build check:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Environment Variables

Configure these in Vercel or your local environment:

- `OPENAI_API_KEY`: Used by the API route that creates short-lived realtime client secrets.
- `DATABASE_URL`: Neon/Postgres connection string for sessions, events, summaries, and memories.

Do not commit database URLs, API keys, or pooled credentials.

## Project Shape

```text
api/                 Vercel API routes for voice init, sessions, and memories
server/              Shared server-side session store and persistence helpers
src/                 React app, voice client, session client, styles, and persona definitions
public/assets/       Friend avatar and UI assets
plan.html            Standalone concept document / product plan
```

## Status

D.R.A.M.A. is a demo-first prototype. The current build focuses on the core experience: realtime persona voices, saved sessions, transcripts, and a GitHub-ready product narrative.

Next milestones include deeper council orchestration, richer verdict generation, stronger session summaries, and production hardening around auth, observability, and privacy controls.
