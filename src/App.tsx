import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AudioLines,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  Mic,
  PanelRight,
  Pause,
  PhoneOff,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Settings,
  Shield,
  SlidersHorizontal,
  Users,
  Zap,
} from "lucide-react";
import {
  architecture,
  checklist,
  groupTranscript,
  innerPersonas,
  innerTranscript,
  personas,
  providers,
  receipts,
  type Chamber,
  type Persona,
  type Tier,
  type TranscriptTurn,
} from "./data";

const chamberCopy: Record<Chamber, { title: string; body: string; prompt: string }> = {
  group: {
    title: "Group D.R.A.M.A.",
    body: "A chaotic friend council roasts, improves, and votes on an idea in one tight voice room.",
    prompt: "I want to build an AI app where my friends roast my startup ideas.",
  },
  inner: {
    title: "Inner D.R.A.M.A.",
    body: "Your own self-facets debate a decision with useful tension between risk, ambition, care, and time.",
    prompt: "Should I quit my job to build this?",
  },
};

const sentimentColor = {
  skeptical: "#ef4444",
  cautious: "#f59e0b",
  positive: "#14b8a6",
};

function App() {
  const [chamber, setChamber] = useState<Chamber>("group");
  const [tier, setTier] = useState<Tier>("pro");
  const [isPlaying, setIsPlaying] = useState(true);
  const [turnIndex, setTurnIndex] = useState(2);
  const [selectedPersonaId, setSelectedPersonaId] = useState("cynic");
  const [turnLength, setTurnLength] = useState("Medium");
  const [personaValues, setPersonaValues] = useState<Record<string, number>>(
    Object.fromEntries([...personas, ...innerPersonas].map((persona) => [persona.id, persona.caution])),
  );
  const [enabledPersonas, setEnabledPersonas] = useState<Record<string, boolean>>(
    Object.fromEntries([...personas, ...innerPersonas].map((persona) => [persona.id, true])),
  );
  const [addedPersona, setAddedPersona] = useState(false);

  const visiblePersonas = useMemo(() => {
    const base = chamber === "group" ? personas : innerPersonas;
    return addedPersona
      ? [
          ...base,
          {
            id: "wildcard",
            name: "Wildcard Advisor",
            role: "Pattern breaker",
            bias: "Make it stranger",
            chamber,
            color: "#2563eb",
            caution: 57,
            line: "The obvious version is crowded. What is the unfairly memorable version?",
            blindSpot: "Can over-design the punchline.",
          } satisfies Persona,
        ]
      : base;
  }, [addedPersona, chamber]);

  const transcript = chamber === "group" ? groupTranscript : innerTranscript;
  const activeTurn = transcript[Math.min(turnIndex, transcript.length - 1)];
  const selectedPersona = visiblePersonas.find((persona) => persona.id === selectedPersonaId) ?? visiblePersonas[0];
  const visibleTurns = transcript.slice(0, Math.min(turnIndex + 1, transcript.length));
  const checkedCount = tier === "pro" ? 6 : 5;

  useEffect(() => {
    setTurnIndex(2);
    setSelectedPersonaId(chamber === "group" ? "cynic" : "anxious");
  }, [chamber]);

  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      setTurnIndex((current) => (current >= transcript.length - 1 ? 0 : current + 1));
    }, 2200);

    return () => window.clearInterval(timer);
  }, [isPlaying, transcript.length]);

  return (
    <div className="app">
      <Header />

      <main>
        <section className="hero-shell" id="demo" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="brand-lockup" aria-label="D.R.A.M.A. logo">
              <span className="brand-mark">D</span>
              <span>D.R.A.M.A.</span>
            </div>
            <h1 id="hero-title">D.R.A.M.A.</h1>
            <p className="hero-subtitle">
              <strong>Decision Review by Artificial Moronic Advisors.</strong> A realtime voice council of flawed
              AI personas that pressure-test your decisions from every ridiculous angle.
            </p>
            <div className="hero-actions">
              <button className="primary-action" type="button" onClick={() => setIsPlaying(true)}>
                <span>Start a Live Council</span>
                <AudioLines size={18} aria-hidden="true" />
              </button>
              <button className="ghost-action" type="button" onClick={() => setTurnIndex(0)}>
                <span>Replay Demo Trace</span>
                <Play size={17} aria-hidden="true" />
              </button>
            </div>
            <ModeCards chamber={chamber} setChamber={setChamber} />
          </div>

          <LiveRoom
            activeTurn={activeTurn}
            chamber={chamber}
            isPlaying={isPlaying}
            personas={visiblePersonas}
            selectedPersonaId={selectedPersonaId}
            setIsPlaying={setIsPlaying}
            setSelectedPersonaId={setSelectedPersonaId}
            setTurnIndex={setTurnIndex}
            tier={tier}
          />

          <TranscriptPanel turns={visibleTurns} />
          <VerdictPanel chamber={chamber} tier={tier} />
          <SummaryPanel activeTurn={activeTurn} transcript={transcript} />
        </section>

        <section className="workspace-grid" id="personas" aria-label="Demo setup workspace">
          <PersonaSetup
            enabledPersonas={enabledPersonas}
            personas={visiblePersonas}
            personaValues={personaValues}
            selectedPersona={selectedPersona}
            setAddedPersona={setAddedPersona}
            setEnabledPersonas={setEnabledPersonas}
            setPersonaValues={setPersonaValues}
            setSelectedPersonaId={setSelectedPersonaId}
          />
          <ModeTierPanel chamber={chamber} setChamber={setChamber} setTier={setTier} setTurnLength={setTurnLength} tier={tier} turnLength={turnLength} />
          <ResearchPanel tier={tier} />
        </section>

        <section className="lower-grid" id="architecture" aria-label="Architecture and readiness">
          <ArchitecturePanel />
          <ChecklistPanel checkedCount={checkedCount} />
        </section>

        <CallToAction setIsPlaying={setIsPlaying} />
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="site-header">
      <a className="logo" href="#demo" aria-label="D.R.A.M.A. home">
        <span className="logo-ring">D</span>
        <span>
          D.R.A.M.A.
          <small>Voice Council</small>
        </span>
      </a>
      <nav aria-label="Primary navigation">
        <a href="#demo">Demo</a>
        <a href="#personas">Personas</a>
        <a href="#architecture">Architecture</a>
        <a href="#providers">Providers</a>
      </nav>
      <div className="header-actions">
        <span className="system-ready">
          <span aria-hidden="true"></span>
          System Ready
        </span>
        <a className="launch-link" href="#demo">
          Launch Council
        </a>
      </div>
    </header>
  );
}

