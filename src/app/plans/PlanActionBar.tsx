"use client";

import { useState } from "react";

/**
 * Floating cluster of icon buttons (Add practice, Save, Revert) that stays in
 * view while the plan scrolls. It is `position: sticky` inside the app's scroll
 * wrapper rather than `fixed` — see the note in layout.tsx about iPad toolbars.
 * Hovering an icon shows its label; clicking acts. A ⚠ button appears when the
 * plan has problems and opens a popover with the messages.
 */
export default function PlanActionBar({
  onAdd,
  onSave,
  onRevert,
  disabled,
  saving,
  problems,
}: {
  onAdd: () => void;
  onSave: () => void;
  onRevert: () => void;
  /** Frozen plan or save in flight: nothing can be edited. */
  disabled: boolean;
  saving: boolean;
  /** Validation errors and/or the last save failure; Save is blocked while any exist. */
  problems: string[];
}) {
  const [showProblems, setShowProblems] = useState(false);
  const hasProblems = problems.length > 0;

  return (
    // Reserve the cluster's height only at the end of the editor; while
    // scrolling it sticks to the bottom of the scroll area and content passes
    // underneath. `h-16` also keeps the last item clear of the buttons.
    <div className="sticky bottom-0 h-16 pointer-events-none">
      <div className="absolute right-0 bottom-2 flex items-end gap-2 pointer-events-auto">
        {hasProblems && showProblems && (
          <div
            role="status"
            className="absolute right-0 bottom-full mb-2 w-72 max-w-[80vw] rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 shadow-lg"
          >
            <ul className="space-y-1">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-1 rounded-full border border-zinc-200 bg-white p-1 shadow-lg">
          {hasProblems && (
            <IconButton
              label={showProblems ? "Hide problems" : "Show problems"}
              onClick={() => setShowProblems((s) => !s)}
              aria-expanded={showProblems}
              tone="danger"
            >
              ⚠
            </IconButton>
          )}
          <IconButton label="Add practice" onClick={onAdd} disabled={disabled}>
            +
          </IconButton>
          <IconButton
            label={saving ? "Saving…" : "Save"}
            onClick={onSave}
            disabled={disabled || hasProblems}
            tone="primary"
          >
            💾
          </IconButton>
          <IconButton label="Revert" onClick={onRevert} disabled={disabled}>
            ↶
          </IconButton>
        </div>
      </div>
    </div>
  );
}

const TONES = {
  default: "hover:bg-zinc-100 disabled:text-zinc-300 disabled:hover:bg-transparent",
  primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-zinc-200 disabled:text-zinc-400",
  danger: "text-red-600 hover:bg-red-50",
};

function IconButton({
  label,
  tone = "default",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: keyof typeof TONES }) {
  return (
    <span className="group relative">
      <button
        type="button"
        aria-label={label}
        className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${TONES[tone]}`}
        {...props}
      >
        {children}
      </button>
      {/* Tooltip: hover/focus only (Tailwind's hover: is skipped on touch devices). */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full right-0 mb-1 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
