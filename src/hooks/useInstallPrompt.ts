import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isStandalone() {
  return (
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    // iOS
    (navigator as any).standalone === true
  );
}

export function useInstallPrompt(storageKey: string) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === "1");
  const [showIosTip, setShowIosTip] = useState(false);

  const canShow = useMemo(() => {
    if (dismissed) return false;
    if (isStandalone()) return false;
    return true;
  }, [dismissed]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    if (!canShow) return;
    // iOS does not support beforeinstallprompt; show a one-time tip.
    if (isIOS() && !localStorage.getItem(`${storageKey}:ios_tip`)) {
      setShowIosTip(true);
      localStorage.setItem(`${storageKey}:ios_tip`, "1");
    }
  }, [canShow, storageKey]);

  const dismiss = () => {
    localStorage.setItem(storageKey, "1");
    setDismissed(true);
    setDeferred(null);
    setShowIosTip(false);
  };

  const promptInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "dismissed") dismiss();
    setDeferred(null);
  };

  return {
    canShowInstallBanner: canShow && !!deferred,
    showIosTip: canShow && showIosTip,
    promptInstall,
    dismiss,
  };
}

