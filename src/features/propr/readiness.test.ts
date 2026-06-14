import { afterEach, describe, expect, it } from "vitest";

import { checkProprLiveReadiness } from "@/features/propr/readiness";

const managedKeys = [
  "PROPR_API_KEY",
] as const;
const originalEnv = Object.fromEntries(managedKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of managedKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Propr live readiness", () => {
  it("blocks execution when the Propr API key is missing", async () => {
    delete process.env.PROPR_API_KEY;

    const readiness = await checkProprLiveReadiness();

    expect(readiness.liveEnabled).toBe(false);
    expect(readiness.blockers).toContain("PROPR_API_KEY is missing.");
  });
});
