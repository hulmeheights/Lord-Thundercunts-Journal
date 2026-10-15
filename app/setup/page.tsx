import { redirect } from "next/navigation";
import { connection } from "next/server";
import { CircleCheck, Circle } from "lucide-react";
import { isConfigured, setupChecklist } from "@/lib/env";
import { LogoMark } from "@/components/ui/Logo";
import { Ambient } from "@/components/shell/Ambient";
import { KeyGenerator } from "@/components/auth/KeyGenerator";

export const metadata = { title: "Setup" };

export default async function SetupPage() {
  await connection();
  if (isConfigured()) redirect("/unlock");
  const items = setupChecklist();
  return (
    <div className="relative min-h-dvh px-5 py-12">
      <Ambient />
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex items-center gap-4">
          <LogoMark size={56} glow />
          <div>
            <div className="eyebrow">First-time setup</div>
            <h1 className="title-xl">Almost there.</h1>
          </div>
        </div>
        <p className="mb-6 text-[15px] leading-relaxed text-ink-2">
          Your journal is deployed. Add these environment variables in{" "}
          <span className="text-ink">Vercel → your project → Settings → Environment Variables</span> (tick{" "}
          <span className="text-ink">Sensitive</span>), then redeploy. Secrets never live in the code, so the repository can stay public without
          exposing anything.
        </p>
        <div className="glass mb-6 overflow-hidden rounded-[28px]">
          {items.map((i) => (
            <div key={i.key} className="flex gap-4 border-b border-line p-5 last:border-0">
              <div className="pt-0.5">
                {i.ok ? <CircleCheck className="text-pos" size={22} /> : <Circle className={i.required ? "text-orange" : "text-ink-4"} size={22} />}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-md bg-fill-2 px-1.5 py-0.5 text-[13px] text-ink">{i.key}</code>
                  <span className="text-[13px] text-ink-3">{i.label}</span>
                  {!i.required && <span className="text-[11px] font-semibold tracking-wider text-ink-4 uppercase">Optional</span>}
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-3">{i.help}</p>
              </div>
            </div>
          ))}
        </div>
        <KeyGenerator />
        <p className="mt-6 text-[12.5px] leading-relaxed text-ink-4">
          The database tables are created automatically on first launch. This page only reports whether each variable is present — never its
          value — and disappears once setup is complete.
        </p>
      </div>
    </div>
  );
}
