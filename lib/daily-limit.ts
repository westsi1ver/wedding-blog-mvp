import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { ApiUsage } from "./types";

type Provider = "naver" | "gemini" | "openai";
type UsageFile = { date: string; counts: Record<Provider, number> };

const FILE = path.join(os.tmpdir(), "wedding-blog-mvp-api-usage.json");
let lock: Promise<void> = Promise.resolve();

function koreaDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((x) => x.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function limitFor(provider: Provider) {
  const key = `DAILY_${provider.toUpperCase()}_API_LIMIT`;
  const raw = Number(process.env[key] || "50");
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 50;
}

async function readUsage(): Promise<UsageFile> {
  const today = koreaDate();
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, "utf8")) as UsageFile;
    if (parsed.date === today && parsed.counts) return parsed;
  } catch {
    // first run / unreadable temp file
  }
  return { date: today, counts: { naver: 0, gemini: 0, openai: 0 } };
}

async function writeUsage(data: UsageFile) {
  await fs.writeFile(FILE, JSON.stringify(data), "utf8");
}

export async function consumeApiCall(provider: Provider, amount = 1) {
  let result!: { used: number; limit: number; remaining: number };
  let rejection: Error | null = null;

  lock = lock.then(async () => {
    const data = await readUsage();
    const limit = limitFor(provider);
    const used = data.counts[provider] || 0;

    if (used + amount > limit) {
      rejection = new Error(`DAILY_${provider.toUpperCase()}_API_LIMIT_REACHED`);
      result = { used, limit, remaining: Math.max(0, limit - used) };
      return;
    }

    data.counts[provider] = used + amount;
    await writeUsage(data);
    result = {
      used: data.counts[provider],
      limit,
      remaining: Math.max(0, limit - data.counts[provider]),
    };
  });

  await lock;
  if (rejection) throw rejection;
  return result;
}

export async function getApiUsage(): Promise<ApiUsage> {
  const data = await readUsage();
  const make = (provider: Provider) => {
    const limit = limitFor(provider);
    const used = data.counts[provider] || 0;
    return { used, limit, remaining: Math.max(0, limit - used) };
  };
  return { date: data.date, naver: make("naver"), gemini: make("gemini"), openai: make("openai") };
}
