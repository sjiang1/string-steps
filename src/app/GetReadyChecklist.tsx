import Image from "next/image";

type Category = "violin-hand" | "bow-hand" | "other";

interface ChecklistItem {
  id: string;
  description: string;
  /**
   * Resolved blob proxy path (`/api/img/<id>`) when this item's image exists in
   * the `checklist:blobs` Redis map, otherwise `null`. The image is OPTIONAL:
   * `page.tsx` sets this from live blob presence, so when no blob is uploaded the
   * item falls back to rendering `emoji` instead. See README "Get Ready Checklist".
   */
  image: string | null;
  /** Shown in place of the image when `image` is `null`. */
  emoji: string;
  category: string;
}

const CATEGORY_ORDER: Category[] = ["violin-hand", "bow-hand", "other"];

const CATEGORY_LABEL: Record<Category, string> = {
  "violin-hand": "Violin hand",
  "bow-hand": "Bow hand",
  other: "Other",
};

function normalizeCategory(category: string): Category {
  return category === "violin-hand" || category === "bow-hand" ? category : "other";
}

export default function GetReadyChecklist({ items }: { items: ChecklistItem[] }) {
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: items.filter((item) => normalizeCategory(item.category) === category),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-4">
      {groups.map((group) => (
        <div
          key={group.category}
          className="flex flex-col gap-1.5 min-w-[14rem]"
          style={{ flexGrow: group.items.length, flexBasis: 0 }}
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {CATEGORY_LABEL[group.category]}
          </span>
          <div className="flex gap-3">
            {group.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col items-center gap-1.5 rounded-lg border bg-white p-3 text-center flex-1 min-w-0"
              >
                {item.image ? (
                  <Image
                    src={item.image}
                    alt={item.description}
                    width={48}
                    height={48}
                    className="rounded object-cover"
                    unoptimized
                  />
                ) : (
                  <span
                    role="img"
                    aria-label={item.description}
                    className="flex h-12 w-12 items-center justify-center text-3xl"
                  >
                    {item.emoji}
                  </span>
                )}
                <span className="text-xs text-zinc-600">{item.description}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
