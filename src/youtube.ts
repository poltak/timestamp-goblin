export function isWatchPage(): boolean {
  return location.pathname === "/watch";
}

export function getVideoId(): string | null {
  if (!isWatchPage()) {
    return null;
  }
  const params = new URLSearchParams(location.search);
  return params.get("v");
}

export function isLiveVideo(video: HTMLVideoElement): boolean {
  return video.duration === Infinity || video.seekable.length === 0;
}

export function clampResumeTarget(t: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 1) {
    return t;
  }
  const maxTarget = Math.max(0, duration - 0.5);
  return Math.min(Math.max(0, t), maxTarget);
}

function pickText(selectors: string[]): string | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent) {
      const text = el.textContent.trim();
      if (text) {
        return text;
      }
    }
  }
  return null;
}

export function getVideoTitle(): string | null {
  const title = pickText([
    "h1.title yt-formatted-string",
    "h1.ytd-watch-metadata yt-formatted-string",
    "h1.title",
  ]);
  if (title) {
    return title;
  }
  const raw = document.title;
  if (!raw) {
    return null;
  }
  return raw.replace(/\s+-\s+YouTube\s*$/, "").trim() || null;
}

export function getChannelName(): string | null {
  return pickText([
    "ytd-channel-name a",
    "#owner-name a",
    "#text-container.ytd-channel-name",
    "ytd-video-owner-renderer a",
  ]);
}

type WaitHandle = {
  promise: Promise<HTMLVideoElement>;
  cancel: () => void;
};

export function waitForVideoElement(timeoutMs = 15000): WaitHandle {
  let observer: MutationObserver | null = null;
  let timeoutId: number | null = null;
  let settled = false;

  const promise = new Promise<HTMLVideoElement>((resolve, reject) => {
    const existing = document.querySelector("video");
    if (existing) {
      settled = true;
      resolve(existing);
      return;
    }

    const done = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      fn();
    };

    observer = new MutationObserver(() => {
      const found = document.querySelector("video");
      if (found) {
        done(() => resolve(found));
      }
    });

    if (!document.body) {
      done(() => reject(new Error("document.body missing")));
      return;
    }

    observer.observe(document.body, { childList: true, subtree: true });

    timeoutId = window.setTimeout(() => {
      done(() => reject(new Error("timeout waiting for video")));
    }, timeoutMs);
  });

  return {
    promise,
    cancel: () => {
      if (settled) {
        return;
      }
      settled = true;
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
}
