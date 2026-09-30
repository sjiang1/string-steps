import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TabBar from "./TabBar";
import { ServerActivityProvider } from "./ServerActivity";
import { getActiveStudent, getStudents } from "./actions";
import type { Student } from "./students";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "String Steps",
  description: "Interactive violin practice for students",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [students, activeStudent] = await Promise.all([getStudents(), getActiveStudent()]);
  const otherStudent: Student | null =
    students.find((s) => s.id !== activeStudent.id) ?? null;
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-dvh flex flex-col">
        <ServerActivityProvider>
          {/* The app owns scrolling (not the document): the body is locked to the
              dynamic viewport and this wrapper scrolls, so the tab bar below sits
              in normal flow — no `position: fixed` for iPad toolbars to unmoor. */}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          <TabBar activeStudent={activeStudent} otherStudent={otherStudent} />
        </ServerActivityProvider>
      </body>
    </html>
  );
}
