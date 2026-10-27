// The BOOST agent loop: Claude decides which tools to call, the server runs them and sends the results back,
// until Claude finishes. Each HTTP request runs as many turns as fit in a time budget (Vercel stops a request at
// 60 seconds); the browser then calls again with the saved state. The state is signed so it cannot be edited.
import { createHmac, timingSafeEqual } from "node:crypto";
import { DATA_TOOLS, runTool } from "./tools";

export type Step = { tool: string; summary: string };
export type AgentState = { kind: "review" | "ask"; messages: any[]; turns: number; done: boolean };
export type StepResult = { state: AgentState; sig: string; steps: Step[]; final: { brief?: Brief; text?: string } | null; error?: string };
export type Brief = {
  headline: string; period: string;
  summary: string[];
  conflicts: { title: string; evidence: string; action: string; impact: string }[];
  actions: { title: string; why: string; do: string; impact: string }[];
  watch: string[];
};

const MAX_TURNS = 10;
const BUDGET_MS = 22_000;         // start another Claude call only while under this
const CALL_TIMEOUT_MS = 34_000;   // one Claude call; leaves room for tools inside 60 seconds

const SUBMIT_BRIEF = {
  name: "submit_brief",
  description: "Submit the finished Monday Commercial Review. Call it once, at the end, after you have checked the data.",
  strict: true,
  input_schema: {
    type: "object", additionalProperties: false,
    required: ["headline", "period", "summary", "conflicts", "actions", "watch"],
    properties: {
      headline: { type: "string", description: "One sentence: the single most important finding this week, with figures." },
      period: { type: "string", description: "The week reviewed and what it is compared with." },
      summary: { type: "array", items: { type: "string" }, description: "3 to 4 short facts on how the week went, with figures and the change vs last week and last year." },
      conflicts: { type: "array", description: "Places where two screens contradict each other (e.g. ad spend or a promotion on a product that is about to run out). Can be empty.",
        items: { type: "object", additionalProperties: false, required: ["title", "evidence", "action", "impact"],
          properties: { title: { type: "string" }, evidence: { type: "string" }, action: { type: "string" }, impact: { type: "string" } } } },
      actions: { type: "array", description: "3 to 5 actions ranked by money impact.",
        items: { type: "object", additionalProperties: false, required: ["title", "why", "do", "impact"],
          properties: { title: { type: "string" }, why: { type: "string" }, do: { type: "string" }, impact: { type: "string" } } } },
      watch: { type: "array", items: { type: "string" }, description: "Up to 3 risks or data gaps to watch." },
    },
  },
};

const RULES = `Rules:
- Use only figures returned by the tools. Never invent or estimate numbers that the tools do not give; say so when the data cannot answer.
- Money is EGP excluding VAT. Shares are fractions in the data (0.188 = 18.8%); write them as percentages.
- Talabat Mart, Noon, Amazon Core, Amazon Now and Breadfast are platforms (never "channels"). Amazon Core and Amazon Now are two separate platforms.
- Call several tools in the same turn when you need several screens; they run in parallel.
- Write plainly for a commercial team: short sentences, no jargon, no emojis, no em dashes.`;

function systemPrompt(kind: AgentState["kind"], dataThrough: string, latestWeek: string): string {
  const ctx = `You work inside BOOST, an analytics tool for the brand Sprout Baby Care (baby wipes and skin care) on Egyptian e-commerce and quick-commerce platforms. All data is synthetic demo data. Data runs to ${dataThrough}; the latest full week starts on ${latestWeek} (Monday). Weekly market and service data is keyed by the Monday of each week.`;
  if (kind === "review") return `${ctx}

You are the Monday Commercial Review agent for the account manager. Review the latest week and produce a brief.
Method:
1. In one turn, pull the latest week vs the previous week from get_overview, get_replenishment, get_ads, get_promotions, get_market and get_product_view (view "week", p "${latestWeek}").
2. Then pull get_overview and get_product_view for the same week vs the same week last year (cmp "yoy").
3. Look for conflicts between screens, which single screens cannot show: ad spend or promotions on products that are at risk of running out or already short; promotions or open POs on overstocked products; share losses on platforms where Sprout products are short of stock; low PO confirmation behind stockouts. Use get_product_view rows for this.
4. If something needs a longer view to judge (for example a trend), you may check the month or quarter.
5. Finish by calling submit_brief once. Rank actions by money impact, cite the figures, name the platform and product.
${RULES}`;
  return `${ctx}

You are "Ask BOOST", an assistant that answers the account manager's questions about this data. For each question, decide which tools and which period you need. If the question gives no period, use the latest week compared with the previous week, and say so. For "vs last year" questions use cmp "yoy". Answer in a few short paragraphs or bullet lines (lines starting with "- "), leading with the direct answer and the key figures, then why. Name the period you used. If the data cannot answer the question, say what is missing.
${RULES}`;
}

