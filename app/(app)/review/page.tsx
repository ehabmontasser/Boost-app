import { requireSession } from "@/lib/auth";
import { latestBrief } from "@/lib/agent/context";
import { getBrand } from "@/lib/queries";
import { dayLabel } from "@/lib/period";
import { Header, Title } from "@/components/ui";
import { BriefView } from "@/components/AgentParts";
import ReviewRunner from "@/components/ReviewRunner";

export const dynamic = "force-dynamic";

export default async function WeeklyReview() {
  const s = await requireSession();
  const brand = await getBrand();
  const saved = brand ? await latestBrief(brand.id) : null;
  const when = saved ? new Date(saved.createdAt) : null;
  return (
    <>
      <Header title="Weekly review" sub="AI agent · the Monday Commercial Review: every screen for the latest week, compared with last week and the same week last year, with conflicts between screens" />
      {s.role === "admin" ? <ReviewRunner /> : null}
      <section className="card">
        <Title info="The latest brief written by the Monday Commercial Review agent. The agent decides which screens to read (Overview, Replenishment, Ads, Promotions, Market share and a joined product view), compares the latest week with the previous week and the same week last year, and looks for conflicts that single screens cannot show. Every figure comes from the tools; Claude only interprets them.">Latest brief</Title>
        {saved ? (
          <BriefView brief={saved.brief} meta={`Written ${when ? `${dayLabel(when.toISOString().slice(0, 10))}, ${when.toISOString().slice(11, 16)} UTC` : ""} · data through ${dayLabel(saved.dataThrough)} · ${saved.tools} tool calls · ${saved.model}`} />
        ) : (
          <div className="muted">{s.role === "admin" ? "No review yet. Run the first one above." : "The account manager has not run a weekly review yet."}</div>
        )}
      </section>
    </>
  );
}
