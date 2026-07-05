"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MissionCardProps {
  code: string;
  title: string;
  type: "daily" | "weekly";
  progress: number;
  target: number;
  xpReward: number;
  coinReward: number;
  periodStart: string; // YYYY-MM-DD
  claimed: boolean;
}

export function MissionCard(m: MissionCardProps) {
  const router = useRouter();
  const supabase = createClient();
  const [claiming, setClaiming] = useState(false);
  const [claimedNow, setClaimedNow] = useState(false);

  const done = m.claimed || claimedNow;
  const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
  const claimable = !done && m.progress >= m.target;

  async function claim() {
    setClaiming(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("user_missions").insert({
      user_id: user.id,
      mission_code: m.code,
      period_start: m.periodStart,
      progress: m.progress,
      completed_at: new Date().toISOString(),
    });

    if (!error) {
      const { data: p } = await supabase.from("profiles").select("xp, coins").eq("id", user.id).single();
      if (p) {
        await supabase
          .from("profiles")
          .update({ xp: p.xp + m.xpReward, coins: p.coins + m.coinReward })
          .eq("id", user.id);
      }
      // First claim ever unlocks the First Win badge (duplicate-safe).
      await supabase
        .from("user_badges")
        .upsert(
          { user_id: user.id, badge_code: "first_win" },
          { onConflict: "user_id,badge_code", ignoreDuplicates: true }
        );
      setClaimedNow(true);
      router.refresh();
    }
    setClaiming(false);
  }

  return (
    <div className={cn("glass p-5", done && "opacity-70")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-bold">{m.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            +{m.xpReward} XP · +{m.coinReward} coins · {m.type}
          </p>
        </div>
        {done ? (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-500">
            <CheckCircle2 className="h-4 w-4" /> Claimed
          </span>
        ) : claimable ? (
          <Button size="sm" onClick={claim} disabled={claiming}>
            {claiming ? "Claiming…" : "Claim"}
          </Button>
        ) : (
          <span className="text-sm font-semibold tabular-nums text-slate-500">
            {Math.min(m.progress, m.target)}/{m.target}
          </span>
        )}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className={cn("h-full rounded-full transition-all", done || claimable ? "bg-emerald-500" : "bg-brand-500")}
          style={{ width: `${done ? 100 : pct}%` }}
        />
      </div>
    </div>
  );
}
