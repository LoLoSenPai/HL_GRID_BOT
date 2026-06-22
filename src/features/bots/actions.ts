"use server";

import { revalidatePath } from "next/cache";

import {
  closeBot,
  createBot,
  createLiveCandidateFromBot,
  deleteBot,
  duplicateBot,
  reconcileProprBot,
  simulateNextPaperFill,
  startBot,
  stopBot,
  updateBotStatus,
} from "@/features/bots/repository";
import { defaultBotConfig } from "@/features/bots/sample-data";
import { runPaperReconciliation } from "@/server/workers/paper-reconciliation-worker";
import type { BotStatus } from "@/domain/types";
import { requireCurrentUser } from "@/lib/auth/current-user";

const paths = ["/dashboard", "/bots", "/grid-terminal", "/activity", "/lab"];

function revalidateApp() {
  for (const path of paths) revalidatePath(path);
}

export async function startBotAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("id") ?? "");
  await startBot(id, user);
  revalidateApp();
}

export async function createBotAction() {
  const user = await requireCurrentUser();
  createBot("New Challenge Grid", { ...defaultBotConfig, mode: "propr_live" }, user);
  revalidateApp();
}

export async function pauseBotAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("id") ?? "");
  updateBotStatus(id, "paused", user);
  revalidateApp();
}

export async function resumeBotAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("id") ?? "");
  await startBot(id, user);
  revalidateApp();
}

export async function stopBotAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("id") ?? "");
  await stopBot(id, user);
  revalidateApp();
}

export async function closeBotAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("id") ?? "");
  await closeBot(id, "Manual close from server action", user);
  revalidateApp();
}

export async function deleteBotAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("id") ?? "");
  deleteBot(id, user);
  revalidateApp();
}

export async function duplicateBotAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("id") ?? "");
  duplicateBot(id, user);
  revalidateApp();
}

export async function createLiveCandidateAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("id") ?? "");
  createLiveCandidateFromBot(id, user);
  revalidateApp();
}

export async function setBotStatusAction(id: string, status: BotStatus) {
  const user = await requireCurrentUser();
  updateBotStatus(id, status, user);
  revalidateApp();
}

export async function simulateFillAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("id") ?? "");
  simulateNextPaperFill(id, user);
  revalidateApp();
}

export async function reconcilePaperRuntimeAction(formData: FormData) {
  const user = await requireCurrentUser();
  const rawId = String(formData.get("id") ?? "");
  await runPaperReconciliation({ botId: rawId.length > 0 ? rawId : undefined, ownerUser: user });
  revalidateApp();
}

export async function reconcileProprRuntimeAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("id") ?? "");
  await reconcileProprBot(id, user);
  revalidateApp();
}
