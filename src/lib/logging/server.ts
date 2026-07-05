import { NextResponse } from "next/server";

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
    };
  }

  return {
    name: "NonError",
    message: String(error),
    stack: undefined,
    digest: undefined,
  };
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
      error: errorDetails,
      ...context,
    }),
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
  if (status >= 500) {
    logRouteError({ error, message, request, route, status, context });
  }

  return NextResponse.json({ error: clientMessage }, { status });
}
