import { redirect } from "next/navigation";
import Link from "next/link";
import { isConfigured } from "@/lib/env";
import { requireSession } from "@/lib/auth/session";
import { Sidebar } from "@/components/shell/Sidebar";
import { TabBar } from "@/components/shell/TabBar";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { LogoMark } from "@/components/ui/Logo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isConfigured()) redirect("/setup");
  await requireSession();
  return (
    <div className="relative min-h-dvh">
      <Sidebar />
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/80 px-4 pt-[calc(8px+var(--safe-top))] pb-2.5 backdrop-blur-xl lg:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="text-[14px] font-semibold tracking-[-0.02em]">Thundercunts</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/settings" className="grid h-8 place-items-center rounded-full border border-line-2 px-3 text-[12.5px] text-ink-2">
            Settings
          </Link>
        </div>
      </div>
      <main className="relative px-5 pt-7 pb-36 sm:px-8 lg:ml-[232px] lg:px-14 lg:pt-14 lg:pb-24">
        <div className="mx-auto max-w-[1160px]">{children}</div>
      </main>
      <TabBar />
    </div>
  );
}
