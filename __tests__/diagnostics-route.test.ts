/**
 * /api/admin/diagnostics is for workspace owners and admins only.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getContext, mockPrisma, getJobCounts } = vi.hoisted(() => ({
  getContext: vi.fn(),
  getJobCounts: vi.fn(),
  mockPrisma: {
    webhookEvent: { findMany: vi.fn() },
    dmLog: { findMany: vi.fn() },
    operationalEvent: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/workspace-access", () => ({
  getCurrentWorkspaceContext: getContext,
  canManageWorkspace: (role: string) => role === "OWNER" || role === "ADMIN",
}));
vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/queue/client", () => ({ getDMQueue: () => ({ getJobCounts }) }));
vi.mock("@/lib/ops/worker-health", () => ({
  getWorkerHealth: async () => ({ healthy: true, heartbeat: null, ageMs: 0 }),
  getWorkerAlerts: async () => [],
}));

import { GET } from "../app/api/admin/diagnostics/route";

beforeEach(() => {
  getContext.mockReset();
  getJobCounts.mockReset().mockResolvedValue({});
  mockPrisma.webhookEvent.findMany.mockReset().mockResolvedValue([]);
  mockPrisma.dmLog.findMany.mockReset().mockResolvedValue([]);
  mockPrisma.operationalEvent.findMany.mockReset().mockResolvedValue([]);
});

describe("GET /api/admin/diagnostics", () => {
  it("rejects a request without a session", async () => {
    getContext.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("rejects a plain member and reads nothing", async () => {
    getContext.mockResolvedValue({ workspaceId: "w", role: "MEMBER" });
    expect((await GET()).status).toBe(403);
    expect(getJobCounts).not.toHaveBeenCalled();
    expect(mockPrisma.dmLog.findMany).not.toHaveBeenCalled();
  });

  it.each(["OWNER", "ADMIN"])("allows a workspace %s", async (role) => {
    getContext.mockResolvedValue({ workspaceId: "w", role });
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
    expect(mockPrisma.dmLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "w" }),
      })
    );
  });
});
