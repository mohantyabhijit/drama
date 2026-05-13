export type RealtimeVoice =
  | "alloy"
  | "ash"
  | "ballad"
  | "coral"
  | "echo"
  | "sage"
  | "shimmer"
  | "verse"
  | "marin"
  | "cedar";

export type FriendsModeModel = "gpt-realtime-2";
export type FriendsModeTranscriptionModel = "gpt-4o-transcribe";
export type FriendAgentKind = "voice";

export type FriendVoiceAgentProfile = {
  id: string;
  name: string;
  role: string;
  avatar: string;
  avatarImage: string;
  avatarGradient: string;
  kind: FriendAgentKind;
  model: FriendsModeModel;
  voice?: RealtimeVoice;
};

export type FriendVoiceAgentRuntime = {
  id: string;
  kind: FriendAgentKind;
  model: FriendsModeModel;
  voice?: RealtimeVoice;
  clientSecret: {
    value: string;
    expiresAt: number;
  };
  sessionId: string | null;
};

export type FriendsModeInitResponse = {
  mode: "friends";
  models: FriendsModeModel[];
  initializedAt: string;
  agents: FriendVoiceAgentRuntime[];
};

export const FRIENDS_MODE_VOICE_MODEL: FriendsModeModel = "gpt-realtime-2";
export const FRIENDS_MODE_TRANSCRIPTION_MODEL: FriendsModeTranscriptionModel =
  "gpt-4o-transcribe";

export const FRIENDS_MODE_AGENTS: FriendVoiceAgentProfile[] = [
  {
    id: "bobo",
    name: "Bobo",
    role: "Optimist Supporter",
    avatar: "B",
    avatarImage: "/assets/friend-bobo-face.jpg",
    avatarGradient: "linear-gradient(140deg, #f97316, #facc15)",
    kind: "voice",
    model: FRIENDS_MODE_VOICE_MODEL,
    voice: "coral",
  },
  {
    id: "sandy",
    name: "Sandy",
    role: "Pessimist Nihilist",
    avatar: "S",
    avatarImage: "/assets/friend-sandy-face.jpg",
    avatarGradient: "linear-gradient(140deg, #334155, #64748b)",
    kind: "voice",
    model: FRIENDS_MODE_VOICE_MODEL,
    voice: "ash",
  },
  {
    id: "adi",
    name: "Adi",
    role: "chaotic monkey",
    avatar: "A",
    avatarImage: "/assets/friend-adi-face.jpg",
    avatarGradient: "linear-gradient(140deg, #14b8a6, #22c55e)",
    kind: "voice",
    model: FRIENDS_MODE_VOICE_MODEL,
    voice: "echo",
  },
];

export function getFriendDisplayName(agentId: string | null | undefined): string {
  if (!agentId) {
    return "Friend";
  }

  return FRIENDS_MODE_AGENTS.find((agent) => agent.id === agentId)?.name ?? agentId;
}
