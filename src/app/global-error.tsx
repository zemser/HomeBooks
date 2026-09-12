"use client";

import { useEffect } from "react";

import { AppErrorState } from "@/components/app-shell/app-error-state";
import { PRODUCT_NAME } from "@/lib/brand";

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
          title={`${PRODUCT_NAME} could not load.`}
        />
      </body>
    </html>
  );
}
