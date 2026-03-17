import { cn } from "@/lib/utils";

export function OfflineBanner({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cn("mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground", className)}>
      {message}
    </div>
  );
}

