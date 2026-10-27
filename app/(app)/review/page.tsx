import { canWrite, requireSession } from "@/lib/auth";
import { getReport, listReports, NOTES_MAX } from "@/lib/agent/context";
import { dataRange, getBrand } from "@/lib/queries";
import { addDays, periodOptions } from "@/lib/period";
import { Header } from "@/components/ui";
import ReviewRunner from "@/components/ReviewRunner";
import ReportPanel from "@/components/ReportPanel";

export const dynamic = "force-dynamic";

export default async function BusinessReview({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const s = await requireSession();
  const admin = canWrite(s);
  const brand = await getBrand();
  const { report: reportId } = await searchParams;
  const [items, report, span] = brand
    ? await Promise.all([listReports(brand.id), getReport(brand.id, reportId), dataRange(brand.id)])
    : [[], null, { min: null, max: null }];
  // periods an account manager can report on: completed weeks and months first (the usual Monday / month-close reports)
  let weeks: { key: string; label: string }[] = [], months: { key: string; label: string }[] = [];
  if (span.min && span.max) {
    const o = periodOptions(span.min, span.max);
    weeks = o.week.filter((w) => addDays(w.key, 6) <= span.max!);
    const closed = o.month.filter((m) => !m.label.includes("("));
    const open = o.month.filter((m) => m.label.includes("(") && m.key === span.max!.slice(0, 7));
    months = [...closed, ...open.map((m) => ({ ...m, label: `${m.label}, month to date` }))];
  }
  return (
    <>
      <Header title="Business Review" sub="AI agent · weekly reports for every Monday and monthly reports at month close, for the brand: every screen compared with the previous period and the same period last year, with conflicts between screens and the account manager's notes" />
      {admin ? <ReviewRunner weeks={weeks} months={months} notesMax={NOTES_MAX} /> : null}
      {report ? (
        <ReportPanel key={report.id + report.notes.length} report={report} items={items} admin={admin} brand={brand?.name ?? ""} notesMax={NOTES_MAX} />
      ) : (
        <section className="card"><div className="muted">{admin ? "No report yet. Create the first one above." : "The account manager has not shared a business review yet."}</div></section>
      )}
    </>
  );
}
