"use client";

import type { GradeLabel } from "@/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface GrainCardProps {
  grainNumber: number;
  cropImage: string;
  isBroken: boolean;
  isSelected: boolean;
  grade: GradeLabel | null;
  onToggle: () => void;
  selectable: boolean;
}

const gradeColors: Record<GradeLabel, string> = {
  A: "ring-green-500",
  B: "ring-yellow-500",
  C: "ring-orange-500",
  D: "ring-red-500",
  broken: "ring-zinc-500",
};

const gradeBgColors: Record<GradeLabel, string> = {
  A: "bg-green-500/10",
  B: "bg-yellow-500/10",
  C: "bg-orange-500/10",
  D: "bg-red-500/10",
  broken: "bg-zinc-500/10",
};

export function GrainCard({
  grainNumber,
  cropImage,
  isBroken,
  isSelected,
  grade,
  onToggle,
  selectable,
}: GrainCardProps) {
  const card = (
    <div
      onClick={selectable ? onToggle : undefined}
      className={`relative flex flex-col items-center gap-1 rounded-lg p-2 transition-all ${
        selectable ? "cursor-pointer" : ""
      } ${selectable && !isSelected ? "hover:bg-zinc-700/50" : ""} ${
        isSelected
          ? "bg-green-500/10 ring-2 ring-green-500"
          : grade
            ? `ring-2 ${gradeColors[grade]} ${gradeBgColors[grade]}`
            : ""
      } ${isBroken && !isSelected ? "opacity-60" : ""}`}
    >
      {/* Selection checkmark */}
      {isSelected && (
        <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-xs text-white">
          &#10003;
        </div>
      )}

      {/* Grade badge */}
      {grade && !selectable && (
        <div
          className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
            grade === "broken"
              ? "bg-zinc-600 text-zinc-300"
              : grade === "A"
                ? "bg-green-600 text-white"
                : grade === "B"
                  ? "bg-yellow-600 text-white"
                  : grade === "C"
                    ? "bg-orange-600 text-white"
                    : "bg-red-600 text-white"
          }`}
        >
          {grade === "broken" ? "broken" : grade}
        </div>
      )}

      {/* Broken badge (when selectable) */}
      {isBroken && selectable && (
        <div className="absolute left-1 top-1 rounded bg-zinc-600 px-1.5 py-0.5 text-[10px] text-zinc-300">
          broken
        </div>
      )}

      <img
        src={`/api/static/${cropImage}`}
        alt={`Grain ${grainNumber}`}
        className="h-16 w-16 rounded object-contain"
      />
      <span className="text-xs text-zinc-400">#{grainNumber}</span>
    </div>
  );

  if (selectable && isBroken) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>{card}</TooltipTrigger>
          <TooltipContent>This grain appears broken</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return card;
}
