import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Loader2, Mic, PhoneOff, Send } from "lucide-react";
import {
  FRIENDS_MODE_AGENTS,
  type FriendVoiceAgentBlueprint,
  type FriendsModeInitResponse,
} from "./friendsMode";
import { initializeFriendsMode } from "./friendsModeClient";
import {
  startVoicePreviewSession,
  type VoicePreviewSession,
} from "./realtimeVoice";
import {
  appendSessionEvent,
  createSession,
  endSession,
  getSessionBundle,
  listMemories,
  listSessions,
} from "./sessionClient";
import type { DramaSession, LongTermMemory, SessionEvent } from "./sessionTypes";

type FriendPrepState = "idle" | "thinking" | "ready";

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: any) => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};

type CouncilHomeProps = {
  activeVoiceAgentId: string | null;
  error: string | null;
  events: SessionEvent[];
  isConnectingVoice: boolean;
  isCouncilThinking: boolean;
  isEndingSession: boolean;
  isLoading: boolean;
  isSessionLoading: boolean;
  isPromptRecording: boolean;
  onAskQuestion: () => void;
  onCreateSession: () => void;
  onEndSession: () => void;
  onPreviewVoice: (agentId: string) => void;
  onEndLiveSession: () => void;
  onQuestionChange: (question: string) => void;
  onSelectSession: (sessionId: string) => void;
  onStartVoicePrompt: () => void;
  onStopVoicePrompt: () => void;
  prepById: Record<string, FriendPrepState>;
  question: string;
  selectedSession: DramaSession | null;
  sessions: DramaSession[];
  statusMessage: string | null;
  supportsVoicePromptInput: boolean;
};

const FRIEND_THINK_DELAYS_MS = [760, 1080, 1360, 1660, 1960];

const councilPortraits: Record<string, string> = {
  "chaotic-optimist": "/assets/council-maya.svg",
  "pragmatic-builder": "/assets/council-noah.svg",
  "critical-thinker": "/assets/council-ari.svg",
  storyteller: "/assets/council-zoe.svg",
  "calm-mediator": "/assets/council-ivy.svg",
};

function createFriendPrepMap(
  defaultState: FriendPrepState = "idle",
): Record<string, FriendPrepState> {
  return Object.fromEntries(
    FRIENDS_MODE_AGENTS.map((agent) => [agent.id, defaultState]),
  ) as Record<string, FriendPrepState>;
}

function getOrCreateLocalUserId(): string {
  const storageKey = "drama.localUserId";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const next = globalThis.crypto?.randomUUID?.() ?? `drama-${Date.now()}`;
  window.localStorage.setItem(storageKey, next);
  return next;
}

