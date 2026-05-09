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
  summaryEnglish: string | null;
  summaryChinese: string | null;
  summaryHindi: string | null;
  summaryAudioMime: string | null;
  summaryAudioBase64: string | null;
  summaryGeneratedAt: string | null;
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

export type SessionBundle = {
  session: DramaSession;
  events: SessionEvent[];
};
