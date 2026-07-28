"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistration("/").then((registration) => registration?.unregister());
      void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
      return;
    }

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);

  return null;
}
