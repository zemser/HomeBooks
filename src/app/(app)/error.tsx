"use client";

import { useEffect } from "react";

import { AppErrorState } from "@/components/app-shell/app-error-state";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <AppErrorState digest={error.digest} onReset={reset} />;
}
