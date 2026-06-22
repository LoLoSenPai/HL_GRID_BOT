import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSessionToken, getAuthUsernames, safeNextPath, validateCredentials, verifySessionToken } from "@/lib/auth/session";

const managedKeys = ["APP_AUTH_USERNAME", "APP_AUTH_PASSWORD", "APP_AUTH_USERS", "APP_AUTH_SECRET", "APP_AUTH_DISABLED"] as const;
const originalEnv = Object.fromEntries(managedKeys.map((key) => [key, process.env[key]]));

beforeEach(() => {
  process.env.APP_AUTH_USERNAME = "loic";
  process.env.APP_AUTH_PASSWORD = "correct-password";
  delete process.env.APP_AUTH_USERS;
  process.env.APP_AUTH_SECRET = "0123456789abcdefghijklmnopqrstuvwxyz0123456789";
  delete process.env.APP_AUTH_DISABLED;
});

afterEach(() => {
  for (const key of managedKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("app auth session", () => {
  it("creates and verifies signed session tokens", async () => {
    const token = await createSessionToken("loic");

    await expect(verifySessionToken(token)).resolves.toBe(true);
    await expect(verifySessionToken(`${token}x`)).resolves.toBe(false);
  });

  it("validates configured credentials", async () => {
    await expect(validateCredentials("loic", "correct-password")).resolves.toBe(true);
    await expect(validateCredentials("loic", "wrong-password")).resolves.toBe(false);
  });

  it("supports multiple configured app users", async () => {
    process.env.APP_AUTH_USERS = "loic:correct-password,marty4k:trader-password";

    expect(getAuthUsernames()).toEqual(["loic", "marty4k"]);
    await expect(validateCredentials("marty4k", "trader-password")).resolves.toBe(true);
    await expect(verifySessionToken(await createSessionToken("marty4k"))).resolves.toBe(true);
  });

  it("keeps next redirects local to the app", () => {
    expect(safeNextPath("/grid-terminal?tab=orders")).toBe("/grid-terminal?tab=orders");
    expect(safeNextPath("https://example.com")).toBe("/dashboard");
    expect(safeNextPath("//example.com")).toBe("/dashboard");
    expect(safeNextPath("/login")).toBe("/dashboard");
  });
});
