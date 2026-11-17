import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import puppeteer from "puppeteer-core";
import { findBrowser } from "../cli/render.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const entry = path.join(root, "cli", "index.mjs");
await mkdir(path.join(root, "test-results"), { recursive: true });
const directory = await mkdtemp(path.join(root, "test-results", "cli-日本語 path-"));

async function run(args, expectedStatus = 0) {
  const child = spawn(process.execPath, [entry, ...args], { cwd: directory, windowsHide: true });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const [status] = await once(child, "exit");
  assert.equal(status, expectedStatus, `${args.join(" ")}\n${stderr}`);
  if (expectedStatus !== 0) assert.equal(stdout, "", "Failures must not print a success path");
  else assert.equal(stderr, "");
  return { stdout, stderr };
}

async function decodePng(png) {
  const image = await loadImage(png);
  assert.deepEqual([image.width, image.height], [384, 512]);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const palette = new Set();
  let transparent = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    assert.ok(pixels[offset + 3] === 0 || pixels[offset + 3] === 255);
    if (pixels[offset + 3] === 0) transparent++;
    else palette.add(`${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`);
  }
  assert.ok(transparent > 0 && palette.size > 1 && palette.size <= 15);
  for (let row = 0; row < 8; row++) for (let column = 0; column < 6; column++) {
    let occupied = false;
    for (let y = row * 64; y < (row + 1) * 64; y++) for (let x = column * 64; x < (column + 1) * 64; x++) {
      if (pixels[(y * 384 + x) * 4 + 3] === 255) occupied = true;
    }
    assert.ok(occupied, `Empty frame: ${row},${column}`);
  }
  return pixels;
}

const cliPixels = new Map();
for (const [version, fixture] of [["vrm1", "public/demo.vrm"], ["vrm0", "tests/fixtures/demo-vrm0.vrm"]]) {
  const input = path.join(directory, `${version} 日本語 model.vrm`);
  await copyFile(path.join(root, fixture), input);
  // Input alone: output is beside the model, even from an unrelated CWD.
  const { stdout } = await run([path.basename(input)]);
  const output = path.join(directory, `${version} 日本語 model-spritesheet.png`);
  assert.equal(stdout.trim(), output);
  const png = await readFile(output);
  cliPixels.set(version, await decodePng(png));
  const refusal = await run([input], 1);
  assert.match(refusal.stderr, /already exists/);
  assert.deepEqual(await readFile(output), png, "Existing output must remain unchanged");
  await run([input, "--force"]);
  assert.deepEqual(await readFile(output), png, "Repeated conversion must be deterministic");
  console.log(`${version}: real CLI PNG, 48 populated frames, transparency, palette, Unicode paths and overwrite protection passed`);
}

const demo = path.join(root, "public", "demo.vrm");
const customOutput = path.join(directory, "nested output", "sprite image.png");
await run([demo, "--output", customOutput]);
await decodePng(await readFile(customOutput));

for (const [name, bytes] of [["broken", Buffer.from("not a VRM")], ["truncated", (await readFile(demo)).subarray(0, 100)],
  ["oversized", Buffer.alloc(25 * 1024 * 1024 + 1)]]) {
  const input = path.join(directory, `${name}.vrm`);
  const output = path.join(directory, `${name}.png`);
  await writeFile(input, bytes);
  await run([input, "-o", output], 1);
  await assert.rejects(stat(output), { code: "ENOENT" });
}
// A well-formed empty GLB passes the header check but must fail model rendering.
const jsonText = JSON.stringify({ asset: { version: "2.0" } });
const json = Buffer.from(jsonText.padEnd(Math.ceil(jsonText.length / 4) * 4, " "));
const glb = Buffer.alloc(20 + json.length);
glb.writeUInt32LE(0x46546c67, 0);
glb.writeUInt32LE(2, 4);
glb.writeUInt32LE(glb.length, 8);
glb.writeUInt32LE(json.length, 12);
glb.writeUInt32LE(0x4e4f534a, 16);
json.copy(glb, 20);
const nonVrm = path.join(directory, "non-vrm.vrm");
await writeFile(nonVrm, glb);
const renderFailure = await run([nonVrm], 1);
assert.match(renderFailure.stderr, /could not be rendered/);
await assert.rejects(stat(path.join(directory, "non-vrm-spritesheet.png")), { code: "ENOENT" });
await run([path.join(directory, "missing.vrm")], 1);
await run([demo, "--browser", path.join(directory, "missing-chrome.exe"), "-o", path.join(directory, "missing-browser.png")], 1);
console.log("CLI input/model failures return exit code 1 without creating PNGs");

// Exercise the real UI entrypoint, not a reimplementation of the conversion.
const dist = path.join(root, "dist");
const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url, "http://localhost");
    const filename = path.resolve(dist, `.${url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname)}`);
    const relative = path.relative(dist, filename);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Invalid asset path");
    const contentType = filename.endsWith(".html") ? "text/html" : filename.endsWith(".js") ? "text/javascript"
      : filename.endsWith(".css") ? "text/css" : "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    response.end(await readFile(filename));
  })().catch(() => { response.writeHead(404); response.end(); });
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
let browser;
try {
  browser = await puppeteer.launch({ executablePath: await findBrowser(), headless: true, args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.setRequestInterception(true);
  page.on("request", (request) => { void (request.url().startsWith(`${origin}/`) ? request.continue() : request.abort()); });
  await page.goto(origin, { waitUntil: "load" });
  await page.waitForFunction(() => !document.getElementById("download-sheet").disabled, { timeout: 120_000 });
  for (const version of ["vrm1", "vrm0"]) {
    if (version === "vrm0") {
      const input = await page.$('input[type="file"]');
      await input.uploadFile(path.join(root, "tests", "fixtures", "demo-vrm0.vrm"));
      await page.waitForFunction(() => document.getElementById("model-version").textContent.includes("VRM 0.x") && !document.getElementById("download-sheet").disabled);
    }
    const pixels = await page.evaluate(() => Array.from(document.getElementById("sheet-canvas").getContext("2d").getImageData(0, 0, 384, 512).data));
    assert.deepEqual(new Uint8ClampedArray(pixels), cliPixels.get(version), `${version}: Web UI and CLI pixels must match`);
    console.log(`${version}: actual Web UI and CLI outputs match pixel for pixel`);
  }
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
console.log(`CLI integration tests passed. PNGs: ${directory}`);
