"use server";

import { revalidatePath } from "next/cache";

import {
  createBot,
  createLiveCandidateFromBot,
  deleteBot,
  duplicateBot,
  simulateNextPaperFill,
  startPaperBot,
  stopBot,
  updateBotStatus,
} from "@/features/bots/repository";
import { defaultBotConfig } from "@/features/bots/sample-data";
import { runPaperReconciliation } from "@/server/workers/paper-reconciliation-worker";
import type { BotStatus } from "@/domain/types";

const paths = ["/dashboard", "/bots", "/grid-terminal", "/activity", "/lab"];

function revalidateApp() {
  for (const path of paths) revalidatePath(path);
}

export async function startBotAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await startPaperBot(id);
  revalidateApp();
}

export async function createBotAction() {
  createBot("New Paper Grid", defaultBotConfig);
  revalidateApp();
}

export async function pauseBotAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  updateBotStatus(id, "paused");
  revalidateApp();
}

export async function resumeBotAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await startPaperBot(id);
  revalidateApp();
}

export async function stopBotAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  stopBot(id);
  revalidateApp();
}

export async function deleteBotAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  deleteBot(id);
  revalidateApp();
}

export async function duplicateBotAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  duplicateBot(id);
  revalidateApp();
}

export async function createLiveCandidateAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  createLiveCandidateFromBot(id);
  revalidateApp();
}

export async function setBotStatusAction(id: string, status: BotStatus) {
  updateBotStatus(id, status);
  revalidateApp();
}

export async function simulateFillAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  simulateNextPaperFill(id);
  revalidateApp();
}

export async function reconcilePaperRuntimeAction(formData: FormData) {
  const rawId = String(formData.get("id") ?? "");
  await runPaperReconciliation({ botId: rawId.length > 0 ? rawId : undefined });
  revalidateApp();
}
