import { BookOpen, ChartLine, House, ListChecks, MessageCircle, ShieldCheck } from "lucide-react";

export const NAV = [
  { href: "/", label: "Today", icon: House },
  { href: "/trades", label: "Trades", icon: ListChecks },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/insights", label: "Insights", icon: ChartLine },
  { href: "/guardian", label: "Guardian", icon: ShieldCheck },
  { href: "/coach", label: "Coach", icon: MessageCircle },
] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
