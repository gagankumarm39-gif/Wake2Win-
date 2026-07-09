"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function DeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    let remove: (() => void) | undefined;

    async function init() {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      const { App } = await import("@capacitor/app");
      const { Browser } = await import("@capacitor/browser");

      const listener = await App.addListener("appUrlOpen", async ({ url }) => {
        if (!url.startsWith("com.wake2win.app://auth/callback")) return;

        await Browser.close();

        const parsed = new URL(url);
        const code = parsed.searchParams.get("code");
        const next = parsed.searchParams.get("next") || "/dashboard";

        if (!code) {
          router.replace("/login?error=auth");
          return;
        }

        const supabase = createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          router.replace("/login?error=auth");
        } else {
          router.replace(next);
        }
      });

      remove = () => listener.remove();
    }

    init();

    return () => {
      remove?.();
    };
  }, [router]);

  return null;
}