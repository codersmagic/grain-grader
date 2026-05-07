"use client";

import type { GrainData, ReferenceRanges } from "@/types";
import { GrainCard } from "@/components/grain-card";

interface GrainGridProps {
  grains: GrainData[];
  selectedIds: Set<number>;
  onToggleGrain: (id: number) => void;
  onDeleteGrain?: (id: number) => void;
  selectable: boolean;
  ranges: ReferenceRanges | null;
}

export function GrainGrid({
  grains,
  selectedIds,
  onToggleGrain,
  onDeleteGrain,
  selectable,
  ranges,
}: GrainGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
      {grains.map((grain, idx) => (
        <div
          key={grain.id}
          className={`rounded-lg ${idx % 2 === 0 ? "bg-zinc-900" : "bg-zinc-800/70"}`}
        >
          <GrainCard
            grainNumber={grain.grainNumber}
            cropImage={grain.cropImage}
            isBroken={grain.isBroken}
            isSelected={selectedIds.has(grain.id)}
            grade={grain.grade}
            score={grain.score}
            lengthMm={grain.lengthMm}
            widthMm={grain.widthMm}
            tailLengthMm={grain.tailLengthMm}
            ranges={ranges}
            onToggle={() => onToggleGrain(grain.id)}
            onDelete={onDeleteGrain ? () => onDeleteGrain(grain.id) : undefined}
            selectable={selectable}
          />
        </div>
      ))}
    </div>
  );
}
