"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Student } from "./students";

export default function TabBar({
  activeStudent,
  otherStudent,
}: {
  activeStudent: Student;
  otherStudent: Student | null;
}) {
  const pathname = usePathname();

  const tabs = [
    { href: "/", label: "Practice", icon: "♪" },
    { href: "/calendar", label: "Calendar", icon: "▦" },
    { href: "/plans", label: "Plans", icon: "✎" },
    { href: "/teacher", label: "Teacher", icon: "👨‍🏫" },
  ].filter((t) => t.href !== "/teacher" || activeStudent.kind === "primary");

  function switchUser() {
    if (!otherStudent) return;
    document.cookie = `activeStudentId=${otherStudent.id}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }

  return (
    <nav className="shrink-0 bg-white border-t border-zinc-200 flex">
      {tabs.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 flex flex-col items-center py-2 text-sm transition-colors ${
              active ? "text-blue-600" : "text-zinc-400"
            }`}
          >
            <span className={`text-lg ${active ? "" : "grayscale"}`}>{tab.icon}</span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
      {otherStudent && (
        <button
          onClick={switchUser}
          className="flex-1 flex flex-col items-center py-2 text-sm text-zinc-600 border-l border-zinc-200"
        >
          <span className="text-lg">{activeStudent.emoji}</span>
          <span>{activeStudent.name}</span>
        </button>
      )}
    </nav>
  );
}
