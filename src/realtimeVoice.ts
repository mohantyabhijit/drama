import type { FriendVoiceAgentRuntime } from "./friendsModePublic";

export type VoicePreviewSession = {
  close: () => void;
  sendText: (text: string) => void;
};

type StartVoicePreviewOptions = {
  openingLine?: string;
  onConnectionStateChange?: (state: RTCPeerConnectionState | RTCIceConnectionState) => void;
  onServerEvent?: (event: Record<string, unknown>) => void;
};

const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

function parseJsonEvent(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function describeHttpError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed?.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // Fall through to generic message.
  }
  return `Realtime call failed with status ${status}.`;
}

async function createRealtimeAnswerSdp(
  sdpOffer: string,
  clientSecret: string,
): Promise<string> {
  const response = await fetch(OPENAI_REALTIME_CALLS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clientSecret}`,
      "Content-Type": "application/sdp",
    },
    body: sdpOffer,
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(describeHttpError(response.status, body));
  }

  return body;
}

function buildUserTextEvent(text: string): Record<string, unknown> {
  return {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text,
        },
      ],
    },
  };
}

function buildAudioResponseEvent(): Record<string, unknown> {
  return {
    type: "response.create",
    response: {
      output_modalities: ["audio"],
    },
  };
}

export async function startVoicePreviewSession(
  agent: FriendVoiceAgentRuntime,
  options: StartVoicePreviewOptions = {},
): Promise<VoicePreviewSession> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support microphone access.");
  }

  const peerConnection = new RTCPeerConnection();
  const dataChannel = peerConnection.createDataChannel("oai-events");
  const localStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
  const remoteAudio = document.createElement("audio");
  remoteAudio.autoplay = true;
  remoteAudio.setAttribute("playsinline", "true");
  remoteAudio.style.position = "fixed";
  remoteAudio.style.width = "1px";
  remoteAudio.style.height = "1px";
  remoteAudio.style.opacity = "0";
  remoteAudio.style.pointerEvents = "none";
  document.body.appendChild(remoteAudio);

  let isClosed = false;

  const close = (): void => {
    if (isClosed) return;
    isClosed = true;

    localStream.getTracks().forEach((track) => track.stop());
    if (peerConnection.connectionState !== "closed") {
      peerConnection.close();
    }
    if (remoteAudio.srcObject instanceof MediaStream) {
      remoteAudio.srcObject.getTracks().forEach((track) => track.stop());
    }
    remoteAudio.srcObject = null;
    remoteAudio.remove();
  };

  try {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.addEventListener("connectionstatechange", () => {
      options.onConnectionStateChange?.(peerConnection.connectionState);
    });

    peerConnection.addEventListener("iceconnectionstatechange", () => {
      options.onConnectionStateChange?.(peerConnection.iceConnectionState);
    });

    peerConnection.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;

      remoteAudio.srcObject = stream;
      void remoteAudio.play().catch(() => {
        // If autoplay is blocked, the user can still unmute/allow audio manually.
      });
    };

    dataChannel.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      const payload = parseJsonEvent(event.data);
      if (!payload) return;
      options.onServerEvent?.(payload);
    });

    const connectionFailed = new Promise<never>((_, reject) => {
      const rejectIfFailed = () => {
        if (
          peerConnection.connectionState === "failed" ||
          peerConnection.iceConnectionState === "failed"
        ) {
          reject(new Error("Realtime voice connection failed. Check microphone permission and network access."));
        }
      };

      peerConnection.addEventListener("connectionstatechange", rejectIfFailed);
      peerConnection.addEventListener("iceconnectionstatechange", rejectIfFailed);
    });

    const dataChannelReady = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error("Timed out waiting for realtime data channel."));
      }, 12000);

      dataChannel.addEventListener("open", () => {
        window.clearTimeout(timeout);
        resolve();
      });
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const answerSdp = await createRealtimeAnswerSdp(
      offer.sdp ?? "",
      agent.clientSecret.value,
    );

    await peerConnection.setRemoteDescription({
      type: "answer",
      sdp: answerSdp,
    });

    await Promise.race([dataChannelReady, connectionFailed]);

    if (options.openingLine) {
      dataChannel.send(JSON.stringify(buildUserTextEvent(options.openingLine)));
      dataChannel.send(JSON.stringify(buildAudioResponseEvent()));
    }

    return {
      close,
      sendText: (text: string): void => {
        if (isClosed || dataChannel.readyState !== "open") return;
        const message = text.trim();
        if (!message) return;
        dataChannel.send(JSON.stringify(buildUserTextEvent(message)));
        dataChannel.send(JSON.stringify(buildAudioResponseEvent()));
      },
    };
  } catch (error) {
    close();
    throw error;
  }
}
