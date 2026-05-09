export type Chamber = "inner" | "group";
export type Tier = "fast" | "pro";

export type Persona = {
  id: string;
  name: string;
  role: string;
  bias: string;
  chamber: Chamber | "both";
  color: string;
  caution: number;
  line: string;
  blindSpot: string;
};

export type TranscriptTurn = {
  speaker: string;
  text: string;
  time: string;
  sentiment: "skeptical" | "cautious" | "positive";
};

export const personas: Persona[] = [
  {
    id: "overthinker",
    name: "The Overthinker",
    role: "Risk analyst",
    bias: "Analysis paralysis",
    chamber: "inner",
    color: "#2dd4bf",
    caution: 70,
    line: "What if we are optimizing for the wrong problem entirely?",
    blindSpot: "Can mistake motion for safety.",
  },
  {
    id: "cynic",
    name: "The Cynic",
    role: "Contrarian",
    bias: "Pessimism",
    chamber: "group",
    color: "#ef4444",
    caution: 80,
    line: "This is memorable, but your MVP is trying to eat the whole buffet.",
    blindSpot: "May confuse sharpness with truth.",
  },
  {
    id: "dreamer",
    name: "The Dreamer",
    role: "Optimist",
    bias: "Upside hunting",
    chamber: "both",
    color: "#f59e0b",
    caution: 60,
    line: "The name is sticky. The demo is instantly explainable.",
    blindSpot: "Can underprice execution drag.",
  },
  {
    id: "advocate",
    name: "The Devil's Advocate",
    role: "Scenario breaker",
    bias: "Contrarian",
    chamber: "group",
    color: "#8b5cf6",
    caution: 75,
    line: "Counterpoint: what could go horribly right here?",
    blindSpot: "Sometimes argues for sport.",
  },
  {
    id: "skeptic",
    name: "The Skeptic",
    role: "Reality check",
    bias: "Evidence first",
    chamber: "both",
    color: "#fb7185",
    caution: 65,
    line: "Do we have any data that actually supports this assumption?",
    blindSpot: "Can slow down a useful demo beat.",
  },
  {
    id: "hype",
    name: "The Hype Friend",
    role: "Momentum builder",
    bias: "Launch energy",
    chamber: "group",
    color: "#14b8a6",
    caution: 50,
    line: "Let's ship the strange part first. The strange part is the product.",
    blindSpot: "May over-trust vibes.",
  },
];

export const innerPersonas: Persona[] = [
  {
    id: "ambitious",
    name: "Ambitious Self",
    role: "Growth engine",
    bias: "Future identity",
    chamber: "inner",
    color: "#8b5cf6",
    caution: 48,
    line: "The cost of not trying will compound quietly.",
    blindSpot: "Can ignore energy limits.",
  },
  {
    id: "anxious",
    name: "Anxious Self",
    role: "Risk scanner",
    bias: "Avoid loss",
    chamber: "inner",
    color: "#ef4444",
    caution: 86,
    line: "Name the failure mode before it names you.",
    blindSpot: "Treats uncertainty as evidence.",
  },
  {
    id: "kind",
    name: "Kind Self",
    role: "Care filter",
    bias: "People impact",
    chamber: "inner",
    color: "#14b8a6",
    caution: 62,
    line: "Who gets helped, who gets dragged, and who gets forgotten?",
    blindSpot: "Can soften a necessary no.",
  },
  {
    id: "future",
    name: "Future Self",
    role: "Long arc",
    bias: "Regret minimization",
    chamber: "inner",
    color: "#f59e0b",
    caution: 55,
    line: "Pick the option you can explain with a straight face next year.",
    blindSpot: "Speaks in hindsight too early.",
  },
];

export const groupTranscript: TranscriptTurn[] = [
  {
    speaker: "The Cynic",
    text: "The joke lands, but the MVP only survives if the council room works before the research maze appears.",
    time: "00:24",
    sentiment: "skeptical",
  },
  {
    speaker: "The Dreamer",
    text: "People understand being judged by inner voices instantly. That is rare. Make the first minute theatrical.",
    time: "00:31",
    sentiment: "positive",
  },
  {
    speaker: "The Skeptic",
    text: "Voice latency is the real villain. Keep turns short, show speaker state, and provide text fallback.",
    time: "00:37",
    sentiment: "cautious",
  },
  {
    speaker: "The Devil's Advocate",
    text: "Pro mode should not be another chatbot. It should produce receipts like a case file.",
    time: "00:43",
    sentiment: "skeptical",
  },
  {
    speaker: "The Hype Friend",
    text: "Fast mode is the demo. Pro mode is the reason people believe it might become a product.",
    time: "00:49",
    sentiment: "positive",
  },
];

export const innerTranscript: TranscriptTurn[] = [
  {
    speaker: "Anxious Self",
    text: "This is exciting, which means we should immediately identify exactly how it breaks.",
    time: "00:18",
    sentiment: "skeptical",
  },
  {
    speaker: "Ambitious Self",
    text: "The voice council is the wedge. The case file is expansion. Stop trying to launch both as equals.",
    time: "00:26",
    sentiment: "positive",
  },
  {
    speaker: "Kind Self",
    text: "Make the product funny without making the user feel stupid for asking.",
    time: "00:34",
    sentiment: "cautious",
  },
  {
    speaker: "Future Self",
    text: "Ship the replay fallback. A reliable demo ages better than a fragile miracle.",
    time: "00:42",
    sentiment: "positive",
  },
];

export const receipts = [
  {
    title: "Voice AI adoption is accelerating",
    source: "Market scan",
    age: "2m ago",
    summary: "Teams are normalizing realtime voice agents for support, tutoring, coaching, and product demos.",
  },
  {
    title: "Realtime latency decides perceived quality",
    source: "API benchmark note",
    age: "4m ago",
    summary: "Users tolerate weaker answers better than awkward turn-taking pauses in live voice experiences.",
  },
  {
    title: "Decision tools need a visible point of view",
    source: "Product pattern",
    age: "7m ago",
    summary: "Persona bias makes recommendations feel interpretable instead of pretending to be neutral.",
  },
  {
    title: "Demo-first onboarding raises activation",
    source: "UX reference",
    age: "9m ago",
    summary: "Letting people try the system before heavy setup reduces abandonment in playful tools.",
  },
];

export const providers = [
  { name: "OpenAI Realtime", status: "Connected", tone: "good", metric: "Core voice loop" },
  { name: "Text fallback", status: "Ready", tone: "good", metric: "Replay trace" },
  { name: "Exa Receipts", status: "Mocked", tone: "warn", metric: "Pro case file" },
  { name: "Manus async", status: "Later", tone: "idle", metric: "Deep advisor" },
];

export const checklist = [
  "Council room and personas",
  "Realtime audio controls",
  "Transcript streaming",
  "Verdict and confidence",
  "Fast mode working",
  "Pro mode research",
  "Case file export",
  "Mic denial state",
  "No-key fallback",
  "90-second pitch",
];

export const architecture = [
  "React/Vite app",
  "Realtime token endpoint",
  "WebRTC plus data channel",
  "Persona router",
  "Transcript parser",
  "Verdict generator",
  "Pro receipts worker",
  "Case file export",
];
