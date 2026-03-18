import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Wifi, WifiOff } from "lucide-react";

export function OnlineIndicator() {
  const online = useOnlineStatus();
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {online ? (
        <>
          <Wifi className="h-3.5 w-3.5 text-green-500" />
          <span className="text-muted-foreground">Online</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5 text-destructive" />
          <span className="text-destructive">Offline</span>
        </>
      )}
    </div>
  );
}
