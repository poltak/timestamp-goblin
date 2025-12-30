export type VideoState = {
  t: number;
  updatedAt: number;
  duration?: number;
  title?: string;
  channel?: string;
};

function keyFor(videoId: string): string {
  return `ytp:${videoId}`;
}

export async function getVideoState(videoId: string): Promise<VideoState | null> {
  const key = keyFor(videoId);
  const result = await chrome.storage.local.get(key);
  const value = result[key] as VideoState | undefined;
  if (!value || typeof value.t !== "number") {
    return null;
  }
  return value;
}

export async function setVideoState(videoId: string, state: VideoState): Promise<void> {
  const key = keyFor(videoId);
  await chrome.storage.local.set({ [key]: state });
}
