import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseOptions } from "../cli/options.mjs";
import { findBrowser } from "../cli/render.mjs";

test("CLI resolves Unicode/space paths and sensible output defaults", () => {
  const input = path.resolve("models", "日本語 avatar.VRM");
  const defaults = parseOptions([input]);
  assert.equal(defaults.input, input);
  assert.equal(defaults.output, path.join(path.dirname(input), "日本語 avatar-spritesheet.png"));
  assert.equal(defaults.timeoutMs, 120_000);
  assert.equal(defaults.force, false);
  const custom = parseOptions([input, "-o", "images/my sprite.png", "--force", "--timeout", "60", "--browser", "C:/Chrome/chrome.exe"]);
  assert.equal(custom.output, path.resolve("images/my sprite.png"));
  assert.equal(custom.force, true);
  assert.equal(custom.timeoutMs, 60_000);
  assert.equal(custom.browser, "C:/Chrome/chrome.exe");
});

test("CLI rejects ambiguous inputs and invalid output, timeout and browser options", () => {
  for (const args of [[], ["a.vrm", "b.vrm"], ["a.glb"], ["a.vrm", "--output", "a.vrm"],
    ["a.vrm", "--output", ""], ["a.vrm", "--browser", ""], ["a.vrm", "--unknown"],
    ...["0", "-1", "1.5", "NaN", "Infinity", "3601"].map((value) => ["a.vrm", `--timeout=${value}`])]) {
    assert.throws(() => parseOptions(args), undefined, JSON.stringify(args));
  }
  assert.equal(parseOptions(["--help"]).help, true);
  assert.equal(parseOptions(["--version"]).version, true);
});

test("CLI reports an explicit missing browser instead of silently selecting another", async () => {
  await assert.rejects(findBrowser(path.resolve("no-such-browser", "chrome.exe")), /executable not found/);
});

test("CLI help and version work from a different working directory", () => {
  const entry = fileURLToPath(new URL("../cli/index.mjs", import.meta.url));
  for (const [flag, expected] of [["--help", /Usage: vrm-pixel/], ["--version", /^1\.0\.0\r?\n$/]]) {
    const result = spawnSync(process.execPath, [entry, flag], { cwd: path.parse(entry).root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, expected);
    assert.equal(result.stderr, "");
  }
});
