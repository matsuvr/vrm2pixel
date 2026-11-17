// Keep the deployed legal notices aligned with the exact production lockfile.
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
// These npm packages omit their upstream license text. Vendored originals and
// the exact upstream revisions are recorded in licenses/README.md.
const upstreamLicenses = new Map([
  ["@cloudflare/puppeteer", "Apache-2.0.txt"],
  ["puppeteer-core", "Apache-2.0.txt"],
  ["@puppeteer/browsers", "Apache-2.0.txt"],
  ["undici-types", "undici-MIT.txt"],
]);
const sections = ["Third-party licenses for production dependencies\nGenerated from package-lock.json by npm run licenses:build.\nEach dependency retains its own license; the application is MIT licensed."];
const seen = new Set();
for (const [directory, entry] of Object.entries(lock.packages).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
  if (!directory || entry.dev) continue;
  const packageDir = path.join(root, directory);
  const pkg = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
  const id = `${pkg.name}@${pkg.version}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const files = (await readdir(packageDir)).filter((name) => /^(licen[sc]e|copying|notice)([.-]|$)/i.test(name)).sort();
  const texts = [];
  for (const file of files) texts.push(`${file}\n${(await readFile(path.join(packageDir, file), "utf8")).trim()}`);
  if (!files.some((name) => /^(licen[sc]e|copying)([.-]|$)/i.test(name))) {
    const fallback = upstreamLicenses.get(pkg.name);
    if (!fallback) throw new Error(`No license text found for ${id}. Review and add its upstream license before publishing.`);
    texts.unshift((await readFile(path.join(root, "licenses", fallback), "utf8")).trim());
  }
  sections.push(`${id}\nSPDX: ${entry.license ?? pkg.license ?? "See license below"}\n${texts.join("\n\n")}`);
}
await mkdir(path.join(root, "public"), { recursive: true });
for (const [source, destination] of [["LICENSE", "LICENSE"], ["licenses/CC0-1.0.txt", "LICENSE-CC0.txt"], ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"]]) {
  await copyFile(path.join(root, source), path.join(root, "public", destination));
}
await writeFile(path.join(root, "public", "THIRD_PARTY_LICENSES.txt"), sections.join("\n\n" + "=".repeat(80) + "\n\n") + "\n");
console.log(`Prepared application, demo and ${seen.size} dependency license notices.`);
