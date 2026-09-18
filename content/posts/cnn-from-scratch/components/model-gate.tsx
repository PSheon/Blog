"use client";

import { type ReactNode, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useLabels } from "./labels";
import { loadModel, useLab } from "./store";

/** Starts the weight download on mount and covers the loading and failure states. */
export function ModelGate({ children }: { children: ReactNode }) {
  const { status } = useLab();
  const t = useLabels();

  useEffect(() => {
    void loadModel();
  }, []);

  if (status === "error") {
    return (
      <div className="grid place-items-center gap-3 py-10 text-sm text-muted-foreground" role="alert">
        {t.error}
        <Button size="sm" variant="outline" onClick={() => void loadModel()}>
          {t.retry}
        </Button>
      </div>
    );
  }
  return (
    <div aria-busy={status !== "ready"} data-model={status}>
      {children}
    </div>
  );
}
