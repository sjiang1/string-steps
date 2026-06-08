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
      <body className="min-h-full flex flex-col">
        <ServerActivityProvider>
          <div className="flex-1 pb-16">{children}</div>
          <TabBar activeStudent={activeStudent} otherStudent={otherStudent} />
        </ServerActivityProvider>
      </body>
    </html>
  );
}
