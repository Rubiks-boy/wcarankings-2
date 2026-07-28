"use client";

import { useEffect } from "react";

const SERVICE_WORKER_URL = "/sw.js?v=3";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistration("/").then((registration) => registration?.unregister());
      void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
      return;
    }

    void navigator.serviceWorker.register(SERVICE_WORKER_URL, {
      scope: "/",
      updateViaCache: "none",
    }).catch(() => undefined);
  }, []);

  return null;
}
