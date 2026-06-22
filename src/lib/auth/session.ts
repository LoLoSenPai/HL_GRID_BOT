export const AUTH_COOKIE_NAME = "hl_grid_session";
export const AUTH_MAX_AGE_SECONDS = 60 * 60 * 12;

interface AuthConfig {
  users: AuthUserConfig[];
  secret: string;
}

interface AuthUserConfig {
  username: string;
  password: string;
}

interface SessionPayload {
  username: string;
  expiresAt: number;
}

export function isAuthDisabled(): boolean {
  return process.env.APP_AUTH_DISABLED === "true";
}

export function isAuthConfigured(): boolean {
  return Boolean(readAuthConfig());
}

export function getAuthUsername(): string | undefined {
  return getAuthUsernames()[0];
}

export function getAuthUsernames(): string[] {
  return readAuthConfig()?.users.map((user) => user.username) ?? [];
}

export function getDefaultBotOwnerUser(): string {
  return getAuthUsername() ?? "local";
}

export function safeNextPath(value: FormDataEntryValue | string | null | undefined): string {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) return "/dashboard";
  return next;
}

export async function validateCredentials(username: string, password: string): Promise<boolean> {
  const config = readAuthConfig();
  if (!config) return false;

  return config.users.some(
    (user) => constantTimeEqual(username.trim(), user.username) && constantTimeEqual(password, user.password),
  );
}

export async function createSessionToken(username: string): Promise<string> {
  const config = readAuthConfig();
  if (!config) throw new Error("App authentication is not configured.");

  const payload: SessionPayload = {
    username,
    expiresAt: Date.now() + AUTH_MAX_AGE_SECONDS * 1000,
  };
  const encodedPayload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await sign(encodedPayload, config.secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(token?: string): Promise<boolean> {
  return Boolean(await readSessionToken(token));
}

export async function readSessionToken(token?: string): Promise<SessionPayload | null> {
  if (isAuthDisabled()) {
    return { username: getDefaultBotOwnerUser(), expiresAt: Number.MAX_SAFE_INTEGER };
  }

  const config = readAuthConfig();
  if (!config || !token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = await sign(encodedPayload, config.secret);
  if (!constantTimeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlToString(encodedPayload)) as Partial<SessionPayload>;
    if (typeof payload.username !== "string" || typeof payload.expiresAt !== "number") return null;
    if (payload.expiresAt <= Date.now()) return null;
    if (!config.users.some((user) => user.username === payload.username)) return null;
    return { username: payload.username, expiresAt: payload.expiresAt };
  } catch {
    return null;
  }
}

function readAuthConfig(): AuthConfig | null {
  const secret = process.env.APP_AUTH_SECRET?.trim();
  const users = parseAuthUsers();

  if (!users.length || !secret || secret.length < 32) return null;
  return { users, secret };
}

function parseAuthUsers(): AuthUserConfig[] {
  const multiUserConfig = process.env.APP_AUTH_USERS?.trim();
  if (multiUserConfig) {
    return multiUserConfig
      .split(/[\n,;]/u)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(parseAuthUserEntry)
      .filter((user): user is AuthUserConfig => Boolean(user));
  }

  const username = process.env.APP_AUTH_USERNAME?.trim();
  const password = process.env.APP_AUTH_PASSWORD?.trim();
  if (!username || !password) return [];
  return [{ username, password }];
}

function parseAuthUserEntry(entry: string): AuthUserConfig | null {
  const separatorIndex = entry.search(/[:=]/u);
  if (separatorIndex <= 0) return null;

  const username = entry.slice(0, separatorIndex).trim();
  const password = entry.slice(separatorIndex + 1).trim();
  if (!username || !password) return null;
  return { username, password };
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToString(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}
