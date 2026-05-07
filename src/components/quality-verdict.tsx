"use client";

import type { QualityVerdict } from "@/types";

interface QualityVerdictProps {
  verdict: QualityVerdict;
}

const verdictStyles: Record<QualityVerdict, string> = {
  "Excellent batch": "border-green-500/40 bg-green-500/10 text-green-400",
  "Good quality": "border-blue-500/40 bg-blue-500/10 text-blue-400",
  "Mixed quality": "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  "Review recommended": "border-red-500/40 bg-red-500/10 text-red-400",
};

export function QualityVerdictBanner({ verdict }: QualityVerdictProps) {
  return (
    <div
      className={`rounded-lg border-2 px-6 py-4 text-center text-lg font-semibold ${verdictStyles[verdict]}`}
    >
      {verdict}
    </div>
  );
}
