"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { NavBar } from "@/components/nav-bar";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ProgressIndicator } from "@/components/progress-indicator";
import { Button } from "@/components/ui/button";

type Step = "idle" | "uploading" | "segmenting" | "measuring" | "done" | "error";

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | undefined>();
  const [measuredCount, setMeasuredCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const handleFileSelected = useCallback((f: File) => {
    setFile(f);
    setStep("idle");
    setError(undefined);
  }, []);

  async function handleAnalyze() {
    if (!file) return;

    setError(undefined);

    try {
      // Step 1: Upload
      setStep("uploading");
      const formData = new FormData();
      formData.append("image", file);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const data = await uploadRes.json();
        throw new Error(data.error || "Upload failed");
      }

      const { sessionId } = await uploadRes.json();

      // Step 2: Segment
      setStep("segmenting");
      const segmentRes = await fetch("/api/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (!segmentRes.ok) {
        const data = await segmentRes.json();
        throw new Error(data.error || "Segmentation failed");
      }

      const segmentData = await segmentRes.json();
      setTotalCount(segmentData.grainCount);

      // Step 3: Measure
      setStep("measuring");
      setMeasuredCount(0);

      const measureRes = await fetch("/api/measure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (!measureRes.ok) {
        const data = await measureRes.json();
        throw new Error(data.error || "Measurement failed");
      }

      const measureData = await measureRes.json();
      setMeasuredCount(measureData.measured);

      // Done
      setStep("done");
      setTimeout(() => {
        router.push(`/grading/${sessionId}`);
      }, 1500);
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    }
  }

  function handleTryAgain() {
    setStep("idle");
    setError(undefined);
    setFile(null);
  }

  const isProcessing = step !== "idle" && step !== "error" && step !== "done";

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8">
        <h1 className="text-xl font-semibold text-zinc-100">Upload Image</h1>

        <UploadDropzone
          onFileSelected={handleFileSelected}
          disabled={isProcessing}
        />

        {step !== "idle" && (
          <ProgressIndicator
            step={step}
            measuredCount={measuredCount}
            totalCount={totalCount}
            error={error}
          />
        )}

        {step === "idle" && file && (
          <Button onClick={handleAnalyze} className="w-full">
            Analyze Image
          </Button>
        )}

        {step === "error" && (
          <Button onClick={handleTryAgain} variant="outline" className="w-full">
            Try Again
          </Button>
        )}
      </main>
    </div>
  );
}
