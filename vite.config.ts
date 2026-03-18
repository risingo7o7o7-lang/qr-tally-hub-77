import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["apple-touch-icon.png", "icons/*", "screenshots/*"],
      manifest: {
        name: "QR Tally",
        short_name: "QR Tally",
        start_url: "/",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone"],
        orientation: "portrait",
        theme_color: "#2D5BFF",
        background_color: "#FAFAFA",
        icons: [
          { src: "/icons/icon.svg", sizes: "512x512", type: "image/svg+xml" },
          { src: "/icons/icon-maskable.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Scan QR", short_name: "Scan QR", url: "/student", icons: [{ src: "/icons/icon.svg", sizes: "512x512" }] },
          { name: "New Session", short_name: "New Session", url: "/teacher", icons: [{ src: "/icons/icon.svg", sizes: "512x512" }] },
        ],
        screenshots: [
          { src: "/screenshots/student.svg", sizes: "1080x1920", type: "image/svg+xml", form_factor: "narrow" },
          { src: "/screenshots/teacher.svg", sizes: "1080x1920", type: "image/svg+xml", form_factor: "narrow" },
        ],
        share_target: {
          action: "/",
          method: "GET",
          enctype: "application/x-www-form-urlencoded",
          params: { title: "title", text: "text", url: "url" },
        },
      } as any,
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          // Static assets (GET only): CacheFirst
          {
            urlPattern: ({ request, url }) =>
              request.method === "GET" &&
              url.origin === self.location.origin &&
              (request.destination === "style" ||
              request.destination === "script" ||
              request.destination === "worker"),
            handler: "CacheFirst",
            options: {
              cacheName: "app-shell",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ request, url }) =>
              request.method === "GET" &&
              url.origin === self.location.origin &&
              (request.destination === "font" || request.destination === "image"),
            handler: "CacheFirst",
            options: {
              cacheName: "assets-cache",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
