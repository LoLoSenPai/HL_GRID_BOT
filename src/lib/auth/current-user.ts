import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_COOKIE_NAME, getDefaultBotOwnerUser, isAuthDisabled, readSessionToken } from "@/lib/auth/session";

export async function getCurrentUser(): Promise<string | null> {
  if (isAuthDisabled()) return getDefaultBotOwnerUser();

  const cookieStore = await cookies();
  const session = await readSessionToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  return session?.username ?? null;
}

export async function requireCurrentUser(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