const secret = () => process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16 ? process.env.SESSION_SECRET : "dev-only-secret-change-me";
export const signState = (s: AgentState) => createHmac("sha256", secret()).update(JSON.stringify(s)).digest("base64url");
export function verifyState(s: AgentState, sig: string): boolean {
  const a = Buffer.from(signState(s)), b = Buffer.from(sig ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Starts a new run (review) or adds a question to a conversation (ask). */
export function newState(kind: AgentState["kind"], question?: string, previous?: AgentState): AgentState {
  const content = kind === "review" ? "Run the Monday Commercial Review for the latest week." : (question ?? "").slice(0, 600);
  const messages = previous ? [...previous.messages, { role: "user", content }] : [{ role: "user", content }];
  return { kind, messages, turns: 0, done: false };
}

/** Runs turns until Claude finishes, the turn limit is hit, or the time budget for this request is used. */
export async function runSteps(state: AgentState, dataThrough: string, latestWeek: string): Promise<StepResult> {
  const started = Date.now();
  const steps: Step[] = [];
  const s: AgentState = { ...state, messages: [...state.messages] };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { state: s, sig: signState(s), steps, final: null, error: "ANTHROPIC_API_KEY is not set." };
  const tools = s.kind === "review" ? [...DATA_TOOLS, SUBMIT_BRIEF] : DATA_TOOLS;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

  while (!s.done && s.turns < MAX_TURNS && Date.now() - started < BUDGET_MS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
    let j: any;
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: ctrl.signal,
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-beta": "server-side-fallback-2026-07-01" },
        body: JSON.stringify({
          model, max_tokens: 16000, system: systemPrompt(s.kind, dataThrough, latestWeek), tools,
          output_config: { effort: s.kind === "review" ? "medium" : "low" },
          fallbacks: "default", messages: s.messages,
        }),
      });
      j = await resp.json().catch(() => ({}));
      if (!resp.ok) return { state: s, sig: signState(s), steps, final: null, error: `Claude API error ${resp.status}: ${j?.error?.message ?? "request failed"}` };
    } catch (e) {
      return { state: s, sig: signState(s), steps, final: null, error: (e as Error).name === "AbortError" ? "Claude took too long on one step. Press continue to retry." : `Could not reach the Claude API: ${(e as Error).message}` };
    } finally { clearTimeout(timer); }

    s.turns += 1;
    // keep Claude's full reply (including its reasoning blocks) so the next turn continues the same line of thought
    s.messages.push({ role: "assistant", content: j.content ?? [] });
    if (j.stop_reason === "refusal") return { state: { ...s, done: true }, sig: signState({ ...s, done: true }), steps, final: null, error: "Claude declined this request." };
    if (j.stop_reason === "max_tokens") return { state: { ...s, done: true }, sig: signState({ ...s, done: true }), steps, final: null, error: "The answer was cut off. Try a narrower question." };

    const uses = (j.content ?? []).filter((b: any) => b.type === "tool_use");
    if (!uses.length) {
      s.done = true;
      const text = (j.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
      return { state: s, sig: signState(s), steps, final: { text } };
    }
    const brief = uses.find((u: any) => u.name === "submit_brief");
    if (brief) {
      s.messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: brief.id, content: "Brief saved." }] });
      s.done = true;
      return { state: s, sig: signState(s), steps: [...steps, { tool: "submit_brief", summary: "brief written" }], final: { brief: brief.input as Brief } };
    }
    const results = await Promise.all(uses.map(async (u: any) => {
      const out = await runTool(u.name, u.input);
      steps.push({ tool: u.name, summary: out.summary });
      return { type: "tool_result", tool_use_id: u.id, content: out.text, ...(out.isError ? { is_error: true } : {}) };
    }));
    s.messages.push({ role: "user", content: results });
  }
  if (!s.done && s.turns >= MAX_TURNS) {
    s.done = true;
    return { state: s, sig: signState(s), steps, final: null, error: "The agent used its step limit without finishing." };
  }
  return { state: s, sig: signState(s), steps, final: null };
}
