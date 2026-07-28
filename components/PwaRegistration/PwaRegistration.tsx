"use client";

import { useEffect, useRef, useState } from "react";

const SERVICE_WORKER_URL = "/sw.js?v=5";
const SKIP_WAITING_MESSAGE = "SKIP_WAITING";

export function PwaUpdatePrompt({
  updating,
  onRefresh,
  onDismiss,
}: {
  updating: boolean;
  onRefresh: () => void;
  onDismiss: () => void;
}) {
  return (
    <section
      className="pwaUpdatePrompt"
      role="dialog"
      aria-labelledby="pwa-update-title"
      aria-describedby="pwa-update-description"
    >
      <div className="pwaUpdateCopy">
        <strong id="pwa-update-title">Update available</strong>
        <span id="pwa-update-description">
          Refresh to use the latest version of WCA Rankings.
        </span>
      </div>
      <div className="pwaUpdateActions">
        <button
          className="pwaUpdateDismiss"
          type="button"
          onClick={onDismiss}
          disabled={updating}
        >
          Later
        </button>
        <button
          className="pwaUpdateRefresh"
          type="button"
          onClick={onRefresh}
          disabled={updating}
        >
          {updating ? "Updating…" : "Refresh"}
        </button>
      </div>
    </section>
  );
}

export function PwaRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const reloadOnControllerChange = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;
    const watchedWorkers = new Map<ServiceWorker, () => void>();

    const offerUpdate = (worker: ServiceWorker | null) => {
      if (!worker || !navigator.serviceWorker.controller || disposed) return;
      setWaitingWorker(worker);
      setDismissed(false);
    };

    const watchInstallingWorker = (worker: ServiceWorker | null) => {
      if (!worker || watchedWorkers.has(worker)) return;
      const onStateChange = () => {
        if (worker.state === "installed") {
          offerUpdate(registration?.waiting ?? worker);
        }
      };
      watchedWorkers.set(worker, onStateChange);
      worker.addEventListener("statechange", onStateChange);
      onStateChange();
    };

    const onUpdateFound = () => {
      watchInstallingWorker(registration?.installing ?? null);
    };

    const onControllerChange = () => {
      if (!reloadOnControllerChange.current) return;
      reloadOnControllerChange.current = false;
      window.location.reload();
    };

    const checkForUpdate = () => {
      if (document.visibilityState !== "visible") return;
      void registration?.update().catch(() => undefined);
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );
    document.addEventListener("visibilitychange", checkForUpdate);

    void navigator.serviceWorker
      .register(SERVICE_WORKER_URL, {
        scope: "/",
        updateViaCache: "none",
      })
      .then((nextRegistration) => {
        if (disposed) return;
        registration = nextRegistration;
        registration.addEventListener("updatefound", onUpdateFound);
        offerUpdate(registration.waiting);
        watchInstallingWorker(registration.installing);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", onUpdateFound);
      watchedWorkers.forEach((listener, worker) => {
        worker.removeEventListener("statechange", listener);
      });
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      document.removeEventListener("visibilitychange", checkForUpdate);
    };
  }, []);

  const refresh = () => {
    if (!waitingWorker) return;
    setUpdating(true);
    reloadOnControllerChange.current = true;
    waitingWorker.postMessage({ type: SKIP_WAITING_MESSAGE });
  };

  if (!waitingWorker || dismissed) return null;

  return (
    <PwaUpdatePrompt
      updating={updating}
      onRefresh={refresh}
      onDismiss={() => setDismissed(true)}
    />
  );
}
