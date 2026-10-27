// Shared helpers for the agent routes and pages: the data dates, the saved weekly brief, the demo question limits.
import { randomUUID } from "node:crypto";
import { q } from "../db";
import { getBrand } from "../queries";
import { addDays, dayLabel, monday } from "../period";
import type { Brief, ReviewTask } from "./engine";

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

/** A saved Business Review report: weekly or monthly, for one week or month, with the account manager's notes. */
export type Report = { id: string; view: "week" | "month"; p: string; label: string; brief: Brief; notes: string; dataThrough: string; tools: number; model: string; createdAt: string };
export type ReportListItem = { id: string; view: "week" | "month"; label: string; createdAt: string };

export async function saveReport(brandId: string, brief: Brief, task: ReviewTask, dataThrough: string, tools: number, model: string): Promise<string> {
  const id = randomUUID();
  await q(
    `INSERT INTO analysis_cache (brand_id, module, scope, data_hash, result, model) VALUES ($1, 'business_review', $2, $3, $4::jsonb, $5)`,
    [brandId, `${task.view}:${task.p}`, id, JSON.stringify({ brief, notes: task.notes, view: task.view, p: task.p, label: task.label, dataThrough, tools }), model],
  );
  return id;
}

const toReport = (r: { data_hash: string; result: any; model: string; created_at: string }): Report => {
  const res = typeof r.result === "string" ? JSON.parse(r.result) : r.result;
  return {
    // reports from before the weekly/monthly choice have no label: name them by the week their data ends in
    id: r.data_hash, view: res.view === "month" ? "month" : "week", p: res.p ?? "",
    label: res.label ?? (res.dataThrough ? `Week of ${dayLabel(monday(res.dataThrough))}` : "Weekly review"),
    brief: res.brief, notes: res.notes ?? "", dataThrough: res.dataThrough, tools: res.tools ?? 0, model: r.model, createdAt: new Date(r.created_at).toISOString(),
  };
};

/** Saved reports, newest first (includes the earlier weekly briefs). */
export async function listReports(brandId: string): Promise<ReportListItem[]> {
  const r = await q<{ data_hash: string; result: any; model: string; created_at: string }>(
    "SELECT data_hash, result, model, created_at FROM analysis_cache WHERE brand_id = $1 AND module IN ('business_review', 'weekly_review') ORDER BY created_at DESC LIMIT 60", [brandId]);
  return r.map(toReport).map(({ id, view, label, createdAt }) => ({ id, view, label, createdAt }));
}

export async function getReport(brandId: string, id?: string): Promise<Report | null> {
  const r = id
    ? await q<{ data_hash: string; result: any; model: string; created_at: string }>(
      "SELECT data_hash, result, model, created_at FROM analysis_cache WHERE brand_id = $1 AND module IN ('business_review', 'weekly_review') AND data_hash = $2", [brandId, id])
    : await q<{ data_hash: string; result: any; model: string; created_at: string }>(
      "SELECT data_hash, result, model, created_at FROM analysis_cache WHERE brand_id = $1 AND module IN ('business_review', 'weekly_review') ORDER BY created_at DESC LIMIT 1", [brandId]);
  return r[0] ? toReport(r[0]) : null;
}

/** Replaces the account manager's notes on a saved report (the brief itself is unchanged). */
export async function updateNotes(brandId: string, id: string, notes: string): Promise<boolean> {
  const r = await q<{ id: string }>(
    `UPDATE analysis_cache SET result = jsonb_set(result, '{notes}', to_jsonb($3::text)) WHERE brand_id = $1 AND module IN ('business_review', 'weekly_review') AND data_hash = $2 RETURNING id`,
    [brandId, id, notes.slice(0, NOTES_MAX)]);
  return r.length > 0;
}

export const NOTES_MAX = 3000;

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
