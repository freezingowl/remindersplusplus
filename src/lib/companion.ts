import { NativeEventEmitter, NativeModules, Platform } from "react-native";

import type { Reminder, ReminderSource } from "../types";

export type CompanionStatus = { enabled: boolean; allowed: boolean; active: boolean; pushStatus?: string };

type CompanionModule = {
  getReminders(): Promise<string | null>;
  seedReminders(json: string): Promise<string>;
  configureCloud(url: string, token: string): Promise<void>;
  getCloudConfiguration(): Promise<{ url: string; token: string } | null>;
  getStatus(): Promise<CompanionStatus>;
  setEnabled(enabled: boolean): Promise<CompanionStatus>;
  capture(text: string, source: ReminderSource): Promise<string>;
  toggle(id: string, completed: boolean): Promise<string>;
  remove(id: string): Promise<string>;
  refresh(): Promise<void>;
  addListener(event: string): void;
  removeListeners(count: number): void;
};

const native: CompanionModule | undefined = Platform.OS === "ios" ? NativeModules.CueCompanion : undefined;
export const hasCompanion = Boolean(native);

function module(): CompanionModule {
  if (!native) throw new Error("The Lock Screen companion needs a rebuilt Cue iPhone app.");
  return native;
}

function remindersFromJSON(json: string): Reminder[] {
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value)) throw new Error("Cue’s reminder store could not be read.");
  return value as Reminder[];
}

export async function nativeReminders(): Promise<Reminder[] | null> {
  const json = await module().getReminders();
  return json === null ? null : remindersFromJSON(json);
}

export async function seedNativeReminders(reminders: Reminder[]): Promise<Reminder[]> {
  return remindersFromJSON(await module().seedReminders(JSON.stringify(reminders)));
}

export async function configureCompanionCloud(url: string, token: string): Promise<void> {
  if (native) await native.configureCloud(url, token);
}

export async function nativeCloudConfiguration(): Promise<{ url: string; token: string } | null> {
  if (!native) return null;
  if (typeof native.getCloudConfiguration !== "function") throw new Error("This installed Cue app is older than its JavaScript. Rebuild and install Cue, then try again.");
  return native.getCloudConfiguration();
}

export async function companionStatus(): Promise<CompanionStatus> {
  return module().getStatus();
}

export async function setCompanionEnabled(enabled: boolean): Promise<CompanionStatus> {
  return module().setEnabled(enabled);
}

export async function captureWithCompanion(text: string, source: ReminderSource): Promise<Reminder[]> {
  return remindersFromJSON(await module().capture(text, source));
}

export async function toggleWithCompanion(id: string, completed: boolean): Promise<Reminder[]> {
  return remindersFromJSON(await module().toggle(id, completed));
}

export async function removeWithCompanion(id: string): Promise<Reminder[]> {
  return remindersFromJSON(await module().remove(id));
}

export async function refreshCompanion(): Promise<void> {
  if (native) await native.refresh();
}

export function observeCompanion(callback: () => void): () => void {
  if (!native) return () => {};
  const subscription = new NativeEventEmitter(native).addListener("cueRemindersChanged", callback);
  return () => subscription.remove();
}
