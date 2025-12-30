import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const distDir = resolve("dist");

await mkdir(distDir, { recursive: true });

await build({
  entryPoints: ["src/content.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2018"],
  outfile: "dist/content.js",
});

const manifest = await readFile("src/manifest.json", "utf8");
await writeFile("dist/manifest.json", manifest, "utf8");

console.log("Build complete: dist/content.js, dist/manifest.json");
