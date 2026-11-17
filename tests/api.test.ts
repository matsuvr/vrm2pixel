import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ApiError, MAX_FILE_BYTES, readVrm } from "../worker/api";

const demo = await readFile(new URL("../public/demo.vrm", import.meta.url));

test("API accepts binary VRM and multipart file uploads", async () => {
  const binary = await readVrm(new Request("https://example.com/api/render", {
    method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: demo,
  }));
  assert.deepEqual(new Uint8Array(binary), new Uint8Array(demo));
  const form = new FormData();
  form.set("file", new File([demo], "avatar.vrm"));
  const multipart = await readVrm(new Request("https://example.com/api/render", { method: "POST", body: form }));
  assert.deepEqual(new Uint8Array(multipart), new Uint8Array(demo));
});

test("API rejects unsupported data, malformed GLB and missing or repeated files", async () => {
  const cases: [BodyInit, string, number][] = [
    ["{}", "application/json", 415],
    ["not a vrm", "application/octet-stream", 400],
    [new Uint8Array(24), "application/octet-stream", 400],
    ["broken", "multipart/form-data; boundary=x", 400],
  ];
  for (const [body, contentType, status] of cases) {
    await assert.rejects(readVrm(new Request("https://example.com/api/render", {
      method: "POST", headers: { "Content-Type": contentType }, body,
    })), (error: unknown) => error instanceof ApiError && error.status === status);
  }
  for (const count of [0, 2]) {
    const form = new FormData();
    for (let i = 0; i < count; i++) form.append("file", new File([demo], "avatar.vrm"));
    await assert.rejects(readVrm(new Request("https://example.com/api/render", { method: "POST", body: form })),
      (error: unknown) => error instanceof ApiError && error.code === "missing_file");
  }
});

test("API rejects truncated GLB and oversized uploads even without Content-Length", async () => {
  await assert.rejects(readVrm(new Request("https://example.com/api/render", {
    method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: demo.subarray(0, demo.length - 1),
  })), (error: unknown) => error instanceof ApiError && error.code === "invalid_vrm");
  const stream = new ReadableStream({
    start(controller) {
      const chunk = new Uint8Array(1024 * 1024);
      for (let size = 0; size <= MAX_FILE_BYTES + chunk.length; size += chunk.length) controller.enqueue(chunk);
      controller.close();
    },
  });
  const request = new Request("https://example.com/api/render", {
    method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: stream, duplex: "half",
  } as RequestInit);
  await assert.rejects(readVrm(request), (error: unknown) => error instanceof ApiError && error.status === 413);
});
