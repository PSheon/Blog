"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

/** Chromium's install event. Not in lib.dom: it is not a standard yet. */
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/*
 * The browser fires `beforeinstallprompt` once, early, and only Chrome itself turns it into a visible hint; Brave,
 * Edge and Samsung Internet stay silent, and the reader has to find "Add to home screen" in a menu. So the event is
 * kept here, at module level (the drawer that offers the button mounts much later), and the site offers the
 * installation itself. Safari has no such event: there the button never appears.
 */
let pending: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => { pending = event as InstallEvent; notify(); });
  window.addEventListener("appinstalled", () => { pending = null; notify(); });
}
const subscribe = (l: () => void) => { listeners.add(l); return () => void listeners.delete(l); };

function useInstall() {
  const available = useSyncExternalStore(subscribe, () => pending !== null, () => false);
  const install = async () => {
    const event = pending;
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    pending = null; // an event can be used once, whatever the answer
    notify();
  };
  return { available, install };
}

/** "Install" for menus and the footer. Renders nothing until the browser says the site can be installed. */
export function InstallButton({ label, className }: { label: string; className?: string }) {
  const { available, install } = useInstall();
  if (!available) return null;
  return (
    <Button size="sm" variant="outline" className={className} onClick={() => void install()} data-testid="install-button">
      <Download />
      {label}
    </Button>
  );
}

const DISMISSED = "install-hint-dismissed";

/** One quiet line at the bottom of a phone screen, once, until it is answered or closed. */
export function InstallHint({ text, action, dismiss }: { text: string; action: string; dismiss: string }) {
  const { available, install } = useInstall();
  const [closed, setClosed] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => { try { setClosed(localStorage.getItem(DISMISSED) === "1"); } catch { setClosed(false); } }, 0);
    return () => window.clearTimeout(id);
  }, []);
  const close = () => { setClosed(true); try { localStorage.setItem(DISMISSED, "1"); } catch { /* private mode */ } };
  if (!available || closed) return null;
  return (
    <div role="region" aria-label={action} className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-md border border-border bg-panel/95 py-2 pr-2 pl-4 text-sm shadow-lg backdrop-blur-md md:hidden" data-testid="install-hint">
      <p className="min-w-0 flex-1 leading-snug">{text}</p>
      <Button size="sm" onClick={() => void install().then(close)}>{action}</Button>
      <Button size="icon-sm" variant="ghost" aria-label={dismiss} onClick={close}><X /></Button>
    </div>
  );
}
