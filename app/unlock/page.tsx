import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/env";
import { getSession } from "@/lib/auth/session";
import { passkeyCount } from "@/lib/auth/passkeys";
import { hasOwner } from "@/lib/auth/owner";
import { getSettings } from "@/lib/data/settings";
import { UnlockClient } from "@/components/auth/UnlockClient";
import { ClaimClient } from "@/components/auth/ClaimClient";
import { Ambient } from "@/components/shell/Ambient";

export const metadata = { title: "Unlock" };

export default async function UnlockPage() {
  if (!isConfigured()) redirect("/setup");
  if (await getSession()) redirect("/");
  const claimed = await hasOwner();
  const [count, settings] = claimed ? await Promise.all([passkeyCount(), getSettings()]) : [0, null];
  return (
    <div className="relative grid min-h-dvh place-items-center px-5 py-10">
      <Ambient />
      {claimed ? (
        <UnlockClient hasPasskeys={count > 0} passkeyOnly={Boolean(settings?.security.passkeyOnly) && count > 0} />
      ) : (
        <ClaimClient />
      )}
    </div>
  );
}