function App() {
  const [friendsInit, setFriendsInit] = useState<FriendsModeInitResponse | null>(null);
  const [friendsInitLoading, setFriendsInitLoading] = useState(false);
  const [friendsInitError, setFriendsInitError] = useState<string | null>(null);
  const [friendsStatusMessage, setFriendsStatusMessage] = useState<string | null>(null);
  const [activeVoiceAgentId, setActiveVoiceAgentId] = useState<string | null>(null);
  const [isConnectingVoice, setIsConnectingVoice] = useState(false);
  const [friendsQuestion, setFriendsQuestion] = useState("");
  const [isCouncilThinking, setIsCouncilThinking] = useState(false);
  const [lastCouncilQuestion, setLastCouncilQuestion] = useState("");
  const [isPromptRecording, setIsPromptRecording] = useState(false);
  const [prepById, setPrepById] = useState<Record<string, FriendPrepState>>(
    () => createFriendPrepMap(),
  );
  const [friendsUserId] = useState(() => getOrCreateLocalUserId());
  const [sessions, setSessions] = useState<DramaSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<DramaSession | null>(null);
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([]);
  const [longTermMemories, setLongTermMemories] = useState<LongTermMemory[]>([]);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const voicePreviewRef = useRef<VoicePreviewSession | null>(null);
  const friendPrepTimersRef = useRef<number[]>([]);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const supportsVoicePromptInput = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const browserWindow = window as BrowserSpeechRecognitionWindow;
    return Boolean(browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition);
  }, []);

  const clearFriendPrepTimers = (): void => {
    friendPrepTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    friendPrepTimersRef.current = [];
  };

  const refreshSessions = async (preferredSessionId?: string): Promise<void> => {
    setIsSessionLoading(true);
    setFriendsInitError(null);

    try {
      let loadedSessions = await listSessions(friendsUserId);
      if (loadedSessions.length === 0) {
        const session = await createSession({ userId: friendsUserId });
        loadedSessions = [session];
      }

      setSessions(loadedSessions);

      const nextSession =
        loadedSessions.find((session) => session.id === preferredSessionId) ??
        loadedSessions.find((session) => session.status === "active") ??
        loadedSessions[0] ??
        null;

      if (!nextSession) {
        setSelectedSession(null);
        setSessionEvents([]);
        return;
      }

      const bundle = await getSessionBundle({
        userId: friendsUserId,
        sessionId: nextSession.id,
      });
      setSelectedSession(bundle.session);
      setSessionEvents(bundle.events);
      setLongTermMemories(await listMemories(friendsUserId));
    } catch (error) {
      setFriendsInitError(
        error instanceof Error ? error.message : "Failed to load saved sessions.",
      );
    } finally {
      setIsSessionLoading(false);
    }
  };

  const handleCreateSession = async (): Promise<void> => {
    setIsSessionLoading(true);
    setFriendsInitError(null);
    setFriendsQuestion("");
    setLastCouncilQuestion("");
    clearFriendPrepTimers();
    setPrepById(createFriendPrepMap());
    setIsCouncilThinking(false);
    voicePreviewRef.current?.close();
    voicePreviewRef.current = null;
    setActiveVoiceAgentId(null);

    try {
      const session = await createSession({ userId: friendsUserId });
      setSelectedSession(session);
      setSessionEvents([]);
      setSessions((current) => [session, ...current]);
      setFriendsStatusMessage("New talk started. Ask the council anything.");
    } catch (error) {
      setFriendsInitError(error instanceof Error ? error.message : "Failed to create session.");
    } finally {
      setIsSessionLoading(false);
    }
  };

  const handleSelectSession = async (sessionId: string): Promise<void> => {
    setIsSessionLoading(true);
    setFriendsInitError(null);
    clearFriendPrepTimers();
    voicePreviewRef.current?.close();
    voicePreviewRef.current = null;
    setActiveVoiceAgentId(null);
    setIsCouncilThinking(false);
    setPrepById(createFriendPrepMap());

    try {
      const bundle = await getSessionBundle({ userId: friendsUserId, sessionId });
      setSelectedSession(bundle.session);
      setSessionEvents(bundle.events);
      setFriendsQuestion("");
      setLastCouncilQuestion(bundle.session.originalQuestion ?? "");
      setFriendsStatusMessage(
        bundle.session.status === "ended"
          ? "This session has ended and was saved to memory."
          : "Session loaded.",
      );
    } catch (error) {
      setFriendsInitError(error instanceof Error ? error.message : "Failed to load session.");
    } finally {
      setIsSessionLoading(false);
    }
  };

  const ensureActiveSession = async (originalQuestion?: string): Promise<DramaSession> => {
    if (selectedSession?.status === "active") {
      return selectedSession;
    }

    const session = await createSession({
      userId: friendsUserId,
      originalQuestion: originalQuestion ?? null,
    });
    setSelectedSession(session);
    setSessionEvents([]);
    setSessions((current) => [session, ...current]);
    return session;
  };

  const replaceSessionInList = (session: DramaSession): void => {
    setSessions((current) => {
      const next = current.filter((item) => item.id !== session.id);
      return [session, ...next].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    });
  };

  const handleEndSession = async (): Promise<void> => {
    if (!selectedSession || selectedSession.status !== "active") {
      return;
    }

    setIsEndingSession(true);
    setFriendsInitError(null);
    voicePreviewRef.current?.close();
    voicePreviewRef.current = null;
    setActiveVoiceAgentId(null);

    try {
      const result = await endSession({
        userId: friendsUserId,
        sessionId: selectedSession.id,
      });
      setSelectedSession(result.session);
      setSessionEvents(result.events);
      replaceSessionInList(result.session);
      setLongTermMemories(await listMemories(friendsUserId));
      setFriendsStatusMessage("Session ended. Transcript, summaries, and audio recap are saved.");
    } catch (error) {
      setFriendsInitError(error instanceof Error ? error.message : "Failed to end session.");
    } finally {
      setIsEndingSession(false);
    }
  };

  const buildSharedOpeningLine = (
    blueprint: FriendVoiceAgentBlueprint | undefined,
    latestQuestion: string,
  ): string => {
    const memoryContext = longTermMemories
      .slice(0, 8)
      .map((memory) => `- ${memory.content}`)
      .join("\n");
    const sessionContext = sessionEvents
      .slice(-10)
      .map((event) => {
        const speaker = event.speakerType === "agent" ? event.agentId ?? "agent" : event.speakerType;
        return `${speaker}: ${event.content}`;
      })
      .join("\n");

    return [
      blueprint
        ? `You are ${blueprint.name}, the ${blueprint.role}.`
        : "You are a council member.",
      memoryContext ? `Long-term memory from prior ended sessions:\n${memoryContext}` : "",
      sessionContext ? `What everyone in this session has heard so far:\n${sessionContext}` : "",
      `The latest user question is: "${latestQuestion || "Share your first take."}"`,
      "Give one short spoken take, naturally acknowledging relevant prior agent advice if useful, then invite the user to continue in realtime.",
    ]
      .filter(Boolean)
      .join("\n\n");
  };

  const captureRealtimeTranscript = (agentId: string, event: Record<string, unknown>): void => {
    const type = typeof event.type === "string" ? event.type : "";
    if (!type.includes("transcript") || !type.endsWith(".done")) {
      return;
    }

    const transcript =
      typeof event.transcript === "string"
        ? event.transcript
        : typeof event.text === "string"
          ? event.text
          : null;

    if (!transcript || !selectedSession || selectedSession.status !== "active") {
      return;
    }

    void appendSessionEvent({
      userId: friendsUserId,
      sessionId: selectedSession.id,
      speakerType: type.startsWith("response.") ? "agent" : "user",
      agentId: type.startsWith("response.") ? agentId : null,
      content: transcript,
      metadata: { realtimeEventType: type },
    })
      .then((savedEvent) => {
        setSessionEvents((current) => [...current, savedEvent]);
      })
      .catch(() => {
        // Keep the live voice session running even if transcript persistence fails.
      });
  };

  const handleInitializeFriends = async (): Promise<FriendsModeInitResponse | null> => {
    clearFriendPrepTimers();
    voicePreviewRef.current?.close();
    voicePreviewRef.current = null;
    setActiveVoiceAgentId(null);
    setIsCouncilThinking(false);
    setPrepById(createFriendPrepMap());
    setFriendsInitLoading(true);
    setFriendsInitError(null);
    setFriendsStatusMessage(null);

    try {
      const payload = await initializeFriendsMode(friendsUserId);
      setFriendsInit(payload);
      setFriendsStatusMessage("Friends Mode initialized. Ask the council a question.");
      return payload;
    } catch (error) {
      setFriendsInitError(
        error instanceof Error ? error.message : "Failed to initialize Friends Mode.",
      );
      return null;
    } finally {
      setFriendsInitLoading(false);
    }
  };

  const handleAskQuestion = async () => {
    const question = friendsQuestion.trim();
    if (!question) {
      setFriendsInitError("Add your question first.");
      setFriendsStatusMessage(null);
      return;
    }

    if (friendsInitLoading) {
      return;
    }

    let activeSession: DramaSession;
    try {
      activeSession = await ensureActiveSession(question);
      const savedEvent = await appendSessionEvent({
        userId: friendsUserId,
        sessionId: activeSession.id,
        speakerType: "user",
        content: question,
      });
      setSessionEvents((current) => [...current, savedEvent]);
      const updatedSession = {
        ...activeSession,
        title: activeSession.originalQuestion ? activeSession.title : question.slice(0, 54),
        originalQuestion: activeSession.originalQuestion ?? question,
        updatedAt: savedEvent.createdAt,
      };
      setSelectedSession(updatedSession);
      replaceSessionInList(updatedSession);
    } catch (error) {
      setFriendsInitError(error instanceof Error ? error.message : "Failed to save question.");
      setFriendsStatusMessage(null);
      return;
    }

    let initPayload = friendsInit;
    if (!initPayload) {
      initPayload = await handleInitializeFriends();
      if (!initPayload) {
        return;
      }
    }

    clearFriendPrepTimers();
    voicePreviewRef.current?.close();
    voicePreviewRef.current = null;
    setActiveVoiceAgentId(null);
    setFriendsInitError(null);
    setIsCouncilThinking(true);
    setLastCouncilQuestion(question);
    setPrepById(createFriendPrepMap("thinking"));
    setFriendsStatusMessage("Council is thinking...");

    FRIENDS_MODE_AGENTS.forEach((agent, index) => {
      const delay =
        FRIEND_THINK_DELAYS_MS[index] ??
        FRIEND_THINK_DELAYS_MS[FRIEND_THINK_DELAYS_MS.length - 1] + index * 180;
      const timerId = window.setTimeout(() => {
        setPrepById((current) => {
          const next = { ...current, [agent.id]: "ready" as const };
          const everyoneReady = FRIENDS_MODE_AGENTS.every(
            (friend) => next[friend.id] === "ready",
          );
          if (everyoneReady) {
            setIsCouncilThinking(false);
            setFriendsStatusMessage("Council ready. Tap a member to talk.");
          }
          return next;
        });
      }, delay);
      friendPrepTimersRef.current.push(timerId);
    });
  };

  const handleStartVoicePrompt = () => {
    if (!supportsVoicePromptInput) {
      setFriendsInitError("Voice prompt input is not supported in this browser.");
      return;
    }

    if (isPromptRecording) {
      return;
    }

    const browserWindow = window as BrowserSpeechRecognitionWindow;
    const SpeechRecognitionCtor =
      browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setFriendsInitError("Voice prompt input is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    speechRecognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsPromptRecording(true);
      setFriendsInitError(null);
      setFriendsStatusMessage("Listening... speak your prompt.");
    };

    recognition.onresult = (event) => {
      const currentResult = event.results[event.resultIndex];
      const transcript = currentResult?.[0]?.transcript?.trim();
      if (!transcript) {
        return;
      }

      setFriendsQuestion((previous) => {
        const current = previous.trim();
        return current.length > 0 ? `${current} ${transcript}` : transcript;
      });
      setFriendsStatusMessage("Prompt captured. Review it, then ask the council.");
    };

    recognition.onerror = (event) => {
      setFriendsInitError(event.error ? `Voice input error: ${event.error}.` : "Voice input failed.");
      setFriendsStatusMessage(null);
    };

    recognition.onend = () => {
      setIsPromptRecording(false);
      speechRecognitionRef.current = null;
    };

    recognition.start();
  };

  const handleStopVoicePrompt = () => {
    speechRecognitionRef.current?.stop();
  };

  const handlePreviewVoice = async (agentId: string) => {
    if (!selectedSession || selectedSession.status !== "active") {
      setFriendsInitError("Start an active talk before speaking with a council member.");
      setFriendsStatusMessage(null);
      return;
    }

    if (!friendsInit) {
      setFriendsInitError("Ask the council first.");
      setFriendsStatusMessage(null);
      return;
    }

    if ((prepById[agentId] ?? "idle") !== "ready") {
      setFriendsInitError("Wait for this member to be ready before starting live voice.");
      setFriendsStatusMessage(null);
      return;
    }

    const runtime = friendsInit.agents.find((agent) => agent.id === agentId);
    if (!runtime) {
      setFriendsInitError("This council member is not ready yet.");
      setFriendsStatusMessage(null);
      return;
    }

    const blueprint = FRIENDS_MODE_AGENTS.find((agent) => agent.id === agentId);
    const openingLine = buildSharedOpeningLine(
      blueprint,
      lastCouncilQuestion || friendsQuestion.trim(),
    );

    setFriendsInitError(null);
    setFriendsStatusMessage("Connecting to member...");
    setIsConnectingVoice(true);

    voicePreviewRef.current?.close();
    voicePreviewRef.current = null;
    setActiveVoiceAgentId(null);

    try {
      const session = await startVoicePreviewSession(runtime, {
        openingLine,
        onServerEvent: (event) => {
          if (event.type === "error") {
            const message =
              typeof event.error === "object" &&
              event.error !== null &&
              "message" in event.error &&
              typeof event.error.message === "string"
                ? event.error.message
                : "Realtime server reported an error.";
            setFriendsInitError(message);
          }
          captureRealtimeTranscript(agentId, event);
        },
      });
      voicePreviewRef.current = session;
      setActiveVoiceAgentId(agentId);
      setFriendsStatusMessage(`${blueprint?.name ?? "Council member"} is live. Speak now.`);
    } catch (error) {
      setFriendsInitError(
        error instanceof Error ? error.message : "Failed to start live voice preview.",
      );
      setFriendsStatusMessage(null);
    } finally {
      setIsConnectingVoice(false);
    }
  };

  const handleEndLiveSession = () => {
    voicePreviewRef.current?.close();
    voicePreviewRef.current = null;
    setActiveVoiceAgentId(null);
    setIsConnectingVoice(false);
    setFriendsStatusMessage("Live session ended. Tap a ready member to talk again.");
  };

  useEffect(() => {
    void refreshSessions();
  }, []);

  useEffect(() => {
    return () => {
      clearFriendPrepTimers();
      speechRecognitionRef.current?.stop();
      speechRecognitionRef.current = null;
      voicePreviewRef.current?.close();
      voicePreviewRef.current = null;
    };
  }, []);

  return (
    <div className="app">
      <CouncilHome
        activeVoiceAgentId={activeVoiceAgentId}
        error={friendsInitError}
        events={sessionEvents}
        isConnectingVoice={isConnectingVoice}
        isCouncilThinking={isCouncilThinking}
        isEndingSession={isEndingSession}
        isLoading={friendsInitLoading}
        isSessionLoading={isSessionLoading}
        isPromptRecording={isPromptRecording}
        onAskQuestion={handleAskQuestion}
        onCreateSession={handleCreateSession}
        onEndSession={handleEndSession}
        onEndLiveSession={handleEndLiveSession}
        onPreviewVoice={handlePreviewVoice}
        onQuestionChange={setFriendsQuestion}
        onSelectSession={handleSelectSession}
        onStartVoicePrompt={handleStartVoicePrompt}
        onStopVoicePrompt={handleStopVoicePrompt}
        prepById={prepById}
        question={friendsQuestion}
        selectedSession={selectedSession}
        sessions={sessions}
        statusMessage={friendsStatusMessage}
        supportsVoicePromptInput={supportsVoicePromptInput}
      />
    </div>
  );
}

