"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { NavBar } from "@/components/nav-bar";
import { GrainGrid } from "@/components/grain-grid";
import { SelectionCounter } from "@/components/selection-counter";
import { ResultsDashboard } from "@/components/results-dashboard";
import { Button } from "@/components/ui/button";
import type { GrainData, SessionData, GradingResult, ReferenceRanges } from "@/types";

export default function GradingPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<SessionData | null>(null);
  const [grains, setGrains] = useState<GrainData[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GradingResult | null>(null);
  const [ranges, setRanges] = useState<ReferenceRanges | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load session");
      }
      const data = await res.json();
      setSession(data.session);
      setGrains(data.grains);

      // If already graded, we need to extract results from the grains
      if (data.session.status === "graded") {
        const total = data.grains.length;
        const counts = { A: 0, B: 0, C: 0, D: 0, broken: 0 };
        for (const g of data.grains as GrainData[]) {
          if (g.grade && g.grade in counts) {
            counts[g.grade as keyof typeof counts]++;
          }
        }
        const gradeAPercent = total > 0 ? (counts.A / total) * 100 : 0;
        let verdict: GradingResult["verdict"];
        if (gradeAPercent >= 80) verdict = "Excellent batch";
        else if (gradeAPercent >= 60) verdict = "Good quality";
        else if (gradeAPercent >= 40) verdict = "Mixed quality";
        else verdict = "Review recommended";

        setResults({
          gradeA: total > 0 ? (counts.A / total) * 100 : 0,
          gradeB: total > 0 ? (counts.B / total) * 100 : 0,
          gradeC: total > 0 ? (counts.C / total) * 100 : 0,
          gradeD: total > 0 ? (counts.D / total) * 100 : 0,
          broken: total > 0 ? (counts.broken / total) * 100 : 0,
          total,
          verdict,
        });

        // Compute ranges from reference grains
        const refs = (data.grains as GrainData[]).filter((g: GrainData) => g.isReference);
        if (refs.length > 0) {
          setRanges({
            lengthMin: Math.min(...refs.map((r: GrainData) => r.lengthMm)),
            lengthMax: Math.max(...refs.map((r: GrainData) => r.lengthMm)),
            widthMin: Math.min(...refs.map((r: GrainData) => r.widthMm)),
            widthMax: Math.max(...refs.map((r: GrainData) => r.widthMm)),
            tailMin: Math.min(...refs.map((r: GrainData) => r.tailLengthMm)),
            tailMax: Math.max(...refs.map((r: GrainData) => r.tailLengthMm)),
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  function handleToggleGrain(id: number) {
    if (results) return; // Graded, no toggling
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 10) {
        next.add(id);
      }
      return next;
    });
  }

  async function handleDeleteGrain(id: number) {
    try {
      const res = await fetch(`/api/grains/${id}`, { method: "DELETE" });
      if (res.status === 401) { router.push("/login"); return; }
      if (!res.ok) return;
      setGrains((prev) => prev.filter((g) => g.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      // silently ignore
    }
  }

  async function handleGradeNow() {
    setGrading(true);
    setError(null);

    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          selectedGrainIds: [...selectedIds],
        }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Grading failed");
      }

      const data = await res.json();
      setResults(data.results);
      setRanges(data.ranges);

      // Reload grains to get updated grade data
      const reloadRes = await fetch(`/api/sessions/${sessionId}`);
      if (reloadRes.ok) {
        const reloadData = await reloadRes.json();
        setSession(reloadData.session);
        setGrains(reloadData.grains);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grading failed");
    } finally {
      setGrading(false);
    }
  }

  function handleExportCsv() {
    const headers = [
      "Grain #",
      "Length (mm)",
      "Width (mm)",
      "Tail (mm)",
      "Broken",
      "Reference",
      "Grade",
      "Score",
    ];
    const rows = grains.map((g) => [
      g.grainNumber,
      g.lengthMm.toFixed(2),
      g.widthMm.toFixed(2),
      g.tailLengthMm.toFixed(2),
      g.isBroken ? "Yes" : "No",
      g.isReference ? "Yes" : "No",
      g.grade || "",
      g.score != null ? g.score.toFixed(2) : "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grading-${sessionId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <NavBar />
        <main className="flex flex-1 items-center justify-center">
          <p className="text-zinc-400">Loading session...</p>
        </main>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="flex min-h-screen flex-col">
        <NavBar />
        <main className="flex flex-1 items-center justify-center">
          <p className="text-red-400">{error}</p>
        </main>
      </div>
    );
  }

  const isGraded = !!results;
  const canGrade = selectedIds.size >= 5 && selectedIds.size <= 10;

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">
              {session?.name || `Session ${sessionId.slice(0, 8)}`}
            </h1>
            <p className="text-sm text-zinc-500">
              {grains.length} grains &middot; Sorted by length &darr;
            </p>
          </div>
          {isGraded && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCsv}>
                Export CSV
              </Button>
              <Button size="sm" onClick={() => router.push("/upload")}>
                New Image
              </Button>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Results dashboard (after grading) */}
        {isGraded && results && ranges && (
          <ResultsDashboard results={results} ranges={ranges} />
        )}

        {/* Selection counter (before grading) */}
        {!isGraded && (
          <div className="flex items-center justify-between">
            <SelectionCounter count={selectedIds.size} />
            <Button
              onClick={handleGradeNow}
              disabled={!canGrade || grading}
            >
              {grading ? "Grading..." : "Grade Now"}
            </Button>
          </div>
        )}

        {/* Annotated original image with bounding boxes */}
        <details className="rounded-lg border border-zinc-800 bg-zinc-900/50">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-300 hover:text-zinc-100">
            View detected grains on original image
          </summary>
          <div className="px-4 pb-4">
            <img
              src={`/api/static/data/grains/${sessionId}/annotated.png`}
              alt="Original image with bounding boxes"
              className="w-full rounded-lg"
            />
          </div>
        </details>

        {/* Grain grid */}
        <GrainGrid
          grains={grains}
          selectedIds={selectedIds}
          onToggleGrain={handleToggleGrain}
          onDeleteGrain={!isGraded ? handleDeleteGrain : undefined}
          selectable={!isGraded}
          ranges={ranges}
        />
      </main>
    </div>
  );
}
