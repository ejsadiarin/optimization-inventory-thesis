import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function PWAInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [standalone] = useState(isStandalone);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: BeforeInstallPromptEvent) {
      event.preventDefault();
      setInstallEvent(event);
    }

    function handleInstalled() {
      setInstalled(true);
      setInstallEvent(null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (standalone || installed || dismissed || !installEvent) return null;

  async function handleInstall() {
    if (!installEvent) return;

    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
      } else {
        setDismissed(true);
      }
    } catch {
      setDismissed(true);
    } finally {
      setInstallEvent(null);
    }
  }

  return (
    <aside
      role="region"
      aria-label="Install app"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-start gap-3 rounded-lg border bg-card p-4 shadow-lg"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Download className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Install Formwork Optimizer</p>
        <p className="text-xs text-muted-foreground">
          Keep the cutter and inventory available offline on site.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" type="button" onClick={() => void handleInstall()}>
          Install
        </Button>
        <Button
          size="icon"
          variant="ghost"
          type="button"
          aria-label="Dismiss install prompt"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}
