"use client";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfirmModalProps = {
  title: string;
  message: string;
  variant?: "danger" | "warning" | "default";
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConfirmModal({
  title,
  message,
  variant = "default",
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmClass =
    variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
      : variant === "warning"
      ? "bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-400"
      : "bg-slate-800 text-white hover:bg-slate-700 focus:ring-slate-600";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          {title}
        </h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
