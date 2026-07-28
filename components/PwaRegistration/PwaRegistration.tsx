"use client";

import { useEffect } from "react";

const SERVICE_WORKER_URL = "/sw.js?v=4";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register(SERVICE_WORKER_URL, {
      scope: "/",
      updateViaCache: "none",
    }).catch(() => undefined);
  }, []);

  return null;
}
