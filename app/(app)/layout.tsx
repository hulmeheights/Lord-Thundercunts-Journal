import { redirect } from "next/navigation";
import Link from "next/link";
import { isConfigured } from "@/lib/env";
import { requireSession } from "@/lib/auth/session";
import { Sidebar } from "@/components/shell/Sidebar";
import { TabBar } from "@/components/shell/TabBar";
import { Hud } from "@/components/shell/Hud";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isConfigured()) redirect("/setup");
  await requireSession();
  return (
    <div className="relative min-h-dvh">
      <Sidebar />
      <Hud />
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-start justify-between bg-bg/90 px-5 pt-[calc(14px+var(--safe-top))] pb-3 backdrop-blur-md lg:hidden">
        <Link href="/">
          <div className="font-mono text-[12px] tracking-[0.42em] text-ink">
            THUNDER<span className="text-gold"> ◆</span>
          </div>
          <div className="eyebrow !text-[9px]">Private journal</div>
        </Link>
        <Link href="/settings" className="font-mono text-[9.5px] tracking-[0.22em] text-ink-4 uppercase">
          Settings
        </Link>
      </div>
      <main className="relative z-[5] px-6 pt-4 pb-32 sm:px-10 lg:ml-[232px] lg:px-[clamp(3rem,6vw,6rem)] lg:pt-10 lg:pb-24">
        <div className="mx-auto max-w-[1160px]">{children}</div>
      </main>
      <TabBar />
    </div>
  );
}
