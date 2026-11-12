import { generateSW } from "workbox-build";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
// Code-generated identity; no external image service needed for a simple mark.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#000000"/><path d="M298 116v216h-35v-17c-14 16-33 24-54 24-47 0-79-36-79-84s32-84 79-84c21 0 39 8 53 23v-78h36zm-84 90c-28 0-47 21-47 49s19 49 47 49 48-21 48-49-20-49-48-49z" fill="#ffffff"/><circle cx="354" cy="312" r="22" fill="#ffffff"/></svg>`;
for (const size of [192, 512])
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`dist/icon-${size}.png`);
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
      icons: [192, 512].map((size) => ({
        src: `/icon-${size}.png`,
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose: "any maskable",
      })),
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
