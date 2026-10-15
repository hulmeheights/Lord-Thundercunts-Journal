import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Circle, CircleCheck } from "lucide-react";
import { isConfigured, setupChecklist } from "@/lib/env";
import { LogoMark } from "@/components/ui/Logo";
import { Ambient } from "@/components/shell/Ambient";
import { KeyGenerator } from "@/components/auth/KeyGenerator";

export const metadata = { title: "Setup" };

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="glass rounded-[28px] p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-3">
        {done ? <CircleCheck size={24} className="shrink-0 text-pos" /> : (
          <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-fill-3 text-[12px] font-bold">{n}</span>
        )}
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
      </div>
      <div className="space-y-3 pl-9 text-[14px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

export default async function SetupPage() {
  await connection();
  if (isConfigured()) redirect("/unlock");
  const items = setupChecklist();
  const has = (k: string) => items.find((i) => i.key === k)?.ok ?? false;

  return (
    <div className="relative min-h-dvh px-5 py-12">
      <Ambient />
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="mb-6 flex items-center gap-4">
          <LogoMark size={56} glow />
          <div>
            <div className="eyebrow">Three steps · about three minutes</div>
            <h1 className="title-xl">Let&apos;s switch it on.</h1>
          </div>
        </div>

        <Step n={1} title="Add the free database" done={has("DATABASE_URL")}>
          <p>
            In Vercel, open this project → <b className="text-ink">Storage</b> → <b className="text-ink">Create Database</b> →{" "}
            <b className="text-ink">Neon</b> → choose the <b className="text-ink">Free</b> plan and region <b className="text-ink">London</b> →{" "}
            <b className="text-ink">Connect</b> (tick all environments). Vercel adds <code className="rounded bg-fill-2 px-1">DATABASE_URL</code>{" "}
            automatically — the password goes straight from Neon to Vercel, nobody sees it.
          </p>
        </Step>

        <Step n={2} title="Paste your secrets" done={has("ENCRYPTION_KEY")}>
          <p>
            Copy the block below. In Vercel go to <b className="text-ink">Settings → Environment Variables</b>, click into the{" "}
            <b className="text-ink">Key</b> box and paste — Vercel splits it into both variables. Tick <b className="text-ink">Sensitive</b>, then{" "}
            <b className="text-ink">Save</b>.
          </p>
          <KeyGenerator encryptionKeySet={has("ENCRYPTION_KEY")} />
        </Step>

        <Step n={3} title="Redeploy, then claim it" done={false}>
          <p>
            <b className="text-ink">Deployments</b> → the latest one → <b className="text-ink">⋯ → Redeploy</b>. When it&apos;s live, reopen your site on
            this device: it will ask you to choose your passphrase (the setup code fills itself in), then offer Face ID.
          </p>
        </Step>

        <div className="glass rounded-[24px] p-5">
          <div className="eyebrow mb-3">Status</div>
          <div className="space-y-2">
            {items.map((i) => (
              <div key={i.key} className="flex items-start gap-3 text-[13.5px]">
                {i.ok ? <CircleCheck size={17} className="mt-0.5 shrink-0 text-pos" /> : <Circle size={17} className={`mt-0.5 shrink-0 ${i.required ? "text-orange" : "text-ink-4"}`} />}
                <div>
                  <code className="text-ink">{i.key}</code> <span className="text-ink-3">— {i.label}</span>
                  {!i.ok && <div className="text-[12.5px] text-ink-4">{i.help}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[12.5px] leading-relaxed text-ink-4">
          This page only reports whether each variable exists — never its value — and disappears once setup is complete. Tables are created
          automatically on first launch.
        </p>
      </div>
    </div>
  );
}
