"use client";

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
