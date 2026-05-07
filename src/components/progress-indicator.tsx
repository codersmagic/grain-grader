"use client";

interface ProgressIndicatorProps {
  step: "idle" | "uploading" | "segmenting" | "measuring" | "done" | "error";
  measuredCount?: number;
  totalCount?: number;
  error?: string;
}

const steps = [
  { key: "uploading", label: "Uploading image" },
  { key: "segmenting", label: "Segmenting grains" },
  { key: "measuring", label: "Measuring grains" },
  { key: "done", label: "Complete" },
] as const;

type StepKey = (typeof steps)[number]["key"];

function getStepStatus(
  stepKey: StepKey,
  currentStep: ProgressIndicatorProps["step"]
): "completed" | "active" | "pending" | "error" {
  if (currentStep === "error") {
    if (stepKey === "done") return "error";
    return "pending";
  }

  const order: StepKey[] = ["uploading", "segmenting", "measuring", "done"];
  const currentIdx = order.indexOf(currentStep as StepKey);
  const stepIdx = order.indexOf(stepKey);

  if (currentStep === "idle") return "pending";
  if (stepIdx < currentIdx) return "completed";
  if (stepIdx === currentIdx) return "active";
  return "pending";
}

export function ProgressIndicator({
  step,
  measuredCount,
  totalCount,
  error,
}: ProgressIndicatorProps) {
  if (step === "idle") return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      {steps.map((s) => {
        const status = step === "error" ? getErrorStatus(s.key, step) : getStepStatus(s.key, step);

        let label: string = s.label;
        if (s.key === "measuring" && step === "measuring" && measuredCount != null && totalCount != null) {
          label = `Measuring grain ${measuredCount} of ${totalCount}...`;
        }
        if (s.key === "done" && status === "completed") {
          label = "Complete — redirecting...";
        }

        return (
          <div key={s.key} className="flex items-center gap-3">
            <StepDot status={status} />
            <span
              className={
                status === "active"
                  ? "text-sm font-medium text-blue-400"
                  : status === "completed"
                    ? "text-sm text-green-400"
                    : status === "error"
                      ? "text-sm text-red-400"
                      : "text-sm text-zinc-500"
              }
            >
              {label}
            </span>
          </div>
        );
      })}
      {step === "error" && error && (
        <div className="mt-1 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

function getErrorStatus(
  stepKey: StepKey,
  _currentStep: string
): "completed" | "active" | "pending" | "error" {
  // When in error state, all steps show as pending except we indicate error
  // The last visible step gets the error indicator
  if (stepKey === "done") return "error";
  return "pending";
}

function StepDot({ status }: { status: "completed" | "active" | "pending" | "error" }) {
  if (status === "completed") {
    return (
      <div className="flex h-3 w-3 items-center justify-center">
        <div className="h-3 w-3 rounded-full bg-green-500" />
      </div>
    );
  }
  if (status === "active") {
    return (
      <div className="flex h-3 w-3 items-center justify-center">
        <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex h-3 w-3 items-center justify-center">
        <div className="h-3 w-3 rounded-full bg-red-500" />
      </div>
    );
  }
  return (
    <div className="flex h-3 w-3 items-center justify-center">
      <div className="h-3 w-3 rounded-full bg-zinc-600" />
    </div>
  );
}
