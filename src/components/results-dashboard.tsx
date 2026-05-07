"use client";

import type { GradingResult, ReferenceRanges } from "@/types";
import { QualityVerdictBanner } from "@/components/quality-verdict";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ResultsDashboardProps {
  results: GradingResult;
  ranges: ReferenceRanges;
}

const gradeConfig = [
  { key: "gradeA" as const, label: "Grade A", color: "bg-green-500", textColor: "text-green-400" },
  { key: "gradeB" as const, label: "Grade B", color: "bg-yellow-500", textColor: "text-yellow-400" },
  { key: "gradeC" as const, label: "Grade C", color: "bg-orange-500", textColor: "text-orange-400" },
  { key: "gradeD" as const, label: "Grade D", color: "bg-red-500", textColor: "text-red-400" },
  { key: "broken" as const, label: "Broken", color: "bg-zinc-500", textColor: "text-zinc-400" },
];

export function ResultsDashboard({ results, ranges }: ResultsDashboardProps) {
  return (
    <div className="flex flex-col gap-4">
      <QualityVerdictBanner verdict={results.verdict} />

      {/* Grade distribution cards */}
      <div className="grid grid-cols-5 gap-3">
        {gradeConfig.map((g) => {
          const pct = results[g.key];
          return (
            <div
              key={g.key}
              className="flex flex-col items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
            >
              <div className={`h-2 w-2 rounded-full ${g.color}`} />
              <span className={`text-xl font-bold tabular-nums ${g.textColor}`}>
                {pct.toFixed(1)}%
              </span>
              <span className="text-xs text-zinc-500">{g.label}</span>
            </div>
          );
        })}
      </div>

      {/* Reference Ranges */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Reference Ranges</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-zinc-500">Length (mm)</p>
              <p className="text-sm font-medium tabular-nums text-zinc-200">
                {ranges.lengthMin.toFixed(2)} - {ranges.lengthMax.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Width (mm)</p>
              <p className="text-sm font-medium tabular-nums text-zinc-200">
                {ranges.widthMin.toFixed(2)} - {ranges.widthMax.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Tail (mm)</p>
              <p className="text-sm font-medium tabular-nums text-zinc-200">
                {ranges.tailMin.toFixed(2)} - {ranges.tailMax.toFixed(2)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Color legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" /> A
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" /> B
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-orange-500" /> C
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> D
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-zinc-500" /> Broken
        </span>
      </div>
    </div>
  );
}
