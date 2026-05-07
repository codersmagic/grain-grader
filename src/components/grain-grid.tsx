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
  columns?: number;
}

export function GrainGrid({
  grains,
  selectedIds,
  onToggleGrain,
  onDeleteGrain,
  selectable,
  ranges,
  columns = 8,
}: GrainGridProps) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {grains.map((grain, idx) => {
        const col = idx % columns;
        const isEvenCol = col % 2 === 0;

        return (
          <div
            key={grain.id}
            className={`rounded-lg ${isEvenCol ? "bg-zinc-900" : "bg-zinc-800/70"}`}
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
        );
      })}
    </div>
  );
}
