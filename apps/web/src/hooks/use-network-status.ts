import { useSyncExternalStore } from "react";

let isOnline = typeof navigator !== "undefined" && navigator.onLine;
let probeId = 0;
let interval: number | null = null;
const listeners = new Set<() => void>();

const probeNetwork = async (): Promise<boolean> => {
  if (!navigator.onLine) {
    return false;
  }

  try {
    const response = await fetch("/api/health", {
      cache: "no-store",
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
};

const publish = (value: boolean) => {
  if (isOnline === value) {
    return;
  }
  isOnline = value;
  for (const listener of listeners) {
    listener();
  }
};

const refresh = async () => {
  probeId += 1;
  const currentProbe = probeId;
  const connected = await probeNetwork();
  if (currentProbe === probeId) {
    publish(connected);
  }
};

const handleOnline = async () => {
  await refresh();
};

const handleOffline = () => {
  probeId += 1;
  publish(false);
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    interval = window.setInterval(handleOnline, 30_000);
    handleOnline();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    }
  };
};

/** Confirm network access to the live service, not only a connected interface. */
export const useNetworkStatus = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => isOnline,
    () => false
  );