function CouncilHome({
  activeVoiceAgentId,
  error,
  events,
  isConnectingVoice,
  isCouncilThinking,
  isEndingSession,
  isLoading,
  isSessionLoading,
  isPromptRecording,
  onAskQuestion,
  onCreateSession,
  onEndSession,
  onEndLiveSession,
  onPreviewVoice,
  onQuestionChange,
  onSelectSession,
  onStartVoicePrompt,
  onStopVoicePrompt,
  prepById,
  question,
  selectedSession,
  sessions,
  statusMessage,
  supportsVoicePromptInput,
}: CouncilHomeProps) {
  const fallbackStatus = supportsVoicePromptInput
    ? "Type a question or tap the mic to speak."
    : "Type a question. Voice input is not supported in this browser.";

  return (
    <main className="council-shell" aria-labelledby="home-title">
      <SessionSidebar
        isLoading={isSessionLoading}
        onCreateSession={onCreateSession}
        onSelectSession={onSelectSession}
        selectedSessionId={selectedSession?.id ?? null}
        sessions={sessions}
      />
      <section className="council-card">
        <header className="home-topbar">
          <a className="home-brand" href="/" aria-label="D.R.A.M.A. home">
            <span>D</span>
            D.R.A.M.A.
          </a>
          <p>
            {selectedSession?.status === "ended"
              ? "Remembered"
              : isCouncilThinking
                ? "Council preparing"
                : activeVoiceAgentId
                  ? "Live voice"
                  : "Voice Council"}
          </p>
        </header>

        <div className="home-intro">
          <p className="eyebrow">Ask the council</p>
          <h1 id="home-title">Put one decision in the room.</h1>
          <p className="home-subtitle">Decision Review by Artificial Moronic Advisors</p>
        </div>

        <CouncilPhotoRow
          activeVoiceAgentId={activeVoiceAgentId}
          isConnectingVoice={isConnectingVoice}
          onPreviewVoice={onPreviewVoice}
          prepById={prepById}
        />

        <PromptComposer
          isCouncilThinking={isCouncilThinking}
          isLoading={isLoading || isSessionLoading || selectedSession?.status === "ended"}
          isPromptRecording={isPromptRecording}
          onAskQuestion={onAskQuestion}
          onQuestionChange={onQuestionChange}
          onStartVoicePrompt={onStartVoicePrompt}
          onStopVoicePrompt={onStopVoicePrompt}
          question={question}
          supportsVoicePromptInput={supportsVoicePromptInput}
        />

        <div className={`status-note ${error ? "error" : ""}`} role={error ? "alert" : "status"}>
          {error || statusMessage || fallbackStatus}
        </div>

        <SessionTranscript events={events} session={selectedSession} />

        {activeVoiceAgentId ? (
          <button
            className="end-live-button"
            type="button"
            onClick={onEndLiveSession}
          >
            <PhoneOff size={17} aria-hidden="true" />
            Reset live room
          </button>
        ) : null}

        {selectedSession?.status === "active" ? (
          <button
            className="end-live-button"
            type="button"
            onClick={onEndSession}
            disabled={isEndingSession || isSessionLoading}
          >
            <PhoneOff size={17} aria-hidden="true" />
            {isEndingSession ? "Saving memory..." : "End Session"}
          </button>
        ) : null}
      </section>
    </main>
  );
}

