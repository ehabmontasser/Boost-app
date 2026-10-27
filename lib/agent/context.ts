// Shared helpers for the agent routes and pages: the data dates, the saved weekly brief, the demo question limits.
import { randomUUID } from "node:crypto";
import { q } from "../db";
import { getBrand } from "../queries";
import { addDays, monday } from "../period";
import type { Brief } from "./engine";

/** Last day of data and the Monday of the latest full week. */
export async function agentDates(): Promise<{ brandId: string; dataThrough: string; latestWeek: string } | null> {
  const b = await getBrand();
  if (!b) return null;
  const r = await q<{ d: string | null }>("SELECT MAX(date) AS d FROM sales_daily WHERE brand_id = $1", [b.id]);
  const through = r[0]?.d;
  if (!through) return null;
  const sundayDone = new Date(through + "T00:00:00Z").getUTCDay() === 0;
  return { brandId: b.id, dataThrough: through, latestWeek: sundayDone ? monday(through) : addDays(monday(through), -7) };
}

export type SavedBrief = { brief: Brief; dataThrough: string; tools: number; model: string; createdAt: string };

export async function saveBrief(brandId: string, brief: Brief, dataThrough: string, tools: number, model: string) {
  await q(
    `INSERT INTO analysis_cache (brand_id, module, scope, data_hash, result, model) VALUES ($1, 'weekly_review', 'brief', $2, $3::jsonb, $4)`,
    [brandId, randomUUID(), JSON.stringify({ brief, dataThrough, tools }), model],
  );
}

export async function latestBrief(brandId: string): Promise<SavedBrief | null> {
  const r = await q<{ result: any; model: string; created_at: string }>(
    "SELECT result, model, created_at FROM analysis_cache WHERE brand_id = $1 AND module = 'weekly_review' ORDER BY created_at DESC LIMIT 1", [brandId]);
  if (!r[0]) return null;
  const res = typeof r[0].result === "string" ? JSON.parse(r[0].result) : r[0].result;
  return { brief: res.brief, dataThrough: res.dataThrough, tools: res.tools ?? 0, model: r[0].model, createdAt: new Date(r[0].created_at).toISOString() };
}

/** Demo visitors: 5 questions per session (counted in a signed cookie by the route) and 50 per day in total. */
export const DEMO_PER_SESSION = 5;
export const DEMO_PER_DAY = 50;

export async function demoQuestionsToday(brandId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const r = await q<{ n: number }>("SELECT COUNT(*) AS n FROM analysis_cache WHERE brand_id = $1 AND module = 'ask_log' AND scope = $2", [brandId, today]);
  return Number(r[0]?.n ?? 0);
}

export async function logQuestion(brandId: string, role: string, question: string) {
  const today = new Date().toISOString().slice(0, 10);
  await q(`INSERT INTO analysis_cache (brand_id, module, scope, data_hash, result, model) VALUES ($1, 'ask_log', $2, $3, $4::jsonb, NULL)`,
    [brandId, today, randomUUID(), JSON.stringify({ role, question: question.slice(0, 300) })]);
}
