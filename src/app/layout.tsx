import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AlarmWatcher } from "@/components/alarms/alarm-watcher";
import { ReminderWatcher } from "@/components/reminders/reminder-watcher";
import { MobileBottomNav } from "@/components/navigation/mobile-bottom-nav";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// Applies the saved theme before first paint (no flash of wrong theme).
const THEME_INIT = `(function(){try{var t=localStorage.getItem("w2w:theme");var d=t==="dark"||((!t||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export const metadata: Metadata = {
  title: { default: "Wake2Win — AI Study Alarm & Focus", template: "%s · Wake2Win" },
  description:
    "Wake up on time, stay disciplined, and study consistently. AI wake-up challenges, smart pomodoro, analytics and gamification for NEET, JEE, UPSC, SSC, GATE, CAT and Boards.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Wake2Win" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f1a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className={`${inter.variable} font-sans`}>
        <AlarmWatcher />
        <ReminderWatcher />
        {children}
        <MobileBottomNav />
      </body>
    </html>
  );
}
