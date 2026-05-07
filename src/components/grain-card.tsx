"use client";

import type { GradeLabel, ReferenceRanges } from "@/types";
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
  score: number | null;
  lengthMm: number;
  widthMm: number;
  tailLengthMm: number;
  ranges: ReferenceRanges | null;
  onToggle: () => void;
  onDelete?: () => void;
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

function buildGradeTooltip(
  grade: GradeLabel,
  score: number | null,
  lengthMm: number,
  widthMm: number,
  tailLengthMm: number,
  ranges: ReferenceRanges,
): React.ReactNode {
  if (grade === "broken") {
    return (
      <div className="space-y-1 text-xs">
        <p className="font-semibold">Broken grain</p>
        <p className="text-zinc-400">Length/width ratio too close to 1:1</p>
      </div>
    );
  }

  const lengthOk = lengthMm >= ranges.lengthMin && lengthMm <= ranges.lengthMax;
  const widthOk = widthMm >= ranges.widthMin && widthMm <= ranges.widthMax;
  const tailOk = tailLengthMm >= ranges.tailMin && tailLengthMm <= ranges.tailMax;

  const check = (ok: boolean) => ok ? "✓" : "✗";
  const color = (ok: boolean) => ok ? "text-green-400" : "text-red-400";

  return (
    <div className="space-y-1.5 text-xs">
      <p className="font-semibold">
        Grade {grade}
        {score != null && <span className="ml-1 font-normal text-zinc-400">(score: {(score * 100).toFixed(0)}%)</span>}
      </p>
      <div className="space-y-0.5">
        <p className={color(lengthOk)}>
          {check(lengthOk)} Length: {lengthMm.toFixed(2)}mm
          <span className="text-zinc-500"> ({ranges.lengthMin.toFixed(1)}–{ranges.lengthMax.toFixed(1)}mm)</span>
        </p>
        <p className={color(widthOk)}>
          {check(widthOk)} Width: {widthMm.toFixed(2)}mm
          <span className="text-zinc-500"> ({ranges.widthMin.toFixed(1)}–{ranges.widthMax.toFixed(1)}mm)</span>
        </p>
        <p className={color(tailOk)}>
          {check(tailOk)} Tail: {tailLengthMm.toFixed(2)}mm
          <span className="text-zinc-500"> ({ranges.tailMin.toFixed(1)}–{ranges.tailMax.toFixed(1)}mm)</span>
        </p>
      </div>
      {!lengthOk && <p className="text-zinc-500">Length has 60% weight — biggest impact on grade</p>}
    </div>
  );
}

export function GrainCard({
  grainNumber,
  cropImage,
  isBroken,
  isSelected,
  grade,
  score,
  lengthMm,
  widthMm,
  tailLengthMm,
  ranges,
  onToggle,
  onDelete,
  selectable,
}: GrainCardProps) {
  const card = (
    <div
      onClick={selectable ? onToggle : undefined}
      className={`group relative flex flex-col items-center gap-1 rounded-lg p-2 transition-all ${
        selectable ? "cursor-pointer" : ""
      } ${selectable && !isSelected ? "hover:bg-zinc-700/50" : ""} ${
        isSelected
          ? "bg-green-500/10 ring-2 ring-green-500"
          : grade
            ? `ring-2 ${gradeColors[grade]} ${gradeBgColors[grade]}`
            : ""
      } ${isBroken && !isSelected ? "opacity-60" : ""}`}
    >
      {/* Delete button */}
      {onDelete && !isSelected && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600/80 text-xs text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
          title="Remove grain"
        >
          &#10005;
        </button>
      )}
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

      <div className="relative flex w-full items-center justify-center" style={{ height: "7rem" }}>
        <img
          src={`/api/static/${cropImage}`}
          alt={`Grain ${grainNumber}`}
          className="h-full rounded bg-zinc-900 object-contain"
        />
        {lengthMm > 0 && (
          <div
            className="absolute right-0.5 flex flex-col items-center justify-center"
            style={{ height: `${Math.min((5 / lengthMm) * 100, 95)}%` }}
            title="5mm reference"
          >
            <div className="relative h-full w-2.5 flex items-center">
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-yellow-400" />
              <div className="absolute top-0 left-0 h-px w-full bg-yellow-400" />
              <div className="absolute bottom-0 left-0 h-px w-full bg-yellow-400" />
            </div>
            <span className="mt-0.5 text-[8px] font-bold leading-none text-yellow-400 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">5mm</span>
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xs text-zinc-400">#{grainNumber}</span>
        {lengthMm > 0 && (
          <span className="text-[9px] text-zinc-500">
            {lengthMm.toFixed(1)}×{widthMm.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );

  if (selectable && isBroken) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="block w-full text-left">{card}</TooltipTrigger>
          <TooltipContent>This grain appears broken</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (grade && ranges && !selectable) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="block w-full text-left">{card}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {buildGradeTooltip(grade, score, lengthMm, widthMm, tailLengthMm, ranges)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return card;
}
