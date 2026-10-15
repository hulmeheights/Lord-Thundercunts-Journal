import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/env";
import { getSession } from "@/lib/auth/session";
import { passkeyCount } from "@/lib/auth/passkeys";
import { getSettings } from "@/lib/data/settings";
import { UnlockClient } from "@/components/auth/UnlockClient";
import { Ambient } from "@/components/shell/Ambient";

export const metadata = { title: "Unlock" };

export default async function UnlockPage() {
  if (!isConfigured()) redirect("/setup");
  if (await getSession()) redirect("/");
  const [count, settings] = await Promise.all([passkeyCount(), getSettings()]);
  return (
    <div className="relative grid min-h-dvh place-items-center px-5 py-10">
      <Ambient />
      <UnlockClient hasPasskeys={count > 0} passkeyOnly={settings.security.passkeyOnly && count > 0} />
    </div>
  );
}
