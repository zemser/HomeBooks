import { NextResponse } from "next/server";

import { getTelemetrySnapshot } from "@/lib/telemetry/server";

type LogValue = boolean | number | string | null | undefined;

type LogRouteErrorInput = {
  error: unknown;
  message: string;
  request?: Request;
  route: string;
  status?: number;
  context?: Record<string, LogValue>;
};

type ErrorResponseInput = LogRouteErrorInput & {
  clientMessage: string;
};

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      digest:
        "digest" in error && typeof error.digest === "string"
          ? error.digest
          : undefined,
      cause: getErrorCauseDetails(error.cause),
    };
  }

  return {
    name: "NonError",
    message: String(error),
    stack: undefined,
    digest: undefined,
  };
}

function getErrorCauseDetails(cause: unknown): Record<string, unknown> | undefined {
  if (!cause) {
    return undefined;
  }

  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
      stack: cause.stack,
      ...getDatabaseErrorFields(cause),
      cause: getErrorCauseDetails(cause.cause),
    };
  }

  if (typeof cause === "object") {
    return getDatabaseErrorFields(cause);
  }

  return {
    message: String(cause),
  };
}

function getDatabaseErrorFields(error: object) {
  const details: Record<string, unknown> = {};

  for (const field of [
    "code",
    "detail",
    "hint",
    "schema",
    "table",
    "column",
    "constraint",
    "routine",
  ]) {
    if (field in error) {
      details[field] = error[field as keyof typeof error];
    }
  }

  return details;
}

export function logRouteError({
  error,
  message,
  request,
  route,
  status = 500,
  context,
}: LogRouteErrorInput) {
  const errorDetails = getErrorDetails(error);

  console.error(
    JSON.stringify({
      level: "error",
      message,
      route,
      method: request?.method,
      status,
      requestId:
        request?.headers.get("x-vercel-id") ??
        request?.headers.get("x-request-id") ??
        undefined,
      telemetry: getTelemetrySnapshot(),
      error: errorDetails,
      ...context,
    }),
  );
}

function isNextControlFlowError(error: unknown) {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return false;
  }

  const digest = error.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT;") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;"))
  );
}

export function errorResponse({
  clientMessage,
  error,
  message,
  request,
  route,
  status = 500,
  context,
}: ErrorResponseInput) {
  // redirect() / notFound() throw control-flow errors. Catching them in a
  // route handler and returning JSON turns sign-in into a 500 page.
  if (isNextControlFlowError(error)) {
    throw error;
  }

  if (status >= 500) {
    logRouteError({ error, message, request, route, status, context });
  }

  return NextResponse.json({ error: clientMessage }, { status });
}
