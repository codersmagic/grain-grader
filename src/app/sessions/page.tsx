"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NavBar } from "@/components/nav-bar";
import { Card, CardContent } from "@/components/ui/card";
import type { SessionData } from "@/types";

const statusConfig: Record<string, { label: string; color: string }> = {
  segmented: { label: "Segmented", color: "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30" },
  measured: { label: "Measured", color: "bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30" },
  graded: { label: "Graded", color: "bg-green-500/15 text-green-400 ring-1 ring-green-500/30" },
};

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/sessions");
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/login");
            return;
          }
          throw new Error("Failed to load sessions");
        }
        const data = await res.json();
        setSessions(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sessions");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
        <h1 className="text-xl font-semibold text-zinc-100">Sessions</h1>

        {loading && (
          <p className="text-zinc-400">Loading sessions...</p>
        )}

        {error && (
          <p className="text-red-400">{error}</p>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16">
            <p className="text-zinc-400">
              No sessions yet. Upload an image to get started.
            </p>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <div className="flex flex-col gap-3">
            {sessions.map((s) => {
              const cfg = statusConfig[s.status] || statusConfig.segmented;
              const date = new Date(s.createdAt);
              const dateStr = date.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <Card
                  key={s.id}
                  className="cursor-pointer transition-colors hover:bg-zinc-800/50"
                  onClick={() => router.push(`/grading/${s.id}`)}
                >
                  <CardContent className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-zinc-100">
                        {s.name || `Session ${s.id.slice(0, 8)}`}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {dateStr} &middot; {s.grainCount} grains
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}
                    >
                      {cfg.label}
                    </span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
