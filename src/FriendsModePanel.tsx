import {
  CheckCircle2,
  LoaderCircle,
  Mic,
  MicOff,
  Mic2,
  RefreshCcw,
  Volume2,
} from "lucide-react";
import { FRIENDS_MODE_AGENTS, type FriendsModeInitResponse } from "./friendsMode";

type FriendPrepState = "idle" | "thinking" | "ready";

type FriendsModePanelProps = {
  initResponse: FriendsModeInitResponse | null;
  isLoading: boolean;
  error: string | null;
  statusMessage: string | null;
  activeVoiceAgentId: string | null;
  isConnectingVoice: boolean;
  question: string;
  isCouncilThinking: boolean;
  prepById: Record<string, FriendPrepState>;
  onInitialize: () => void;
  onAskQuestion: () => void;
  onQuestionChange: (value: string) => void;
  onStartVoicePrompt: () => void;
  onStopVoicePrompt: () => void;
  onPreviewVoice: (agentId: string) => void;
  isPromptRecording: boolean;
  supportsVoicePromptInput: boolean;
};

export function FriendsModePanel({
  initResponse,
  isLoading,
  error,
  statusMessage,
  activeVoiceAgentId,
  isConnectingVoice,
  question,
  isCouncilThinking,
  prepById,
  onInitialize,
  onAskQuestion,
  onQuestionChange,
  onStartVoicePrompt,
  onStopVoicePrompt,
  onPreviewVoice,
  isPromptRecording,
  supportsVoicePromptInput,
}: FriendsModePanelProps) {
  const runtimeById = new Map(initResponse?.agents.map((agent) => [agent.id, agent]) ?? []);

  return (
    <section
      className="work-panel friends-mode-panel"
      id="friends-mode"
      aria-labelledby="friends-mode-title"
    >
      <div className="work-title">
        <h2 id="friends-mode-title">
          <span>1.</span> Voice Prompt + Friends Mode
        </h2>
        <small>5 avatars + voice agents</small>
      </div>

      <p className="friends-mode-note">
        Initializes one realtime client secret per friend avatar so each agent can join the live room
        with a distinct voice profile.
      </p>

      <div className="friends-question-bar">
        <label htmlFor="friends-question-input">Ask the council a question</label>
        <div className="friends-question-controls">
          <button
            type="button"
            className={`friends-voice-input ${isPromptRecording ? "recording" : ""}`}
            onClick={isPromptRecording ? onStopVoicePrompt : onStartVoicePrompt}
            disabled={isLoading || isCouncilThinking || !supportsVoicePromptInput}
            aria-label={isPromptRecording ? "Stop voice prompt recording" : "Start voice prompt recording"}
          >
            {isPromptRecording ? (
              <>
                <MicOff size={15} aria-hidden="true" />
                Listening...
              </>
            ) : (
              <>
                <Mic size={15} aria-hidden="true" />
                Speak Prompt
              </>
            )}
          </button>
          <input
            id="friends-question-input"
            type="text"
            placeholder="Example: Should I launch this AI product next month?"
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            disabled={isLoading || isCouncilThinking}
          />
          <button
            type="button"
            onClick={onAskQuestion}
            disabled={isLoading || isCouncilThinking || question.trim().length === 0}
          >
            {isCouncilThinking ? "Thinking..." : "Ask Council"}
          </button>
        </div>
      </div>

      <div className="friends-agent-grid">
        {FRIENDS_MODE_AGENTS.map((agent) => {
          const runtime = runtimeById.get(agent.id);
          const prepState = prepById[agent.id] ?? "idle";
          const status: FriendPrepState | "loading" = isLoading
            ? "loading"
            : !runtime
                ? "idle"
                : prepState === "thinking"
                  ? "thinking"
                  : prepState === "ready"
                    ? "ready"
                    : "idle";
          const canPreview = Boolean(runtime) && prepState === "ready";
          const isActivePreview = activeVoiceAgentId === agent.id;

          return (
            <article className={`friends-agent-card status-${status}`} key={agent.id}>
              <button
                type="button"
                className="friends-agent-main"
                onClick={() => onPreviewVoice(agent.id)}
                disabled={!canPreview || isConnectingVoice}
              >
                <span
                  className="friends-avatar"
                  style={{ background: agent.avatarGradient }}
                  aria-hidden="true"
                >
                  <img src={agent.avatarImage} alt="" />
                </span>
                <div>
                  <strong>{agent.name}</strong>
                  <small>{agent.role}</small>
                </div>
              </button>

              <div className="friends-agent-meta">
                <span className="meta-pill">
                  <Mic2 size={14} aria-hidden="true" />
                  {agent.model}
                </span>
                <span className="meta-pill">{agent.voice ?? "Voice"}</span>
              </div>

              <div className="friends-agent-status">
                {status === "ready" ? (
                  <>
                    <CheckCircle2 size={15} aria-hidden="true" />
                    Ready
                  </>
                ) : status === "thinking" ? (
                  <>
                    <LoaderCircle size={15} aria-hidden="true" className="spin" />
                    Thinking
                  </>
                ) : status === "loading" ? (
                  <>
                    <LoaderCircle size={15} aria-hidden="true" className="spin" />
                    Initializing
                  </>
                ) : (
                  <>Pending</>
                )}
              </div>

              <button
                type="button"
                className={`friends-agent-action ${isActivePreview ? "active" : ""}`}
                disabled={!canPreview || isConnectingVoice}
                onClick={() => onPreviewVoice(agent.id)}
              >
                {prepState === "thinking" ? (
                  <>
                    <LoaderCircle size={15} aria-hidden="true" className="spin" />
                    Thinking...
                  </>
                ) : isActivePreview ? (
                  <>
                    <Volume2 size={15} aria-hidden="true" />
                    Live
                  </>
                ) : (
                  <>
                    <Volume2 size={15} aria-hidden="true" />
                    Listen & Talk
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>

      <div className="friends-mode-footer">
        <button type="button" onClick={onInitialize} disabled={isLoading}>
          <RefreshCcw size={16} aria-hidden="true" className={isLoading ? "spin" : ""} />
          {isLoading ? "Initializing..." : "Initialize Friends Mode"}
        </button>
        <p aria-live="polite">
          {error
            ? error
            : statusMessage
              ? statusMessage
            : initResponse
              ? `Ready at ${new Date(initResponse.initializedAt).toLocaleTimeString()}`
              : "Not initialized yet."}
        </p>
      </div>
    </section>
  );
}
