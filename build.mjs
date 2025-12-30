import { build } from "esbuild";
import { readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const distDir = resolve("dist");
const isProd = process.env.NODE_ENV === "production" || process.argv.includes("--prod");

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await build({
  entryPoints: ["src/content.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2018"],
  outfile: "dist/content.js",
  minify: isProd,
});

await build({
  entryPoints: ["src/popup.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2018"],
  outfile: "dist/popup.js",
  minify: isProd,
});

const manifest = await readFile("src/manifest.json", "utf8");
await writeFile("dist/manifest.json", manifest, "utf8");

const popupHtml = await readFile("src/popup.html", "utf8");
await writeFile("dist/popup.html", popupHtml, "utf8");

const popupCss = await readFile("src/popup.css", "utf8");
await writeFile("dist/popup.css", popupCss, "utf8");

await copyFile("icon.png", resolve(distDir, "icon.png"));

const modeLabel = isProd ? "production" : "development";
console.log(`Build (${modeLabel}) complete: dist/content.js, dist/popup.js, dist/manifest.json`);
