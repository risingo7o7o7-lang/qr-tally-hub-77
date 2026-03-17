import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Android standalone: exit app on back at root
window.addEventListener("popstate", () => {
  const isStandalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  if (!isStandalone) return;
  if (window.location.pathname === "/" && window.history.length <= 1) {
    try {
      window.close();
    } catch {
      // ignore
    }
  }
});

createRoot(document.getElementById("root")!).render(<App />);
