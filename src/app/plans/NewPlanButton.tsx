"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Plan } from "../plans";
import { createPlan } from "../actions";
import { todayLocal } from "../today";

export default function NewPlanButton({
  sourcePlan,
  defaultActiveFrom,
}: {
  sourcePlan: Plan | null;
  defaultActiveFrom: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeFrom, setActiveFrom] = useState(defaultActiveFrom);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const today = todayLocal();
      const draft: Plan = sourcePlan
        ? {
            id: "",
            createdDate: today,
            description: sourcePlan.description,
            items: sourcePlan.items.map((it) => ({
              trackChoices: [...it.trackChoices],
              tasks: it.tasks.map((t) => ({ ...t })),
              dice: it.dice,
              teacherNote: it.teacherNote,
            })),
            checklist: [...sourcePlan.checklist],
          }
        : {
            id: "",
            createdDate: today,
            description: "",
            items: [],
            checklist: [],
          };
      const { id } = await createPlan(draft, activeFrom);
      router.push(`/plans?id=${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-green-600 px-4 py-2 text-white"
      >
        + New plan
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <label className="text-sm text-zinc-600">
          Active from{" "}
          <input
            type="date"
            value={activeFrom}
            min={todayLocal()}
            onChange={(e) => setActiveFrom(e.target.value)}
            disabled={busy}
            className="rounded-md border border-zinc-300 px-2 py-1 disabled:bg-zinc-100"
          />
        </label>
        <button
          onClick={onCreate}
          disabled={busy}
          className="rounded-md bg-green-600 px-4 py-2 text-white disabled:bg-zinc-300"
        >
          {busy ? "Creating…" : "Create"}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:text-zinc-400"
        >
          Cancel
        </button>
      </div>
      {error && <span className="text-red-600 text-xs">{error}</span>}
    </div>
  );
}
