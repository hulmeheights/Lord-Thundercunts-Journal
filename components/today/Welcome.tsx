"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { LoaderCircle, ScanFace, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { registerPasskey } from "@/lib/passkey-client";
import { clearSetupEnv } from "@/lib/setup-client";

/** Shown once after claiming: offers Face ID straight away. */
export function Welcome({ hasPasskey }: { hasPasskey: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasPasskey);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => clearSetupEnv(), []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0 }}
          className="glass noise relative overflow-hidden rounded-[3px] p-5 sm:p-6"
        >
          <div className="absolute -top-20 -right-16 h-56 w-56 rounded-full bg-brand opacity-25 blur-3xl" />
          <button onClick={() => setOpen(false)} className="absolute top-4 right-4 text-ink-3 hover:text-ink" aria-label="Dismiss">
            <X size={17} />
          </button>
          <div className="relative flex flex-wrap items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-[3px] bg-cyan/15 text-cyan">
              <ScanFace size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-semibold">It&apos;s yours. Now make it effortless.</div>
              <div className="text-[13.5px] text-ink-3">Add Face ID / Touch ID so you unlock in a glance — phishing-proof.</div>
              {msg && <div className="mt-1 text-[12.5px] text-orange">{msg}</div>}
            </div>
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMsg(null);
                try {
                  await registerPasskey();
                  setOpen(false);
                  router.refresh();
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Couldn't add Face ID");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <ScanFace size={16} />} Add Face ID
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
