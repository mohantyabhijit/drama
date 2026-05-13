import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  AudioLines,
  Headphones,
  Languages,
  Loader2,
  Mic,
  PanelLeftOpen,
  Pause,
  PhoneOff,
  Play,
  Plus,
  Send,
  Square,
  Users,
  X,
} from "lucide-react";
import {
  FRIENDS_MODE_AGENTS,
  getFriendDisplayName,
  type FriendVoiceAgentRuntime,
  type FriendVoiceAgentProfile,
  type FriendsModeInitResponse,
} from "./friendsModePublic";
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
type TranscriptSpeakerType = "user" | "agent";

type LiveTranscriptLine = {
  key: string;
  speakerType: TranscriptSpeakerType;
  agentId: string | null;
  content: string;
  isFinal: boolean;
};

type LiveSubtitle = LiveTranscriptLine & {
  speakerName: string;
};

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
  liveTranscriptLines: LiveTranscriptLine[];
};

const FRIEND_THINK_DELAYS_MS = [760, 1080, 1360, 1660, 1960];
const LEGACY_SHARED_USER_ID = "drama-local-dev-user";
const USER_PARTICIPANT = {
  id: "user",
  name: "You",
  role: "Original question",
};

const liveSubtitleStore = (() => {
  let currentSubtitle: LiveSubtitle | null = null;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => currentSubtitle,
    setSnapshot: (nextSubtitle: LiveSubtitle | null): void => {
      currentSubtitle = nextSubtitle;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();

function useLiveSubtitle(): LiveSubtitle | null {
  return useSyncExternalStore(
    liveSubtitleStore.subscribe,
    liveSubtitleStore.getSnapshot,
    liveSubtitleStore.getSnapshot,
  );
}

function getSessionSpeakerName(event: SessionEvent): string {
  if (event.speakerType === "agent") {
    return getFriendDisplayName(event.agentId);
  }

  if (event.speakerType === "user") {
    return USER_PARTICIPANT.name;
  }

  return "System";
}

function createFriendPrepMap(
  defaultState: FriendPrepState = "idle",
): Record<string, FriendPrepState> {
  return Object.fromEntries(
    FRIENDS_MODE_AGENTS.map((agent) => [agent.id, defaultState]),
  ) as Record<string, FriendPrepState>;
}

function getOrCreateLocalUserId(): string {
  const storageKey = "drama.localUserId";
  const existingUserId = window.localStorage.getItem(storageKey);
  if (existingUserId && existingUserId !== LEGACY_SHARED_USER_ID) {
    return existingUserId;
  }

  const newUserId =
    typeof window.crypto.randomUUID === "function"
      ? `drama-user-${window.crypto.randomUUID()}`
      : `drama-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(storageKey, newUserId);
  return newUserId;
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
  const [liveTranscriptLines, setLiveTranscriptLines] = useState<LiveTranscriptLine[]>([]);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const voicePreviewRef = useRef<VoicePreviewSession | null>(null);
  const friendPrepTimersRef = useRef<number[]>([]);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const liveTranscriptContentRef = useRef<Map<string, string>>(new Map());
  const pendingLiveSubtitleRef = useRef<LiveTranscriptLine | null>(null);
  const subtitleClearTimerRef = useRef<number | null>(null);
  const subtitleFlushTimerRef = useRef<number | null>(null);
  const hasLoadedSessionsRef = useRef(false);

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

  const clearSubtitleTimer = (): void => {
    if (subtitleClearTimerRef.current) {
      window.clearTimeout(subtitleClearTimerRef.current);
      subtitleClearTimerRef.current = null;
    }
  };

  const clearSubtitleFlushTimer = (): void => {
    if (subtitleFlushTimerRef.current) {
      window.clearTimeout(subtitleFlushTimerRef.current);
      subtitleFlushTimerRef.current = null;
    }
  };

  const clearLiveTranscriptionState = (): void => {
    clearSubtitleTimer();
    clearSubtitleFlushTimer();
    pendingLiveSubtitleRef.current = null;
    liveTranscriptContentRef.current.clear();
    setLiveTranscriptLines([]);
    liveSubtitleStore.setSnapshot(null);
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
    clearLiveTranscriptionState();

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
    clearLiveTranscriptionState();
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
    clearLiveTranscriptionState();

    try {
      const result = await endSession({
        userId: friendsUserId,
        sessionId: selectedSession.id,
      });
      setSelectedSession(result.session);
      setSessionEvents(result.events);
      replaceSessionInList(result.session);
      setLongTermMemories(await listMemories(friendsUserId));
      setFriendsStatusMessage("Session ended. Transcript and text summaries are saved.");
    } catch (error) {
      setFriendsInitError(error instanceof Error ? error.message : "Failed to end session.");
    } finally {
      setIsEndingSession(false);
    }
  };

  const buildSharedOpeningLine = (
    blueprint: FriendVoiceAgentProfile | undefined,
    latestQuestion: string,
  ): string => {
    const memoryContext = longTermMemories
      .slice(0, 8)
      .map((memory) => `- ${memory.content}`)
      .join("\n");
    const sessionContext = sessionEvents
      .slice(-10)
      .map((event) => {
        const speaker = getSessionSpeakerName(event);
        return `${speaker}: ${event.content}`;
      })
      .join("\n");

    return [
      blueprint
        ? `You are ${blueprint.name}, the ${blueprint.role}.`
        : "You are a council member.",
      "Friend roster: Bobo is the optimist supporter, Sandy is the pessimist nihilist, and Adi is the chaotic monkey who answers in Hindi or Hinglish only when Abhijit clearly uses Hindi or mixed Hindi-English. Abhijit may refer to any of them by speaking their names.",
      memoryContext ? `Long-term memory from prior ended sessions:\n${memoryContext}` : "",
      sessionContext ? `What everyone in this session has heard so far:\n${sessionContext}` : "",
      `The latest user question is: "${latestQuestion || "Share your first take."}"`,
      "Give one short spoken take, naturally acknowledging relevant prior agent advice if useful, then invite the user to continue in realtime.",
    ]
      .filter(Boolean)
      .join("\n\n");
  };

  const getRealtimeTranscriptKey = (
    speakerType: TranscriptSpeakerType,
    event: Record<string, unknown>,
  ): string => {
    const itemId = typeof event.item_id === "string" ? event.item_id : "";
    const responseId = typeof event.response_id === "string" ? event.response_id : "";
    const outputIndex =
      typeof event.output_index === "number" ? String(event.output_index) : "";
    const contentIndex =
      typeof event.content_index === "number" ? String(event.content_index) : "";
    const stableId = [responseId, itemId, outputIndex, contentIndex].filter(Boolean).join(":");
    return `${speakerType}:${stableId || "current"}`;
  };

  const getTranscriptSpeakerName = (
    speakerType: TranscriptSpeakerType,
    agentId: string | null,
  ): string => {
    return speakerType === "agent" ? getFriendDisplayName(agentId) : USER_PARTICIPANT.name;
  };

  const applyLiveSubtitle = (line: LiveTranscriptLine): void => {
    clearSubtitleTimer();
    liveSubtitleStore.setSnapshot({
      ...line,
      speakerName: getTranscriptSpeakerName(line.speakerType, line.agentId),
    });

    if (line.isFinal) {
      subtitleClearTimerRef.current = window.setTimeout(() => {
        if (liveSubtitleStore.getSnapshot()?.key === line.key) {
          liveSubtitleStore.setSnapshot(null);
        }
        subtitleClearTimerRef.current = null;
      }, 5200);
    }
  };

  const showLiveSubtitle = (line: LiveTranscriptLine, shouldFlushImmediately = false): void => {
    if (line.isFinal || shouldFlushImmediately) {
      clearSubtitleFlushTimer();
      pendingLiveSubtitleRef.current = null;
      applyLiveSubtitle(line);
      return;
    }

    pendingLiveSubtitleRef.current = line;
    if (subtitleFlushTimerRef.current) {
      return;
    }

    subtitleFlushTimerRef.current = window.setTimeout(() => {
      const pending = pendingLiveSubtitleRef.current;
      pendingLiveSubtitleRef.current = null;
      subtitleFlushTimerRef.current = null;
      if (pending) {
        applyLiveSubtitle(pending);
      }
    }, 90);
  };

  const updateLiveTranscriptLine = (line: LiveTranscriptLine): void => {
    setLiveTranscriptLines((current) => {
      const existingIndex = current.findIndex((item) => item.key === line.key);
      if (existingIndex === -1) {
        return [...current, line];
      }

      const next = [...current];
      const existing = next[existingIndex];
      next[existingIndex] = {
        ...existing,
        ...line,
      };
      return next;
    });
  };

  const removeLiveTranscriptLine = (key: string): void => {
    liveTranscriptContentRef.current.delete(key);
    setLiveTranscriptLines((current) => current.filter((line) => line.key !== key));
  };

  const extractRealtimeTranscript = (event: Record<string, unknown>): string | null => {
    if (typeof event.transcript === "string") return event.transcript;
    if (typeof event.text === "string") return event.text;
    if (typeof event.delta === "string") return event.delta;

    const item = event.item;
    if (!item || typeof item !== "object" || !("content" in item)) {
      return null;
    }

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      return null;
    }

    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }

      const transcript = (part as { transcript?: unknown; text?: unknown }).transcript;
      if (typeof transcript === "string" && transcript.trim()) {
        return transcript;
      }

      const text = (part as { transcript?: unknown; text?: unknown }).text;
      if (typeof text === "string" && text.trim()) {
        return text;
      }
    }

    return null;
  };

  const captureRealtimeTranscript = (agentId: string, event: Record<string, unknown>): void => {
    const type = typeof event.type === "string" ? event.type : "";
    const item =
      event.item && typeof event.item === "object"
        ? (event.item as { role?: unknown })
        : null;
    const isUserSpeechMarker = type === "input_audio_buffer.speech_started";
    const isUserTranscript =
      type.startsWith("conversation.item.input_audio_transcription.") ||
      (type === "conversation.item.retrieved" && item?.role === "user");
    const isAgentTranscript =
      type.startsWith("response.output_audio_transcript.") ||
      type.startsWith("response.audio_transcript.");
    const isDelta = type.endsWith(".delta");
    const isFinal =
      type.endsWith(".done") ||
      type.endsWith(".completed") ||
      type === "conversation.item.retrieved";

    if (isUserSpeechMarker) {
      showLiveSubtitle({
        key: "user:listening",
        speakerType: "user",
        agentId: null,
        content: "Listening...",
        isFinal: false,
      }, true);
      return;
    }

    if ((!isUserTranscript && !isAgentTranscript) || (!isDelta && !isFinal)) {
      return;
    }

    const transcript = extractRealtimeTranscript(event);

    const normalizedTranscript = transcript?.trim();
    if (!normalizedTranscript) {
      return;
    }

    const speakerType: TranscriptSpeakerType = isAgentTranscript ? "agent" : "user";
    const key = getRealtimeTranscriptKey(speakerType, event);
    const existingTranscript = liveTranscriptContentRef.current.get(key) ?? "";
    const fullTranscript = isDelta
      ? `${existingTranscript}${transcript}`.trimStart()
      : normalizedTranscript;
    const finalTranscript = fullTranscript.trim();
    const line: LiveTranscriptLine = {
      key,
      speakerType,
      agentId: speakerType === "agent" ? agentId : null,
      content: finalTranscript,
      isFinal,
    };

    liveTranscriptContentRef.current.set(key, finalTranscript);
    if (isFinal) {
      updateLiveTranscriptLine(line);
    }
    showLiveSubtitle(line);

    if (!isFinal || !selectedSession || selectedSession.status !== "active") {
      return;
    }

    void appendSessionEvent({
      userId: friendsUserId,
      sessionId: selectedSession.id,
      speakerType,
      agentId: speakerType === "agent" ? agentId : null,
      content: finalTranscript,
      metadata: { realtimeEventType: type },
    })
      .then((savedEvent) => {
        setSessionEvents((current) => [...current, savedEvent]);
        removeLiveTranscriptLine(key);
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
    clearLiveTranscriptionState();
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
      let savedEvent: SessionEvent;
      try {
        savedEvent = await appendSessionEvent({
          userId: friendsUserId,
          sessionId: activeSession.id,
          speakerType: "user",
          content: question,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!message.toLowerCase().includes("active session not found")) {
          throw error;
        }

        activeSession = await createSession({
          userId: friendsUserId,
          originalQuestion: question,
        });
        setSelectedSession(activeSession);
        setSessionEvents([]);
        setSessions((current) => [activeSession, ...current]);
        savedEvent = await appendSessionEvent({
          userId: friendsUserId,
          sessionId: activeSession.id,
          speakerType: "user",
          content: question,
        });
      }
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

  const getFreshVoiceRuntime = async (agentId: string): Promise<FriendVoiceAgentRuntime | null> => {
    setFriendsStatusMessage("Preparing a fresh voice connection...");

    try {
      const payload = await initializeFriendsMode(friendsUserId);
      setFriendsInit(payload);
      return payload.agents.find((agent) => agent.id === agentId) ?? null;
    } catch (error) {
      setFriendsInitError(
        error instanceof Error ? error.message : "Failed to prepare live voice.",
      );
      setFriendsStatusMessage(null);
      return null;
    }
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

    const runtime = await getFreshVoiceRuntime(agentId);

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
        onConnectionStateChange: (state) => {
          if (state === "failed" || state === "disconnected") {
            setFriendsInitError(
              "Live voice disconnected. Check microphone permission and try the member again.",
            );
            setFriendsStatusMessage(null);
          }
        },
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
    if (!import.meta.env.DEV) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const proofMode = params.get("subtitleProof");
    if (!proofMode) {
      return;
    }

    const timerId = window.setTimeout(() => {
      if (proofMode === "user") {
        captureRealtimeTranscript("bobo", {
          type: "input_audio_buffer.speech_started",
        });
        window.setTimeout(() => {
          captureRealtimeTranscript("bobo", {
            type: "conversation.item.input_audio_transcription.completed",
            item_id: "proof-user-input",
            transcript: "Proof: your spoken words are rendered as a subtitle.",
          });
        }, 220);
        return;
      }

      captureRealtimeTranscript("bobo", {
        type: "response.audio_transcript.delta",
        response_id: "proof-response",
        output_index: 0,
        content_index: 0,
        delta: "Proof: Bobo's live model transcript is rendered as a subtitle.",
      });
    }, 300);

    return () => window.clearTimeout(timerId);
  }, []);

  useEffect(() => {
    if (hasLoadedSessionsRef.current) {
      return;
    }

    hasLoadedSessionsRef.current = true;
    void refreshSessions();
  }, []);

  useEffect(() => {
    return () => {
      clearFriendPrepTimers();
      clearSubtitleFlushTimer();
      pendingLiveSubtitleRef.current = null;
      speechRecognitionRef.current?.stop();
      speechRecognitionRef.current = null;
      voicePreviewRef.current?.close();
      voicePreviewRef.current = null;
      clearSubtitleTimer();
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
        liveTranscriptLines={liveTranscriptLines}
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
  liveTranscriptLines,
}: CouncilHomeProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isHistoryMounted, setIsHistoryMounted] = useState(false);
  const [isThreadTransitioning, setIsThreadTransitioning] = useState(false);
  const threadTransitionTimerRef = useRef<number | null>(null);
  const isViewingArchive = selectedSession?.status === "ended";
  const fallbackStatus = supportsVoicePromptInput
    ? "Type a question or tap the mic to speak."
    : "Type a question. Voice input is not supported in this browser.";
  const triggerThreadTransition = (): void => {
    if (threadTransitionTimerRef.current) {
      window.clearTimeout(threadTransitionTimerRef.current);
    }

    setIsThreadTransitioning(true);
    threadTransitionTimerRef.current = window.setTimeout(() => {
      setIsThreadTransitioning(false);
      threadTransitionTimerRef.current = null;
    }, 720);
  };

  const handleSelectSession = (sessionId: string): void => {
    if (sessionId !== selectedSession?.id) {
      triggerThreadTransition();
    }
    onSelectSession(sessionId);
    setIsHistoryOpen(false);
  };

  const handleCreateSession = (): void => {
    triggerThreadTransition();
    onCreateSession();
    setIsHistoryOpen(false);
  };

  useEffect(() => {
    if (isHistoryOpen) {
      setIsHistoryMounted(true);
      return;
    }

    const timerId = window.setTimeout(() => {
      setIsHistoryMounted(false);
    }, 260);

    return () => window.clearTimeout(timerId);
  }, [isHistoryOpen]);

  useEffect(() => {
    return () => {
      if (threadTransitionTimerRef.current) {
        window.clearTimeout(threadTransitionTimerRef.current);
      }
    };
  }, []);

  return (
    <main
      className={`council-shell ${isHistoryOpen ? "history-open" : "history-collapsed"}`}
      aria-labelledby={isViewingArchive ? "archive-title" : "home-title"}
    >
      {!isHistoryOpen ? (
        <button
          className="history-toggle history-dock-toggle"
          type="button"
          onClick={() => setIsHistoryOpen(true)}
          aria-expanded={isHistoryOpen}
          aria-controls="session-sidebar"
          aria-label="Show previous talks"
        >
          <PanelLeftOpen size={17} aria-hidden="true" />
          <span>History</span>
        </button>
      ) : null}

      {isHistoryMounted ? (
        <SessionSidebar
          isOpen={isHistoryOpen}
          isLoading={isSessionLoading}
          onClose={() => setIsHistoryOpen(false)}
          onCreateSession={handleCreateSession}
          onSelectSession={handleSelectSession}
          selectedSessionId={selectedSession?.id ?? null}
          sessions={sessions}
        />
      ) : null}
      <section className="council-card">
        {isThreadTransitioning ? <ThreadTransitionMark /> : null}

        <header className="home-topbar">
          <a className="home-brand" href="/" aria-label="D.R.A.M.A. home">
            <span>D</span>
            D.R.A.M.A.
          </a>
          <div className="home-topbar-actions">
            <p>
              {selectedSession?.status === "ended"
                ? "Remembered"
                : isCouncilThinking
                  ? "Council preparing"
                  : activeVoiceAgentId
                    ? "Live voice"
                    : "Powered by GPT Realtime 2"}
            </p>
            {selectedSession?.status === "ended" ? (
              <button
                className="new-session-button"
                type="button"
                onClick={handleCreateSession}
                disabled={isSessionLoading}
              >
                <Plus size={16} aria-hidden="true" />
                New Talk
              </button>
            ) : null}
          </div>
        </header>

        {isViewingArchive ? (
          <ArchiveSessionDetail events={events} session={selectedSession} />
        ) : (
          <div className="live-meeting-layout">
            <section className="live-stage" aria-label="Live voice stage">
              <div className="home-intro">
                <h2 className="home-title" id="home-title">
                  Talk to your council of closest friends.
                </h2>
                <p className="home-subtitle">Decision Review by Artificial Moronic Advisors</p>
              </div>

              <CouncilPhotoRow
                activeVoiceAgentId={activeVoiceAgentId}
                isArchived={false}
                isConnectingVoice={isConnectingVoice}
                onEndLiveSession={onEndLiveSession}
                onPreviewVoice={onPreviewVoice}
                prepById={prepById}
              />

              <PromptComposer
                activeVoiceAgentId={activeVoiceAgentId}
                isArchived={false}
                isCouncilThinking={isCouncilThinking}
                isEndingSession={isEndingSession}
                isLoading={isLoading || isSessionLoading}
                isPromptRecording={isPromptRecording}
                onAskQuestion={onAskQuestion}
                onEndLiveSession={onEndLiveSession}
                onEndSession={onEndSession}
                onQuestionChange={onQuestionChange}
                onStartVoicePrompt={onStartVoicePrompt}
                onStopVoicePrompt={onStopVoicePrompt}
                question={question}
                selectedSession={selectedSession}
                supportsVoicePromptInput={supportsVoicePromptInput}
              />

              <div
                className={`status-note ${error ? "error" : ""}`}
                role={error ? "alert" : "status"}
              >
                {error || statusMessage || fallbackStatus}
              </div>

              <LiveSubtitleOverlay />
            </section>

            <LiveTranscriptPanel activeVoiceAgentId={activeVoiceAgentId} />
          </div>
        )}
      </section>
    </main>
  );
}

function ThreadTransitionMark() {
  return (
    <div className="thread-transition" role="status" aria-label="Switching thread">
      <span className="thread-loader-ring" aria-hidden="true" />
    </div>
  );
}

function SessionSidebar({
  isOpen,
  isLoading,
  onClose,
  onCreateSession,
  onSelectSession,
  selectedSessionId,
  sessions,
}: {
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  selectedSessionId: string | null;
  sessions: DramaSession[];
}) {
  const selectedActiveSession = sessions.find(
    (session) => session.id === selectedSessionId && session.status === "active",
  );
  const activeSessions = sessions.filter(
    (session) =>
      session.status === "active" &&
      session.id !== selectedActiveSession?.id &&
      session.originalQuestion,
  );
  const rememberedSessions = sessions.filter((session) => session.status === "ended");
  const visibleSessions = [
    ...(selectedActiveSession ? [selectedActiveSession] : []),
    ...rememberedSessions,
    ...activeSessions,
  ];

  return (
    <aside
      className={`session-sidebar ${isOpen ? "open" : "closing"}`}
      id="session-sidebar"
      aria-label="Talk sessions"
      aria-hidden={!isOpen}
    >
      <div className="session-sidebar-header">
        <strong>Talks</strong>
        <div className="session-sidebar-actions">
          <button type="button" onClick={onCreateSession} disabled={isLoading}>
            New Talk
          </button>
          <button
            className="sidebar-close"
            type="button"
            onClick={onClose}
            aria-label="Hide previous talks"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="session-list">
        {visibleSessions.length === 0 ? (
          <p>{isLoading ? "Loading sessions..." : "No talks yet."}</p>
        ) : (
          visibleSessions.map((session) => (
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

const CHINESE_FEMALE_VOICE_HINTS = [
  "ting-ting",
  "tingting",
  "xiaoxiao",
  "xiaoyi",
  "yaoyao",
  "huihui",
  "meijia",
  "mei-jia",
  "sinji",
  "sin-ji",
];

function getSummaryVoices(): SpeechSynthesisVoice[] {
  if (!("speechSynthesis" in window)) {
    return [];
  }

  return window.speechSynthesis.getVoices();
}

function waitForSummaryVoices(): Promise<SpeechSynthesisVoice[]> {
  const voices = getSummaryVoices();
  if (voices.length || !("speechSynthesis" in window)) {
    return Promise.resolve(voices);
  }

  return new Promise((resolve) => {
    const synthesis = window.speechSynthesis;
    const finish = (): void => {
      window.clearTimeout(timeoutId);
      synthesis.removeEventListener("voiceschanged", finish);
      resolve(synthesis.getVoices());
    };
    const timeoutId = window.setTimeout(finish, 300);
    synthesis.addEventListener("voiceschanged", finish);
  });
}

function getPreferredSummaryVoice(
  lang: string,
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (!voices.length) {
    return null;
  }

  const languagePrefix = lang.toLowerCase().split("-")[0];
  const languageVoices = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith(languagePrefix),
  );
  if (!languageVoices.length) {
    return null;
  }

  if (languagePrefix === "zh") {
    const preferredChineseVoice = languageVoices.find((voice) => {
      const normalizedName = voice.name.toLowerCase().replace(/\s+/g, "");
      return CHINESE_FEMALE_VOICE_HINTS.some((hint) => normalizedName.includes(hint));
    });

    return preferredChineseVoice ?? languageVoices[0];
  }

  return (
    languageVoices.find((voice) => voice.lang.toLowerCase() === lang.toLowerCase()) ??
    languageVoices[0]
  );
}

function tuneSummaryUtterance(
  utterance: SpeechSynthesisUtterance,
  lang: string,
  voices: SpeechSynthesisVoice[],
): void {
  utterance.lang = lang;

  if (lang.toLowerCase().startsWith("zh")) {
    utterance.rate = 0.72;
    utterance.pitch = 1.08;
    utterance.volume = 0.92;
    utterance.voice = getPreferredSummaryVoice(lang, voices);
    return;
  }

  utterance.voice = getPreferredSummaryVoice(lang, voices);
}

function ArchiveSessionDetail({
  events,
  session,
}: {
  events: SessionEvent[];
  session: DramaSession;
}) {
  const [activeSpeechId, setActiveSpeechId] = useState<string | null>(null);
  const [isSpeechPaused, setIsSpeechPaused] = useState(false);
  const speechRunIdRef = useRef(0);
  const participantAgents = FRIENDS_MODE_AGENTS.filter((agent) =>
    events.some((event) => event.agentId === agent.id),
  );
  const endedDate = session.endedAt
    ? new Date(session.endedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Saved";

  const speakSummary = async (
    text: string | null,
    lang: string,
    speechId: string,
  ): Promise<void> => {
    if (!text?.trim() || !("speechSynthesis" in window)) {
      return;
    }

    const runId = speechRunIdRef.current + 1;
    speechRunIdRef.current = runId;
    window.speechSynthesis.cancel();
    const voices = await waitForSummaryVoices();
    if (speechRunIdRef.current !== runId) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    tuneSummaryUtterance(utterance, lang, voices);
    utterance.onend = () => {
      if (speechRunIdRef.current === runId) {
        setActiveSpeechId(null);
        setIsSpeechPaused(false);
      }
    };
    utterance.onerror = () => {
      if (speechRunIdRef.current === runId) {
        setActiveSpeechId(null);
        setIsSpeechPaused(false);
      }
    };
    utterance.onpause = () => {
      if (speechRunIdRef.current === runId) {
        setIsSpeechPaused(true);
      }
    };
    utterance.onresume = () => {
      if (speechRunIdRef.current === runId) {
        setIsSpeechPaused(false);
      }
    };
    setActiveSpeechId(speechId);
    setIsSpeechPaused(false);
    window.speechSynthesis.speak(utterance);
  };

  const playSpeech = (text: string | null, lang: string, speechId: string): void => {
    if (activeSpeechId === speechId && isSpeechPaused) {
      window.speechSynthesis?.resume();
      setIsSpeechPaused(false);
      return;
    }

    void speakSummary(text, lang, speechId);
  };

  const pauseSpeech = (): void => {
    window.speechSynthesis?.pause();
    setIsSpeechPaused(true);
  };

  const stopSpeech = (): void => {
    speechRunIdRef.current += 1;
    window.speechSynthesis?.cancel();
    setActiveSpeechId(null);
    setIsSpeechPaused(false);
  };

  useEffect(() => {
    return () => {
      speechRunIdRef.current += 1;
      window.speechSynthesis?.cancel();
    };
  }, []);

  const renderSummaryActions = (
    text: string | null,
    lang: string,
    speechId: string,
    label: string,
  ) => {
    const isCurrentSpeech = activeSpeechId === speechId;

    return (
      <span className="voice-action-row" aria-label={`${label} summary player`}>
        <button
          className="voice-action voice-action-primary"
          type="button"
          disabled={!text?.trim() || (isCurrentSpeech && !isSpeechPaused)}
          onClick={() => playSpeech(text, lang, speechId)}
        >
          <Play size={15} aria-hidden="true" />
          Play
        </button>
        <button
          className="voice-action voice-action-secondary"
          type="button"
          disabled={!isCurrentSpeech || isSpeechPaused}
          onClick={pauseSpeech}
          aria-label={`Pause ${label} summary`}
        >
          <Pause size={15} aria-hidden="true" />
          Pause
        </button>
        <button
          className="voice-action voice-action-secondary voice-action-stop"
          type="button"
          disabled={!isCurrentSpeech}
          onClick={stopSpeech}
          aria-label={`Stop ${label} summary`}
        >
          <Square size={14} aria-hidden="true" />
          Stop
        </button>
      </span>
    );
  };

  return (
    <section className="archive-detail" aria-label="Saved chat summary">
      <div className="archive-hero">
        <p className="eyebrow">Previous chat</p>
        <h1 id="archive-title">{session.title}</h1>
        <p className="home-subtitle">
          {endedDate} · {events.length} saved turn{events.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="archive-grid">
        <section className="archive-panel summary-feature">
          <div className="summary-panel-heading">
            <div className="archive-panel-title">
              <Headphones size={18} aria-hidden="true" />
              <strong>AI summary</strong>
            </div>
            {renderSummaryActions(session.summaryEnglish, "en-US", "english", "English")}
          </div>
          <p>{session.summaryEnglish ?? "No summary was generated for this chat yet."}</p>
        </section>

        <section className="archive-panel participants-panel">
          <div className="archive-panel-title">
            <Users size={18} aria-hidden="true" />
            <strong>Participants</strong>
          </div>
          <div className="participant-list">
            <div className="participant-row">
              <span className="participant-initial">Y</span>
              <span>
                <strong>{USER_PARTICIPANT.name}</strong>
                <small>{USER_PARTICIPANT.role}</small>
              </span>
            </div>
            {participantAgents.map((agent) => (
              <div className="participant-row" key={agent.id}>
                <span className="friends-avatar">
                  <img
                    src={agent.avatarImage}
                    alt=""
                    width="96"
                    height="96"
                    loading="lazy"
                    decoding="async"
                    aria-hidden="true"
                  />
                </span>
                <span>
                  <strong>{agent.name}</strong>
                  <small>{agent.role}</small>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="archive-panel translations-panel">
          <div className="archive-panel-title">
            <Languages size={18} aria-hidden="true" />
            <strong>Translations</strong>
          </div>
          <div className="translation-card">
            <div className="translation-card-heading">
              <span>
                <strong>Hindi</strong>
                <small>{session.summaryHindi ? "Ready" : "Not generated"}</small>
              </span>
              {renderSummaryActions(session.summaryHindi, "hi-IN", "hindi", "Hindi")}
            </div>
            <p lang="hi">{session.summaryHindi || "Hindi translation is not available yet."}</p>
          </div>
          <div className="translation-card">
            <div className="translation-card-heading">
              <span>
                <strong>Chinese</strong>
                <small>{session.summaryChinese ? "Ready" : "Not generated"}</small>
              </span>
              {renderSummaryActions(session.summaryChinese, "zh-CN", "chinese", "Chinese")}
            </div>
            <p lang="zh-Hans">
              {session.summaryChinese || "Chinese translation is not available yet."}
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}

function LiveTranscriptPanel({
  activeVoiceAgentId,
}: {
  activeVoiceAgentId: string | null;
}) {
  const currentTranscript = useLiveSubtitle();
  const currentSpeakerName = currentTranscript
    ? currentTranscript.speakerName
    : activeVoiceAgentId
      ? getFriendDisplayName(activeVoiceAgentId)
      : null;

  return (
    <section
      className="live-transcript-panel"
      aria-label="Current speaker transcript"
    >
      <div className="live-transcript-header">
        <strong>{currentSpeakerName ?? "Transcript"}</strong>
        <small>{currentTranscript ? "Speaking" : "Live"}</small>
      </div>

      <div className="live-transcript-list">
        {currentTranscript ? (
          <article className={`transcript-event ${currentTranscript.speakerType}`}>
            <p>{currentTranscript.content}</p>
          </article>
        ) : (
          <p className="live-transcript-empty">
            {activeVoiceAgentId ? "Waiting for speech..." : "Start live voice."}
          </p>
        )}
      </div>
    </section>
  );
}

function LiveSubtitleOverlay() {
  const subtitle = useLiveSubtitle();

  if (!subtitle) {
    return null;
  }

  return (
    <aside
      className={`live-subtitle-overlay ${subtitle.speakerType} ${
        subtitle.isFinal ? "is-final" : "is-live"
      }`}
      aria-live="polite"
      aria-label="Live subtitle"
    >
      <strong>{subtitle.speakerName}</strong>
      <p>{subtitle.content}</p>
    </aside>
  );
}

function CouncilPhotoRow({
  activeVoiceAgentId,
  isArchived,
  isConnectingVoice,
  onEndLiveSession,
  onPreviewVoice,
  prepById,
}: {
  activeVoiceAgentId: string | null;
  isArchived: boolean;
  isConnectingVoice: boolean;
  onEndLiveSession: () => void;
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
          <article
            className={`member-photo-card is-${prepState} ${isActive ? "is-live" : ""}`}
            key={agent.id}
          >
            <button
              className="member-photo-main"
              type="button"
              disabled={isArchived || !isReady || isConnectingVoice}
              onClick={() => onPreviewVoice(agent.id)}
              aria-label={`${agent.name}, ${agent.role}, ${statusLabel}`}
            >
              <span className="portrait-wrap">
                <img
                  src={agent.avatarImage}
                  alt=""
                  width="192"
                  height="192"
                  decoding="async"
                  aria-hidden="true"
                />
                <span className="status-orbit" aria-hidden="true"></span>
              </span>
              <span className="member-copy">
                <strong>{agent.name}</strong>
                <small>{agent.role}</small>
              </span>
            </button>
            <span className="member-live-row">
              <span className="member-state">{statusLabel}</span>
              {isActive ? (
                <button
                  className="member-stop-button"
                  type="button"
                  onClick={onEndLiveSession}
                  aria-label={`Stop talking to ${agent.name}`}
                >
                  <PhoneOff size={13} aria-hidden="true" />
                  Stop
                </button>
              ) : null}
            </span>
          </article>
        );
      })}
    </section>
  );
}

function PromptComposer({
  activeVoiceAgentId,
  isArchived,
  isCouncilThinking,
  isEndingSession,
  isLoading,
  isPromptRecording,
  onAskQuestion,
  onEndLiveSession,
  onEndSession,
  onQuestionChange,
  onStartVoicePrompt,
  onStopVoicePrompt,
  question,
  selectedSession,
  supportsVoicePromptInput,
}: {
  activeVoiceAgentId: string | null;
  isArchived: boolean;
  isCouncilThinking: boolean;
  isEndingSession: boolean;
  isLoading: boolean;
  isPromptRecording: boolean;
  onAskQuestion: () => void;
  onEndLiveSession: () => void;
  onEndSession: () => void;
  onQuestionChange: (question: string) => void;
  onStartVoicePrompt: () => void;
  onStopVoicePrompt: () => void;
  question: string;
  selectedSession: DramaSession | null;
  supportsVoicePromptInput: boolean;
}) {
  const isSubmitDisabled = isArchived || !question.trim() || isCouncilThinking || isLoading;
  const actionLabel = isArchived ? "Session Ended" : isCouncilThinking ? "Thinking" : "Ask Council";
  const isActiveSession = selectedSession?.status === "active";
  const isInsideSession = Boolean(
    isActiveSession &&
      (selectedSession?.originalQuestion || activeVoiceAgentId || isCouncilThinking),
  );

  return (
    <section className="prompt-composer" aria-label="Question composer">
      <textarea
        value={question}
        onChange={(event) => onQuestionChange(event.target.value)}
        placeholder="What do you want to talk about ?"
        rows={5}
        disabled={isArchived}
      />
      <div className={`composer-actions ${isInsideSession ? "in-session" : ""}`}>
        <button
          className={`mic-button ${isPromptRecording ? "recording" : ""}`}
          type="button"
          disabled={isArchived || !supportsVoicePromptInput}
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
          {isCouncilThinking ? (
            <Loader2 className="spin" size={18} aria-hidden="true" />
          ) : (
            <Send size={18} aria-hidden="true" />
          )}
          {actionLabel}
        </button>
        {isInsideSession ? (
          <button
            className="session-action-button"
            type="button"
            onClick={onEndLiveSession}
            disabled={!activeVoiceAgentId}
          >
            <PhoneOff size={17} aria-hidden="true" />
            Stop talking
          </button>
        ) : null}
        {isInsideSession ? (
          <button
            className="session-action-button danger"
            type="button"
            onClick={onEndSession}
            disabled={isEndingSession || isLoading}
          >
            <PhoneOff size={17} aria-hidden="true" />
            {isEndingSession ? "Saving..." : "End Session"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default App;
