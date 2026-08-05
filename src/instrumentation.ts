import type { Instrumentation } from "next";

import { getTelemetrySnapshot } from "@/lib/telemetry/server";

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const errorDetails =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
          digest:
            "digest" in error && typeof error.digest === "string"
              ? error.digest
              : undefined,
        }
      : {
          name: "NonError",
          message: String(error),
          stack: undefined,
          digest: undefined,
        };

  console.error(
    JSON.stringify({
      level: "error",
      message: "Unhandled Next.js request error",
      route: context.routePath,
      method: request.method,
      path: request.path,
      routerKind: context.routerKind,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
      telemetry: getTelemetrySnapshot(),
      error: errorDetails,
    }),
  );
};
