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
