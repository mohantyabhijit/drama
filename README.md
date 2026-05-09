# D.R.A.M.A.

D.R.A.M.A. is Decision Review by Artificial Moronic Advisors: a playful realtime voice council for pressure-testing choices before they harden into plans. The demo imagines AI personas as biased advisors, each with a clear role, blind spot, and speaking style. In Group D.R.A.M.A., a chaotic friend council critiques an idea, votes, and turns messy reactions into a useful verdict. In Inner D.R.A.M.A., your own contradictory selves debate a personal decision with ambition, risk, care, and future regret in the room.

The current repo is a Vite, React, and TypeScript prototype. It ships a polished interactive mock of the council room, persona controls, live transcript, verdict panel, research receipts, architecture checklist, and a standalone `plan.html` concept document. The app is demo-first: it can replay scripted conversations, show Fast versus Pro modes, and communicate the intended product loop without requiring backend voice infrastructure yet. The goal is a product pitch, clickable prototype, and implementation roadmap sharing one compact surface for critique, iteration, and investor-friendly storytelling during early testing.

Run it locally:

```bash
npm install
npm run dev
```

Build check:

```bash
npm run build
```

Next milestones: connect realtime audio, add a token endpoint, persist sessions, and make Pro receipts real.
