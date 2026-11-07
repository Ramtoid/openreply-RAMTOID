/**
 * Rate Limiter — Unit Tests
 *
 * Tests the hourly private-reply cap enforcement using mocked Redis.
 * Assertions derive from RATE_LIMIT_MAX so they survive a change to the cap.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGet, mockEval, mockDel, mockDecr } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockEval: vi.fn(),
  mockDel: vi.fn(),
  mockDecr: vi.fn(),
}));

vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(function (
    this: Record<string, unknown>
  ) {
    this.get = mockGet;
    this.eval = mockEval;
    this.del = mockDel;
    this.decr = mockDecr;
    return this;
  });
  return { default: MockRedis };
});

vi.stubEnv("REDIS_URL", "redis://localhost:6379");

import {
  checkRateLimit,
  incrementDMCounter,
  reserveDMSlot,
  releaseDMSlot,
  reservePublicReplySlot,
  RATE_LIMIT_MAX,
  PUBLIC_REPLY_RATE_LIMIT_MAX,
} from "../lib/utils/rate-limiter";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkRateLimit", () => {
  it("should allow when count is below limit", async () => {
    mockGet.mockResolvedValue("50");

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(50);
    expect(result.remainingDMs).toBe(RATE_LIMIT_MAX - 50);
    expect(result.shouldRequeue).toBe(false);
    expect(result.shouldSkip).toBe(false);
    expect(result.reserved).toBe(false);
  });

  it("should allow when no previous count exists", async () => {
    mockGet.mockResolvedValue(null);

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(0);
    expect(result.remainingDMs).toBe(RATE_LIMIT_MAX);
  });

  it("should deny when count reaches the limit", async () => {
    mockGet.mockResolvedValue(String(RATE_LIMIT_MAX));

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(true);
    expect(result.shouldSkip).toBe(false);
  });

  it("should skip after max requeue attempts", async () => {
    mockGet.mockResolvedValue(String(RATE_LIMIT_MAX));

    const result = await checkRateLimit("account_123", 3);

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(false);
    expect(result.shouldSkip).toBe(true);
  });
});

describe("reserveDMSlot", () => {
  it("should atomically reserve a slot when below the hourly cap", async () => {
    mockEval.mockResolvedValue([1, 51, 139]);

    const result = await reserveDMSlot("account_123");

    expect(mockEval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "rate:dm:account_123",
      RATE_LIMIT_MAX,
      3600
    );
    expect(result.allowed).toBe(true);
    expect(result.reserved).toBe(true);
    expect(result.currentCount).toBe(51);
    expect(result.remainingDMs).toBe(139);
  });

  it("should recommend requeue when the atomic reserve is denied", async () => {
    mockEval.mockResolvedValue([0, RATE_LIMIT_MAX, 0]);

    const result = await reserveDMSlot("account_123", 0);

    expect(result.allowed).toBe(false);
    expect(result.reserved).toBe(false);
    expect(result.shouldRequeue).toBe(true);
    expect(result.shouldSkip).toBe(false);
  });

  it("should skip after max requeue attempts", async () => {
    mockEval.mockResolvedValue(["0", String(RATE_LIMIT_MAX), "0"]);

    const result = await reserveDMSlot("account_123", 3);

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(false);
    expect(result.shouldSkip).toBe(true);
  });
});

describe("incrementDMCounter", () => {
  it("should use the atomic reservation path", async () => {
    mockEval.mockResolvedValue([1, 51, 139]);

    const count = await incrementDMCounter("account_123");

    expect(mockEval).toHaveBeenCalled();
    expect(count).toBe(51);
  });
});

describe("releaseDMSlot", () => {
  it("hands a reserved slot back and returns the new count", async () => {
    mockDecr.mockResolvedValue(49);

    const count = await releaseDMSlot("account_123");

    expect(mockDecr).toHaveBeenCalledWith("rate:dm:account_123");
    expect(count).toBe(49);
  });

  it("clamps to zero and clears the key when nothing was reserved", async () => {
    mockDecr.mockResolvedValue(-1);

    const count = await releaseDMSlot("account_123");

    expect(count).toBe(0);
    expect(mockDel).toHaveBeenCalledWith("rate:dm:account_123");
  });
});

describe("reservePublicReplySlot", () => {
  it("counts public replies separately from DMs", async () => {
    mockEval.mockResolvedValue([1, 1, PUBLIC_REPLY_RATE_LIMIT_MAX - 1]);

    await expect(reservePublicReplySlot("account_123")).resolves.toBe(true);

    expect(mockEval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "rate:public:account_123",
      PUBLIC_REPLY_RATE_LIMIT_MAX,
      3600
    );
  });

  it("refuses once the hourly cap is reached", async () => {
    mockEval.mockResolvedValue([0, PUBLIC_REPLY_RATE_LIMIT_MAX, 0]);

    await expect(reservePublicReplySlot("account_123")).resolves.toBe(false);
  });
});

describe("hourly limits", () => {
  async function loadWith(name: string, value: string) {
    vi.resetModules();
    vi.stubEnv(name, value);
    const limiter = await import("../lib/utils/rate-limiter");
    vi.unstubAllEnvs();
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    return limiter;
  }

  it("default to 200 per hour", () => {
    expect(RATE_LIMIT_MAX).toBe(200);
    expect(PUBLIC_REPLY_RATE_LIMIT_MAX).toBe(200);
  });

  it("can be set per kind from the environment", async () => {
    const dm = await loadWith("DM_RATE_LIMIT_PER_HOUR", "50");
    expect(dm.RATE_LIMIT_MAX).toBe(50);
    expect(dm.PUBLIC_REPLY_RATE_LIMIT_MAX).toBe(200);

    const pub = await loadWith("PUBLIC_REPLY_RATE_LIMIT_PER_HOUR", "30");
    expect(pub.RATE_LIMIT_MAX).toBe(200);
    expect(pub.PUBLIC_REPLY_RATE_LIMIT_MAX).toBe(30);
  });

  it("never exceed Meta's documented limit", async () => {
    const limiter = await loadWith("DM_RATE_LIMIT_PER_HOUR", "5000");
    expect(limiter.RATE_LIMIT_MAX).toBe(750);
  });

  it.each(["", "0", "-5", "abc", "1.5"])(
    "fall back to the default for the invalid value %j",
    async (value) => {
      const limiter = await loadWith("DM_RATE_LIMIT_PER_HOUR", value);
      expect(limiter.RATE_LIMIT_MAX).toBe(200);
    }
  );
});
