import { generateSW } from "workbox-build";
import { writeFile } from "node:fs/promises";
await writeFile(
  "dist/manifest.json",
  JSON.stringify(
    {
      id: "/",
      name: "Dodo",
      short_name: "Dodo",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#000000",
      icons: [...[192, 512].map((size) => ({
        src: `/icon-v1-${size}.png`,
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose: "any",
      })), {
        src: "/icon-v1-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      }],
    },
    null,
    2,
  ),
);
const { count, warnings } = await generateSW({
  globDirectory: "dist",
  globPatterns: ["**/*.{html,js,css,png,ico,json,ttf,woff,woff2}"],
  globIgnores: ["sw.js", "workbox-*.js"],
  swDest: "dist/sw.js",
  navigateFallback: "/index.html",
  navigateFallbackDenylist: [/^\/api\//],
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: true,
  maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
});
for (const warning of warnings) console.warn(warning);
console.log(
  `PWA app shell ready: ${count} files precached. Task API responses are never cached.`,
);
