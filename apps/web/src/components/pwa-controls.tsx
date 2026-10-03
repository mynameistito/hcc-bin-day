import { useEffect, useState } from "react";

const applyWaitingUpdate = async (): Promise<void> => {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
  } catch {
    console.error("Failed to apply the app update.");
  }
};

/** Show browser-specific instructions for adding the site to a home screen. */
export const PwaInstallHelp = () => (
  <details className="relative">
    <summary className="text-sage-dark min-h-11 cursor-pointer rounded-lg px-2 py-2 text-sm font-semibold underline-offset-4 hover:underline sm:px-0">
      <span className="sm:hidden">Install</span>
      <span className="hidden sm:inline">Install app</span>
    </summary>
    <div className="bg-surface border-paper-border absolute right-0 z-10 mt-2 w-72 rounded-xl border p-4 text-sm shadow-lg">
      <p className="font-semibold">Add Hamilton Bin Day</p>
      <p className="text-copy-muted mt-2">
        Android: use your browser menu and choose “Install app” or “Add to Home
        screen”.
      </p>
      <p className="text-copy-muted mt-2">
        iPhone or iPad: in Safari, tap Share, then “Add to Home Screen”.
      </p>
    </div>
  </details>
);

/** Explain offline data freshness and let users apply a ready app update. */
export const PwaStatus = ({ isOnline }: { readonly isOnline: boolean }) => {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const showUpdate = () => setUpdateAvailable(true);
    window.addEventListener("app-update-available", showUpdate);
    return () => {
      window.removeEventListener("app-update-available", showUpdate);
    };
  }, []);

  if (isOnline && !updateAvailable) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="bg-panel mx-auto mb-4 w-full max-w-6xl rounded-xl px-4 py-3 text-sm"
    >
      {!isOnline && (
        <p>
          You’re offline. Live collection data can’t be refreshed, so schedules
          are hidden until you reconnect.
        </p>
      )}
      {updateAvailable && (
        <p className="flex flex-wrap items-center gap-3">
          A new version is ready.
          <button
            className="font-semibold underline underline-offset-2"
            onClick={applyWaitingUpdate}
            type="button"
          >
            Update app
          </button>
        </p>
      )}
    </div>
  );
};
