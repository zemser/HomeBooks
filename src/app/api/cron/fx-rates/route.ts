import { runFxWorker } from "@/features/currency/rate-worker";

export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }
  if (!process.env.FX_WORKER_DATABASE_URL)
    return Response.json({ enabled: false });
  return Response.json(await runFxWorker());
}
