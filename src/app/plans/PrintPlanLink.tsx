import Link from "next/link";

// Opens a plan's printable handout (/plans/print) in a new tab, which brings
// up the browser's print dialog on load. Primary account only — callers gate it.
export default function PrintPlanLink({ planId }: { planId: string }) {
  return (
    <Link
      href={`/plans/print?id=${planId}`}
      target="_blank"
      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
    >
      🖨 Print
    </Link>
  );
}
