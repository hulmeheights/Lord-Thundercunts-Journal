import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isConfigured, setupChecklist } from "@/lib/env";
import { cn } from "@/lib/cn";
import { AuthShell } from "@/components/auth/AuthShell";
import { KeyGenerator } from "@/components/auth/KeyGenerator";

export const metadata = { title: "Setup" };

function Step({ n, title, done, children }: { n: number; title: React.ReactNode; done: boolean; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-8 gap-y-4 border-t border-line py-10 md:grid-cols-[3rem_1fr]">
      <div className={cn("font-mono text-[11px] tracking-[0.1em]", done ? "text-pos" : "text-gold")}>{done ? "● done" : String(n).padStart(2, "0")}</div>
      <div>
        <h2 className="font-serif text-[clamp(1.4rem,2.8vw,2rem)] leading-[1.2] font-light tracking-[-0.01em] [&_em]:italic">{title}</h2>
        <div className="mt-5 max-w-[62ch] space-y-4 font-mono text-[12px] leading-[1.95] tracking-[0.02em] text-ink-2 [&_b]:font-normal [&_b]:text-ink">{children}</div>
      </div>
    </section>
  );
}

export default async function SetupPage() {
  await connection();
  if (isConfigured()) redirect("/unlock");
  const items = setupChecklist();
  const has = (k: string) => items.find((i) => i.key === k)?.ok ?? false;

  return (
    <AuthShell wide>
      <div className="eyebrow mb-8 !tracking-[0.42em]">Three steps · about three minutes</div>
      <h1 className="font-serif text-[clamp(2.6rem,8vw,5rem)] leading-[1] font-light tracking-[-0.01em]">
        Let&apos;s switch it <em>on</em>.
      </h1>

      <div className="mt-14">
        <Step n={1} title={<>Add the free <em>database</em>.</>} done={has("DATABASE_URL")}>
          <p>
            In Vercel open this project → <b>Storage</b> → <b>Create Database</b> → <b>Neon</b> → the <b>Free</b> plan, region <b>London</b> → <b>Connect</b> (tick all
            environments). Vercel adds <b>DATABASE_URL</b> by itself; the password goes straight from Neon to Vercel and nobody sees it.
          </p>
        </Step>
        <Step n={2} title={<>Paste your <em>secrets</em>.</>} done={has("ENCRYPTION_KEY")}>
          <p>
            Copy the block below. In Vercel go to <b>Settings → Environment Variables</b>, click into the <b>Key</b> box and paste: Vercel splits it into both variables.
            Tick <b>Sensitive</b>, then <b>Save</b>.
          </p>
          <KeyGenerator encryptionKeySet={has("ENCRYPTION_KEY")} />
        </Step>
        <Step n={3} title={<>Redeploy, then <em>claim</em> it.</>} done={false}>
          <p>
            <b>Deployments</b> → the latest one → <b>⋯ → Redeploy</b>. When it&apos;s live, open your site on this device: it asks you to choose a passphrase (the setup code fills
            itself in), then offers Face ID.
          </p>
        </Step>
      </div>

      <section className="border-t border-line pt-10">
        <div className="label mb-6">Status</div>
        <div className="border-t border-line">
          {items.map((i) => (
            <div key={i.key} className="grid grid-cols-[1.5rem_1fr] gap-x-3 border-b border-line py-3.5 font-mono">
              <span className={cn("text-[11px]", i.ok ? "text-pos" : i.required ? "text-gold" : "text-ink-4")}>{i.ok ? "●" : "○"}</span>
              <div>
                <span className="text-[11.5px] text-ink">{i.key}</span> <span className="text-[11px] text-ink-3">· {i.label}</span>
                {!i.ok && <div className="mt-1 text-[10.5px] leading-[1.8] text-ink-4">{i.help}</div>}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-[62ch] font-mono text-[10.5px] leading-[1.85] text-ink-4">
          This page only reports whether each variable exists, never its value, and disappears once setup is complete. Tables are created on first launch.
        </p>
      </section>
    </AuthShell>
  );
}
