import { requireSession } from "@/lib/auth";
import { Header } from "@/components/ui";
import AskChat from "@/components/AskChat";

export const dynamic = "force-dynamic";

export default async function Ask() {
  const s = await requireSession();
  return (
    <>
      <Header title="Ask BOOST" sub="AI agent · ask about sales, stock, ads, promotions or market share in plain English. It chooses the screens and the period, and shows each step." />
      <AskChat />
    </>
  );
}
