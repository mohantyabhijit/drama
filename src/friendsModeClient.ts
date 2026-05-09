import type { FriendsModeInitResponse } from "./friendsMode";

export async function initializeFriendsMode(userId: string): Promise<FriendsModeInitResponse> {
  const response = await fetch("/api/friends-mode/init", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to initialize Friends Mode voice agents.");
  }

  return (await response.json()) as FriendsModeInitResponse;
}
