#!/usr/bin/env node
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { HELP, parseOptions } from "./options.mjs";
import { renderPng } from "./render.mjs";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

try {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
  } else if (options.version) {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    process.stdout.write(`${manifest.version}\n`);
  } else {
    const inputStat = await stat(options.input);
    if (!inputStat.isFile()) throw new Error(`Input is not a file: ${options.input}`);
    if (inputStat.size > MAX_FILE_BYTES) throw new Error("Maximum VRM size is 25 MiB.");
    const bytes = await readFile(options.input);
    if (bytes.length > MAX_FILE_BYTES) throw new Error("Maximum VRM size is 25 MiB.");
    if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length)
      throw new Error("Expected a binary VRM (GLB 2.0) file. The input may be damaged or truncated.");
    if (!options.force) {
      let exists = false;
      try { await access(options.output); exists = true; }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (exists) throw new Error(`Output already exists: ${options.output}. Use --force to replace it.`);
    }
    const png = await renderPng(bytes, options);
    await mkdir(path.dirname(options.output), { recursive: true });
    await writeFile(options.output, png, { flag: options.force ? "w" : "wx" });
    process.stdout.write(`${options.output}\n`);
  }
} catch (error) {
  process.stderr.write(`vrm-pixel: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
