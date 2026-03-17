import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PwaUpdateBanner({ className }: { className?: string }) {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
  });

  if (!needRefresh) return null;

  return (
    <div className={cn("fixed left-0 right-0 bottom-4 z-50 mx-auto w-[min(720px,calc(100%-2rem))] rounded-lg border bg-card p-3 shadow-lg", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-medium">Update available</div>
          <div className="text-muted-foreground">Tap to refresh and get the latest version.</div>
        </div>
        <Button onClick={() => updateServiceWorker(true)}>Refresh</Button>
      </div>
    </div>
  );
}

