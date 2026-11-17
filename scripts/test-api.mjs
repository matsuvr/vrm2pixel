import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadImage, createCanvas } from "@napi-rs/canvas";

const baseUrl = process.env.API_TEST_URL ?? "http://127.0.0.1:8787";
const key = process.env.API_KEY ?? /^API_KEY=(.+)$/m.exec(await readFile(new URL("../.dev.vars", import.meta.url), "utf8"))?.[1]?.trim();
assert.ok(key && /^[a-f0-9]{64}$/.test(key), "Expected the generated 64-character API key.");
const endpoint = `${baseUrl}/api/render`;
const headers = { Authorization: `Bearer ${key}` };
const request = (body, extra = {}) => fetch(endpoint, { method: "POST", headers: { ...headers, ...extra }, body });

for (const authorization of [undefined, "Bearer invalid", `Bearer ${"0".repeat(64)}`]) {
  const response = await fetch(endpoint, { method: "POST", headers: authorization ? { Authorization: authorization } : {} });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "unauthorized");
}
assert.equal((await fetch(endpoint, { headers })).status, 405);
assert.equal((await fetch(`${baseUrl}/api/unknown`, { headers })).status, 404);
assert.equal((await request("not a VRM", { "Content-Type": "application/octet-stream" })).status, 400);
assert.equal((await request("{}", { "Content-Type": "application/json" })).status, 415);
assert.equal((await fetch(baseUrl)).status, 200);

await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
for (const [name, path, multipart] of [
  ["vrm1", "../public/demo.vrm", true],
  ["vrm0", "../tests/fixtures/demo-vrm0.vrm", false],
]) {
  const bytes = await readFile(new URL(path, import.meta.url));
  const form = new FormData();
  form.set("file", new File([bytes], "demo.vrm"));
  const start = Date.now();
  const response = await request(multipart ? form : bytes, multipart ? {} : { "Content-Type": "application/octet-stream" });
  if (response.status !== 200) throw new Error(`Render failed (${response.status}): ${await response.text()}`);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const png = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const image = await loadImage(png);
  assert.equal(image.width, 384);
  assert.equal(image.height, 512);
  const canvas = createCanvas(384, 512);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, 384, 512).data;
  const palette = new Set();
  let transparent = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    assert.ok(pixels[i + 3] === 0 || pixels[i + 3] === 255);
    if (pixels[i + 3] === 0) transparent++;
    else palette.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
  }
  assert.ok(transparent > 0 && palette.size > 1 && palette.size <= 15);
  for (let row = 0; row < 8; row++) for (let col = 0; col < 6; col++) {
    let occupied = false;
    for (let y = row * 64; y < (row + 1) * 64; y++) for (let x = col * 64; x < (col + 1) * 64; x++) {
      if (pixels[(y * 384 + x) * 4 + 3] === 255) occupied = true;
    }
    assert.ok(occupied, `Empty sprite at ${row},${col}`);
  }
  await writeFile(new URL(`../test-results/api-${name}.png`, import.meta.url), png);
  console.log(`${name}: 200 PNG, 384x512, 48 populated sprites, ${palette.size} colors, ${Date.now() - start}ms`);
}
console.log("API authentication, validation, static UI and real VRM renders passed.");
