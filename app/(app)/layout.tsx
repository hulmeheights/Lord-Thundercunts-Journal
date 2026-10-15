import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings } from "lucide-react";
import { isConfigured } from "@/lib/env";
import { requireSession } from "@/lib/auth/session";
import { Sidebar } from "@/components/shell/Sidebar";
import { TabBar } from "@/components/shell/TabBar";
import { Ambient } from "@/components/shell/Ambient";
import { LogoMark } from "@/components/ui/Logo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isConfigured()) redirect("/setup");
  await requireSession();
  return (
    <div className="relative min-h-dvh">
      <Ambient />
      <Sidebar />
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line/60 bg-black/50 px-4 pt-[calc(8px+var(--safe-top))] pb-2 backdrop-blur-2xl lg:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="text-[14px] font-semibold tracking-[-0.01em]">Thundercunts</span>
        </Link>
        <Link href="/settings" className="grid h-9 w-9 place-items-center rounded-full bg-fill-2 text-ink-2" aria-label="Settings">
          <Settings size={17} />
        </Link>
      </div>
      <main className="relative px-4 pt-5 pb-32 sm:px-6 lg:ml-[248px] lg:px-10 lg:pt-10 lg:pb-16">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
      <TabBar />
    </div>
  );
}
