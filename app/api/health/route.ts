import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getDMQueue, getRedisConnection } from "@/lib/queue/client";
import { getWorkerHealth } from "@/lib/ops/worker-health";
import { getCurrentUserId } from "@/lib/auth";

export const runtime = "nodejs";
// Health must reflect live state (worker heartbeat, queue depth), never a
// cached response, or it reports stale worker start times.
export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "error";

interface HealthCheck {
  status: CheckStatus;
  detail?: string;
}

// Driver errors can carry hostnames and connection strings, so they go to the
// server log and never into a response.
function logCheckFailure(check: string, error: unknown) {
  console.error(`[Health] ${check} check failed:`, error);
}

async function checkDatabase(): Promise<HealthCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  } catch (error) {
    logCheckFailure("Database", error);
    return { status: "error" };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  try {
    const pong = await getRedisConnection().ping();
    return { status: pong === "PONG" ? "ok" : "error" };
  } catch (error) {
    logCheckFailure("Redis", error);
    return { status: "error" };
  }
}

// A fresh heartbeat does not mean the worker is still doing anything. The
// heartbeat runs on its own interval, so BullMQ's consumer can stop taking jobs
// — a dropped queue connection, a crashed consumer loop — while the process,
// and its heartbeat, stay perfectly alive. Health then keeps answering 200
// while the backlog grows and nobody is served. Seen in production: 385 jobs
// waiting for hours behind an uptime monitor that never once alerted.
//
// A backlog with nothing in flight is the signal, and it is unambiguous: a
// healthy worker with a concurrency of 5 never leaves jobs waiting with zero
// active. The threshold only exists to ride out the moment between a job being
// enqueued and the worker picking it up.
const STUCK_QUEUE_MIN_WAITING = Number(
  process.env.HEALTH_STUCK_QUEUE_WAITING ?? 25
);

async function checkQueue(): Promise<HealthCheck & { counts?: unknown }> {
  try {
    const counts = await getDMQueue().getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed"
    );
    const waiting = counts.waiting ?? 0;
    const active = counts.active ?? 0;
    if (waiting >= STUCK_QUEUE_MIN_WAITING && active === 0) {
      return {
        status: "error",
        detail: `${waiting} jobs waiting with none active — the worker is not consuming`,
        counts,
      };
    }
    return { status: "ok", counts };
  } catch (error) {
    logCheckFailure("Queue", error);
    return { status: "error" };
  }
}

async function hasSession(): Promise<boolean> {
  try {
    return Boolean(await getCurrentUserId());
  } catch {
    // Sessions live in the database, which may be the very thing that is down.
    return false;
  }
}

export async function GET() {
  const [database, redis, queue, worker] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkQueue(),
    getWorkerHealth().catch((error) => {
      logCheckFailure("Worker", error);
      return { healthy: false, heartbeat: null, ageMs: null };
    }),
  ]);

  const healthy =
    database.status === "ok" &&
    redis.status === "ok" &&
    queue.status === "ok" &&
    worker.healthy;

  const status = healthy ? "ok" : "degraded";
  const httpStatus = healthy ? 200 : 503;

  // The overall status already covers all four checks, which is what an uptime
  // monitor needs. The breakdown is for someone signed in.
  if (!(await hasSession())) {
    return NextResponse.json({ status }, { status: httpStatus });
  }

  return NextResponse.json(
    {
      status,
      checks: {
        database,
        redis,
        queue,
        // Not the raw heartbeat, which carries the worker's hostname and pid.
        worker: {
          healthy: worker.healthy,
          ageMs: worker.ageMs,
          startedAt: worker.heartbeat?.startedAt ?? null,
        },
      },
    },
    { status: httpStatus }
  );
}
