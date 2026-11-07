/**
 * /api/health exposes only the overall status without a session, and never
 * exposes driver errors or where the worker runs.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw, ping, getJobCounts, getWorkerHealth, getCurrentUserId } =
  vi.hoisted(() => ({
    queryRaw: vi.fn(),
    ping: vi.fn(),
    getJobCounts: vi.fn(),
    getWorkerHealth: vi.fn(),
    getCurrentUserId: vi.fn(),
  }));

vi.mock("@/lib/db/client", () => ({ prisma: { $queryRaw: queryRaw } }));
vi.mock("@/lib/queue/client", () => ({
  getDMQueue: () => ({ getJobCounts }),
  getRedisConnection: () => ({ ping }),
}));
vi.mock("@/lib/ops/worker-health", () => ({ getWorkerHealth }));
vi.mock("@/lib/auth", () => ({ getCurrentUserId }));

import { GET } from "../app/api/health/route";

const SECRET_ERROR = "connect ECONNREFUSED postgres.internal:5432 password=hunter2";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  queryRaw.mockReset().mockResolvedValue([{ "?column?": 1 }]);
  ping.mockReset().mockResolvedValue("PONG");
  getJobCounts.mockReset().mockResolvedValue({ waiting: 0, active: 0 });
  getCurrentUserId.mockReset().mockResolvedValue(null);
  getWorkerHealth.mockReset().mockResolvedValue({
    healthy: true,
    ageMs: 1000,
    heartbeat: {
      status: "running",
      worker: "dm",
      pid: 4242,
      hostname: "worker-host",
      startedAt: "2026-11-01T00:00:00.000Z",
      checkedAt: "2026-11-01T00:01:00.000Z",
    },
  });
});

describe("GET /api/health", () => {
  it("answers only the overall status without a session", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("still reports a failure without a session, without saying why", async () => {
    queryRaw.mockRejectedValue(new Error(SECRET_ERROR));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "degraded" });
  });

  it("counts an unhealthy worker as degraded without a session", async () => {
    getWorkerHealth.mockResolvedValue({ healthy: false, heartbeat: null, ageMs: null });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "degraded" });
  });

  it("shows the checks to a signed-in user, without hostname or pid", async () => {
    getCurrentUserId.mockResolvedValue("user");
    const response = await GET();
    const body = await response.json();
    expect(body.checks.worker).toEqual({
      healthy: true,
      ageMs: 1000,
      startedAt: "2026-11-01T00:00:00.000Z",
    });
    expect(JSON.stringify(body)).not.toMatch(/worker-host|4242/);
  });

  it("never returns driver errors, even to a signed-in user", async () => {
    getCurrentUserId.mockResolvedValue("user");
    queryRaw.mockRejectedValue(new Error(SECRET_ERROR));
    ping.mockRejectedValue(new Error(SECRET_ERROR));
    getJobCounts.mockRejectedValue(new Error(SECRET_ERROR));
    getWorkerHealth.mockRejectedValue(new Error(SECRET_ERROR));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks.database.status).toBe("error");
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|hunter2/);
  });

  it("treats a failing session lookup as no session", async () => {
    getCurrentUserId.mockRejectedValue(new Error(SECRET_ERROR));
    const response = await GET();
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
