import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Keep the selected v1 artwork as the source for every logo size.
const source = fileURLToPath(new URL("../assets/logo-v1.png", import.meta.url));
const assets = new URL("../assets/", import.meta.url);
const publicDir = new URL("../public/", import.meta.url);
const background = "#D3EEFC";
await mkdir(publicDir, { recursive: true });
const variants = [
  [assets, "wordmark-icon.png", 128],
  [assets, "icon.png", 1024],
  [assets, "favicon.png", 48],
  [publicDir, "logo-v1.png", 192],
  [publicDir, "favicon-v1-16.png", 16],
  [publicDir, "favicon-v1-32.png", 32],
  [publicDir, "apple-touch-icon-v1.png", 180],
  [publicDir, "icon-v1-192.png", 192],
  [publicDir, "icon-v1-512.png", 512],
];
await Promise.all(variants.map(([directory, name, size]) =>
  sharp(source).resize(size, size).png({ compressionLevel: 9 }).toFile(fileURLToPath(new URL(name, directory)))));

// Leave breathing room for circular and other launcher masks.
for (const [directory, name, size, content] of [
  [publicDir, "icon-v1-maskable-512.png", 512, 400],
  [assets, "android-icon-foreground.png", 1024, 740],
]) {
  const padding = (size - content) / 2;
  await sharp(source).resize(content, content)
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background })
    .png({ compressionLevel: 9 }).toFile(fileURLToPath(new URL(name, directory)));
}
console.log("Dodo v1 branding assets ready.");
