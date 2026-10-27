"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Platform choice for the Platform Analysis page. Lives in the URL next to the period, so both survive reloads. */
export default function PlatformPicker({ value, platforms }: { value: string; platforms: { code: string; name: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const pick = (code: string) => {
    const q = new URLSearchParams(sp.toString());
    q.set("platform", code);
    router.push(`${path}?${q.toString()}`);
  };
  return (
    <label className="platform-pick">
      <span>Platform</span>
      <select aria-label="Platform" value={value} onChange={(e) => pick(e.target.value)}>
        {platforms.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
      </select>
    </label>
  );
}