function SessionSidebar({
  isLoading,
  onCreateSession,
  onSelectSession,
  selectedSessionId,
  sessions,
}: {
  isLoading: boolean;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  selectedSessionId: string | null;
  sessions: DramaSession[];
}) {
  return (
    <aside className="session-sidebar" aria-label="Talk sessions">
      <div className="session-sidebar-header">
        <strong>Talks</strong>
        <button type="button" onClick={onCreateSession} disabled={isLoading}>
          New Talk
        </button>
      </div>
      <div className="session-list">
        {sessions.length === 0 ? (
          <p>{isLoading ? "Loading sessions..." : "No talks yet."}</p>
        ) : (
          sessions.map((session) => (
            <button
              className={`session-list-item ${selectedSessionId === session.id ? "selected" : ""}`}
              type="button"
              key={session.id}
              onClick={() => onSelectSession(session.id)}
            >
              <span>{session.title}</span>
              <small>
                {session.status === "active" ? "Active" : "Remembered"} ·{" "}
                {new Date(session.updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </small>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

function SessionTranscript({
  events,
  session,
}: {
  events: SessionEvent[];
  session: DramaSession | null;
}) {
  const isEnded = session?.status === "ended";
  const visibleEvents = isEnded ? events : events.slice(-5);
  const audioSource =
    session?.summaryAudioBase64 && session.summaryAudioMime
      ? `data:${session.summaryAudioMime};base64,${session.summaryAudioBase64}`
      : null;

  if (events.length === 0 && !session?.summaryEnglish) {
    return null;
  }

  return (
    <section
      className={`session-transcript ${isEnded ? "full" : ""}`}
      aria-label={isEnded ? "Ended session transcript and summaries" : "Shared session context"}
    >
      <div className="session-transcript-header">
        <strong>{isEnded ? "Session archive" : "Shared room context"}</strong>
        <small>{events.length} saved turn{events.length === 1 ? "" : "s"}</small>
      </div>

      {isEnded && session?.summaryEnglish ? (
        <div className="session-summary-panel">
          <div className="summary-block">
            <strong>English summary</strong>
            <p>{session.summaryEnglish}</p>
          </div>
          {audioSource ? (
            <div className="summary-block">
              <strong>Voice summary</strong>
              <audio controls src={audioSource} />
              <small>AI-generated English audio summary.</small>
            </div>
          ) : null}
          {session.summaryChinese ? (
            <div className="summary-block">
              <strong>Chinese</strong>
              <p lang="zh-Hans">{session.summaryChinese}</p>
            </div>
          ) : null}
          {session.summaryHindi ? (
            <div className="summary-block">
              <strong>Hindi</strong>
              <p lang="hi">{session.summaryHindi}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="session-transcript-list">
        {visibleEvents.map((event) => (
          <article className={`transcript-event ${event.speakerType}`} key={event.id}>
            <strong>{event.agentId ?? event.speakerType}</strong>
            <p>{event.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CouncilPhotoRow({
  activeVoiceAgentId,
  isConnectingVoice,
  onPreviewVoice,
  prepById,
}: {
  activeVoiceAgentId: string | null;
  isConnectingVoice: boolean;
  onPreviewVoice: (agentId: string) => void;
  prepById: Record<string, FriendPrepState>;
}) {
  return (
    <section className="council-row" aria-label="Council members">
      {FRIENDS_MODE_AGENTS.map((agent) => {
        const prepState = prepById[agent.id] ?? "idle";
        const isReady = prepState === "ready";
        const isActive = activeVoiceAgentId === agent.id;
        const statusLabel = isActive ? "live" : prepState;

        return (
          <button
            className={`member-photo-card is-${prepState} ${isActive ? "is-live" : ""}`}
            type="button"
            key={agent.id}
            disabled={!isReady || isConnectingVoice}
            onClick={() => onPreviewVoice(agent.id)}
            aria-label={`${agent.name}, ${agent.role}, ${statusLabel}`}
          >
            <span className="portrait-wrap">
              <img src={councilPortraits[agent.id]} alt="" aria-hidden="true" />
              <span className="status-orbit" aria-hidden="true"></span>
            </span>
            <span className="member-copy">
              <strong>{agent.name}</strong>
              <small>{agent.role}</small>
            </span>
            <span className="member-state">{statusLabel}</span>
          </button>
        );
      })}
    </section>
  );
}

function PromptComposer({
  isCouncilThinking,
  isLoading,
  isPromptRecording,
  onAskQuestion,
  onQuestionChange,
  onStartVoicePrompt,
  onStopVoicePrompt,
  question,
  supportsVoicePromptInput,
}: {
  isCouncilThinking: boolean;
  isLoading: boolean;
  isPromptRecording: boolean;
  onAskQuestion: () => void;
  onQuestionChange: (question: string) => void;
  onStartVoicePrompt: () => void;
  onStopVoicePrompt: () => void;
  question: string;
  supportsVoicePromptInput: boolean;
}) {
  const isSubmitDisabled = !question.trim() || isCouncilThinking || isLoading;

  return (
    <section className="prompt-composer" aria-label="Question composer">
      <textarea
        value={question}
        onChange={(event) => onQuestionChange(event.target.value)}
        placeholder="Should I launch this now, or tighten the onboarding first?"
        rows={5}
      />
      <div className="composer-actions">
        <button
          className={`mic-button ${isPromptRecording ? "recording" : ""}`}
          type="button"
          disabled={!supportsVoicePromptInput}
          onClick={isPromptRecording ? onStopVoicePrompt : onStartVoicePrompt}
        >
          {isPromptRecording ? <AudioLines size={19} aria-hidden="true" /> : <Mic size={19} aria-hidden="true" />}
          {isPromptRecording ? "Listening" : "Mic"}
        </button>
        <button
          className="ask-button"
          type="button"
          disabled={isSubmitDisabled}
          onClick={onAskQuestion}
        >
          {isCouncilThinking || isLoading ? (
            <Loader2 className="spin" size={18} aria-hidden="true" />
          ) : (
            <Send size={18} aria-hidden="true" />
          )}
          {isCouncilThinking || isLoading ? "Thinking" : "Ask Council"}
        </button>
      </div>
    </section>
  );
}

export default App;
