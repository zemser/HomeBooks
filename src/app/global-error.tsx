"use client";

import { useEffect } from "react";

import { AppErrorState } from "@/components/app-shell/app-error-state";

import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <AppErrorState
          digest={error.digest}
          onReset={reset}
          showSettingsLink={false}
          title="Fin App could not load."
        />
      </body>
    </html>
  );
}
