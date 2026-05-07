"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SelectionCounterProps {
  count: number;
}

export function SelectionCounter({ count }: SelectionCounterProps) {
  const valid = count >= 5 && count <= 10;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
              valid
                ? "bg-green-500/15 text-green-400 ring-1 ring-green-500/30"
                : "bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700"
            }`}
          >
            Selected: {count} / 5-10
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Select representative good grains — not the largest or smallest
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
