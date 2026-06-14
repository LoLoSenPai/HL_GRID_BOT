export const AUTH_COOKIE_NAME = "hl_grid_session";
export const AUTH_MAX_AGE_SECONDS = 60 * 60 * 12;

interface AuthConfig {
  username: string;
  password: string;
  secret: string;
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
  return readAuthConfig()?.username;
}

export function safeNextPath(value: FormDataEntryValue | string | null | undefined): string {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) return "/dashboard";
  return next;
}

export async function validateCredentials(username: string, password: string): Promise<boolean> {
  const config = readAuthConfig();
  if (!config) return false;

  return constantTimeEqual(username, config.username) && constantTimeEqual(password, config.password);
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
  if (isAuthDisabled()) return true;

  const config = readAuthConfig();
  if (!config || !token) return false;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;

  const expectedSignature = await sign(encodedPayload, config.secret);
  if (!constantTimeEqual(signature, expectedSignature)) return false;

  try {
    const payload = JSON.parse(base64UrlToString(encodedPayload)) as Partial<SessionPayload>;
    return payload.username === config.username && typeof payload.expiresAt === "number" && payload.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function readAuthConfig(): AuthConfig | null {
  const username = process.env.APP_AUTH_USERNAME?.trim();
  const password = process.env.APP_AUTH_PASSWORD?.trim();
  const secret = process.env.APP_AUTH_SECRET?.trim();

  if (!username || !password || !secret || secret.length < 32) return null;
  return { username, password, secret };
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