function ModeCards({
  chamber,
  setChamber,
}: {
  chamber: Chamber;
  setChamber: (chamber: Chamber) => void;
}) {
  return (
    <div className="mode-card-row" aria-label="Chamber selector">
      {(["inner", "group"] as Chamber[]).map((item) => {
        const isActive = chamber === item;
        const Icon = item === "inner" ? Brain : Users;
        return (
          <button
            className={`mode-tile ${isActive ? "active" : ""}`}
            type="button"
            key={item}
            onClick={() => setChamber(item)}
            aria-pressed={isActive}
          >
            <Icon size={30} aria-hidden="true" />
            <strong>{item === "inner" ? "Inner D.R.A.M.A." : "Group D.R.A.M.A."}</strong>
            <span>{item === "inner" ? "Your contradictions." : "Invite others. Argue together."}</span>
          </button>
        );
      })}
    </div>
  );
}

function LiveRoom({
  activeTurn,
  chamber,
  isPlaying,
  personas,
  selectedPersonaId,
  setIsPlaying,
  setSelectedPersonaId,
  setTurnIndex,
  tier,
}: {
  activeTurn: TranscriptTurn;
  chamber: Chamber;
  isPlaying: boolean;
  personas: Persona[];
  selectedPersonaId: string;
  setIsPlaying: (value: boolean) => void;
  setSelectedPersonaId: (id: string) => void;
  setTurnIndex: (index: number) => void;
  tier: Tier;
}) {
  return (
    <section className="live-room" aria-label="Live council room">
      <div className="room-toolbar">
        <div>
          <span className="toolbar-title">Live Council Room</span>
          <span className="recording-state">Live</span>
          <span className="timer">00:02:47</span>
        </div>
        <div className="toolbar-actions">
          <button type="button">
            <PanelRight size={15} aria-hidden="true" />
            Full Screen
          </button>
          <button className="danger" type="button" onClick={() => setIsPlaying(false)}>
            End Session
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="council-stage">
        <img src="/assets/council-room.png" alt="Dramatic AI council around a circular decision table" />
        <div className="stage-gradient" aria-hidden="true"></div>
        <div className="speaker-stack" aria-label="Persona speaker controls">
          {personas.slice(0, 5).map((persona, index) => {
            const isActive = activeTurn.speaker === persona.name || selectedPersonaId === persona.id;
            return (
              <button
                className={`speaker-chip speaker-${index + 1} ${isActive ? "active" : ""}`}
                type="button"
                key={persona.id}
                onClick={() => setSelectedPersonaId(persona.id)}
                style={{ "--accent": persona.color } as React.CSSProperties}
              >
                <span>{persona.name}</span>
                <small>{persona.role}</small>
              </button>
            );
          })}
        </div>
        <div className="user-seat">
          <span>You</span>
          <small>Decision maker</small>
        </div>
      </div>

      <div className="wave-console">
        <div className="waveform" aria-hidden="true">
          {Array.from({ length: 56 }, (_, index) => (
            <i
              key={index}
              style={
                {
                  "--bar": `${16 + ((index * 17) % 52)}px`,
                  "--delay": `${(index % 9) * 70}ms`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
        <p>
          <span style={{ color: sentimentColor[activeTurn.sentiment] }}>{activeTurn.speaker}</span> is speaking...
        </p>
        <div className="room-controls">
          <button type="button" aria-label="Mute all">
            <Mic size={18} aria-hidden="true" />
            <span>Mute All</span>
          </button>
          <button className="round-control" type="button" aria-label={isPlaying ? "Pause replay" : "Play replay"} onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? <Pause size={24} aria-hidden="true" /> : <Play size={24} aria-hidden="true" />}
          </button>
          <button className="call-control" type="button" aria-label="End call" onClick={() => setIsPlaying(false)}>
            <PhoneOff size={24} aria-hidden="true" />
          </button>
          <button className="round-control" type="button" aria-label="Restart replay" onClick={() => setTurnIndex(0)}>
            <RotateCcw size={21} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Open settings">
            <Settings size={18} aria-hidden="true" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      <div className="provider-bar" id="providers">
        <span>Providers</span>
        <strong>{tier === "pro" ? "Pro orchestration" : "Fast realtime"}</strong>
        <span>{chamberCopy[chamber].title}</span>
        <span>Latency 128ms</span>
        <span>Region us-east-1</span>
      </div>
    </section>
  );
}

function TranscriptPanel({ turns }: { turns: TranscriptTurn[] }) {
  return (
    <section className="panel transcript-panel" aria-labelledby="transcript-title">
      <div className="panel-heading">
        <div>
          <h2 id="transcript-title">Transcript</h2>
          <span>Live speaker markers</span>
        </div>
        <button type="button" aria-label="Download transcript">
          <Download size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="transcript-list">
        {turns.map((turn) => (
          <article className="turn" key={`${turn.speaker}-${turn.time}`} style={{ "--accent": sentimentColor[turn.sentiment] } as React.CSSProperties}>
            <div className="avatar" aria-hidden="true">
              {turn.speaker
                .split(" ")
                .filter(Boolean)
                .slice(-1)[0]
                .charAt(0)}
            </div>
            <div>
              <div className="turn-meta">
                <strong>{turn.speaker}</strong>
                <span>{turn.time}</span>
              </div>
              <p>{turn.text}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="live-note">
        <span aria-hidden="true"></span>
        Live auto-scroll on
      </div>
    </section>
  );
}

function VerdictPanel({ chamber, tier }: { chamber: Chamber; tier: Tier }) {
  const verdict = tier === "pro" ? "Proceed with Receipts" : chamber === "group" ? "Make it weirder" : "Sleep, then build";
  return (
    <section className="panel verdict-panel" aria-labelledby="verdict-title">
      <div className="panel-heading">
        <div>
          <h2 id="verdict-title">Verdict</h2>
          <span>{tier === "pro" ? "Case-backed decision" : "Fast council read"}</span>
        </div>
        <Shield size={18} aria-hidden="true" />
      </div>
      <div className="verdict-crest" aria-hidden="true">
        <BookOpen size={38} />
      </div>
      <h3>{verdict}</h3>
      <p>
        Confidence: <strong>{tier === "pro" ? "72%" : "64%"}</strong>
      </p>
      <ul>
        <li>Validate assumptions before scaling.</li>
        <li>Keep the first voice flow under ninety seconds.</li>
        <li>Use replay fallback when the API key is not available.</li>
      </ul>
      <button type="button">
        See Full Rationale
        <ChevronRight size={17} aria-hidden="true" />
      </button>
    </section>
  );
}

function SummaryPanel({ activeTurn, transcript }: { activeTurn: TranscriptTurn; transcript: TranscriptTurn[] }) {
  return (
    <section className="panel summary-panel" aria-labelledby="summary-title">
      <div className="panel-heading">
        <div>
          <h2 id="summary-title">Council Summary</h2>
          <span>Session analytics</span>
        </div>
        <Activity size={18} aria-hidden="true" />
      </div>
      <div className="metric-grid">
        <Metric label="Total turns" value={String(transcript.length + 13)} />
        <Metric label="Dominant persona" value={activeTurn.speaker} />
        <Metric label="Avg speaking time" value="18.4s" />
        <Metric label="Interruption rate" value="27%" />
      </div>
      <div className="sentiment-bars" aria-label="Sentiment mix">
        <span style={{ width: "42%", background: "#ef4444" }}></span>
        <span style={{ width: "33%", background: "#f59e0b" }}></span>
        <span style={{ width: "25%", background: "#14b8a6" }}></span>
      </div>
      <div className="legend">
        <span><i style={{ background: "#ef4444" }}></i>Skeptical 42%</span>
        <span><i style={{ background: "#f59e0b" }}></i>Cautious 33%</span>
        <span><i style={{ background: "#14b8a6" }}></i>Positive 25%</span>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PersonaSetup({
  enabledPersonas,
  personas,
  personaValues,
  selectedPersona,
  setAddedPersona,
  setEnabledPersonas,
  setPersonaValues,
  setSelectedPersonaId,
}: {
  enabledPersonas: Record<string, boolean>;
  personas: Persona[];
  personaValues: Record<string, number>;
  selectedPersona: Persona;
  setAddedPersona: (value: boolean) => void;
  setEnabledPersonas: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setPersonaValues: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setSelectedPersonaId: (id: string) => void;
}) {
  return (
    <section className="work-panel persona-setup" aria-labelledby="persona-title">
      <PanelTitle index="1" title="Your Personas" aside="Edit bias" />
      <div className="persona-list">
        {personas.map((persona) => (
          <article
            className={`persona-editor ${selectedPersona.id === persona.id ? "selected" : ""}`}
            key={persona.id}
            style={{ "--accent": persona.color } as React.CSSProperties}
          >
            <button className="persona-main" type="button" onClick={() => setSelectedPersonaId(persona.id)}>
              <span className="persona-face" aria-hidden="true">
                {persona.name.charAt(4) || persona.name.charAt(0)}
              </span>
              <span>
                <strong>{persona.name}</strong>
                <small>Bias: {persona.bias}</small>
              </span>
            </button>
            <label className="bias-slider">
              <span>{personaValues[persona.id] ?? persona.caution}%</span>
              <input
                aria-label={`${persona.name} caution`}
                max="100"
                min="0"
                type="range"
                value={personaValues[persona.id] ?? persona.caution}
                onChange={(event) =>
                  setPersonaValues((current) => ({
                    ...current,
                    [persona.id]: Number(event.target.value),
                  }))
                }
              />
            </label>
            <button
              className={`toggle ${enabledPersonas[persona.id] ? "on" : ""}`}
              type="button"
              aria-pressed={enabledPersonas[persona.id] ?? true}
              aria-label={`Toggle ${persona.name}`}
              onClick={() =>
                setEnabledPersonas((current) => ({
                  ...current,
                  [persona.id]: !(current[persona.id] ?? true),
                }))
              }
            >
              <span></span>
            </button>
          </article>
        ))}
      </div>
      <div className="backstory-box">
        <div>
          <strong>Backstory / Context</strong>
          <button type="button">Clear</button>
        </div>
        <p>{selectedPersona.line}</p>
        <small>Blind spot: {selectedPersona.blindSpot}</small>
      </div>
      <button className="add-persona" type="button" onClick={() => setAddedPersona(true)}>
        <Plus size={16} aria-hidden="true" />
        Add Persona
      </button>
    </section>
  );
}

function ModeTierPanel({
  chamber,
  setChamber,
  setTier,
  setTurnLength,
  tier,
  turnLength,
}: {
  chamber: Chamber;
  setChamber: (chamber: Chamber) => void;
  setTier: (tier: Tier) => void;
  setTurnLength: (value: string) => void;
  tier: Tier;
  turnLength: string;
}) {
  return (
    <section className="work-panel mode-tier" aria-labelledby="mode-tier-title">
      <PanelTitle index="2" title="Mode & Tier" aside={chamberCopy[chamber].title} />
      <div className="segmented">
        {(["inner", "group"] as Chamber[]).map((item) => (
          <button className={chamber === item ? "active" : ""} type="button" key={item} onClick={() => setChamber(item)}>
            {item === "inner" ? "Inner" : "Group"}
          </button>
        ))}
      </div>
      <div className="segmented tier-tabs">
        {(["fast", "pro"] as Tier[]).map((item) => (
          <button className={tier === item ? "active" : ""} type="button" key={item} onClick={() => setTier(item)}>
            {item === "fast" ? "Fast" : "Pro"}
          </button>
        ))}
      </div>
      <article className="tier-card">
        <div className="tier-heading">
          <Gauge size={20} aria-hidden="true" />
          <strong>{tier === "fast" ? "Fast Mode" : "Pro Mode"}</strong>
        </div>
        <p>{tier === "fast" ? "Lower latency, shorter turns, perfect for a live judging demo." : "Deeper reasoning with receipts, sources, and a case-file handoff."}</p>
        <ul>
          {(tier === "fast"
            ? ["Realtime voice", "No external research", "Short-turn council", "Best for stage demo"]
            : ["Live research receipts", "Case file and sources", "Higher accuracy path", "Async advisor-ready"]
          ).map((item) => (
            <li key={item}>
              <Check size={15} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </article>
      <div className="turn-length" aria-label="Turn length">
        {["Short", "Medium", "Long"].map((item) => (
          <button className={turnLength === item ? "active" : ""} type="button" key={item} onClick={() => setTurnLength(item)}>
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}

function ResearchPanel({ tier }: { tier: Tier }) {
  const [tab, setTab] = useState<"research" | "case">("research");

  return (
    <section className="work-panel research-panel" aria-labelledby="research-title">
      <PanelTitle index="3" title="Pro Research & Case File" aside={tier === "pro" ? "Armed" : "Standby"} />
      <div className="tab-strip">
        <button className={tab === "research" ? "active" : ""} type="button" onClick={() => setTab("research")}>
          Research
        </button>
        <button className={tab === "case" ? "active" : ""} type="button" onClick={() => setTab("case")}>
          Case File
        </button>
      </div>
      {tab === "research" ? (
        <div className="receipt-list">
          {receipts.map((receipt) => (
            <article key={receipt.title}>
              <div className="receipt-icon" aria-hidden="true">
                <FileText size={16} />
              </div>
              <div>
                <strong>{receipt.title}</strong>
                <span>
                  {receipt.source} · {receipt.age}
                </span>
                <p>{receipt.summary}</p>
              </div>
              <button type="button" aria-label={`Open ${receipt.title}`}>
                <ExternalLink size={16} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="case-file">
          <h3>Case File Summary</h3>
          <p>
            D.R.A.M.A. should launch with Fast voice first, then use Pro mode to turn the same debate into a sourced
            decision record.
          </p>
          <div>
            <span>Evidence quality</span>
            <strong>Medium-high</strong>
          </div>
          <div>
            <span>Primary risk</span>
            <strong>Realtime latency</strong>
          </div>
          <div>
            <span>Next action</span>
            <strong>Ship replay-safe MVP</strong>
          </div>
        </div>
      )}
      <button className="export-case" type="button">
        <Download size={17} aria-hidden="true" />
        Export Case File
      </button>
    </section>
  );
}

function ArchitecturePanel() {
  return (
    <section className="work-panel architecture-panel" aria-labelledby="architecture-title">
      <PanelTitle index="4" title="Architecture & Provider Readiness" aside="MVP path" />
      <div className="architecture-flow">
        <div className="node user-node">
          <Users size={24} aria-hidden="true" />
          <span>You / users</span>
        </div>
        <Connector label="Speak" />
        <div className="node app-node">
          <Radio size={25} aria-hidden="true" />
          <strong>D.R.A.M.A.</strong>
          <span>Frontend</span>
        </div>
        <Connector label="WebRTC" />
        <div className="node stack-node">
          <strong>Realtime Orchestrator</strong>
          {architecture.slice(1, 5).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <Connector label="Events" />
        <div className="provider-stack">
          {providers.map((provider) => (
            <div className={`provider-pill ${provider.tone}`} key={provider.name}>
              <span>{provider.name}</span>
              <strong>{provider.status}</strong>
              <small>{provider.metric}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Connector({ label }: { label: string }) {
  return (
    <div className="connector" aria-hidden="true">
      <span>{label}</span>
    </div>
  );
}

function ChecklistPanel({ checkedCount }: { checkedCount: number }) {
  return (
    <section className="work-panel checklist-panel" aria-labelledby="checklist-title">
      <PanelTitle index="5" title="Build / Demo Checklist" aside={`${checkedCount} / ${checklist.length}`} />
      <div className="checklist">
        {checklist.map((item, index) => (
          <label key={item}>
            <input type="checkbox" defaultChecked={index < checkedCount} />
            <span>{item}</span>
          </label>
        ))}
      </div>
      <div className="progress-track" aria-label={`${checkedCount} of ${checklist.length} complete`}>
        <span style={{ width: `${(checkedCount / checklist.length) * 100}%` }}></span>
      </div>
    </section>
  );
}

function PanelTitle({ aside, index, title }: { aside: string; index: string; title: string }) {
  return (
    <div className="work-title">
      <h2>
        <span>{index}.</span> {title}
      </h2>
      <small>{aside}</small>
    </div>
  );
}

function CallToAction({ setIsPlaying }: { setIsPlaying: (value: boolean) => void }) {
  return (
    <section className="cta-band" aria-labelledby="cta-title">
      <div>
        <h2 id="cta-title">Ready to hear your inner morons?</h2>
        <p>Join the council. Get roasted. Make better decisions.</p>
      </div>
      <button className="primary-action" type="button" onClick={() => setIsPlaying(true)}>
        Launch a Live Council
        <AudioLines size={18} aria-hidden="true" />
      </button>
    </section>
  );
}

export default App;
