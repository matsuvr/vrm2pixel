import { parseArgs } from "node:util";
import path from "node:path";

export const HELP = `VRM Pixel Studio - local VRM to pixel PNG converter

Usage: vrm-pixel <model.vrm> [options]
       npm run cli -- <model.vrm> [options]

Options:
  -o, --output <file.png>  Output path (default: <model>-spritesheet.png beside input)
  -f, --force              Replace an existing output PNG
      --browser <exe>      Chrome/Edge executable (auto-detected by default)
      --timeout <seconds>  Render timeout, 1-3600 (default: 120)
  -h, --help               Show this help
  -v, --version            Show version

Generates a transparent 384x512 PNG: 64x64 pixels, 8 directions, 48 frames.
Requires Node.js >=22.12, Chrome or Edge, and assets built by npm run build.
Rendering is local; no API key or Cloudflare connection is needed.
VRM_PIXEL_BROWSER_PATH can also specify the browser executable.
On success, stdout contains the absolute output path. Errors go to stderr.
`;

export function parseOptions(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      output: { type: "string", short: "o" },
      force: { type: "boolean", short: "f", default: false },
      browser: { type: "string" },
      timeout: { type: "string", default: "120" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  if (values.help || values.version) return { help: values.help, version: values.version };
  if (positionals.length !== 1 || !positionals[0])
    throw new Error("Specify exactly one VRM file path. Use --help for examples.");
  if (!/^[0-9]+$/.test(values.timeout) || Number(values.timeout) < 1 || Number(values.timeout) > 3600)
    throw new Error("--timeout must be an integer from 1 to 3600 seconds.");
  const input = path.resolve(positionals[0]);
  if (path.extname(input).toLowerCase() !== ".vrm")
    throw new Error("Input must be a .vrm file.");
  const output = values.output === undefined
    ? path.join(path.dirname(input), `${path.parse(input).name}-spritesheet.png`)
    : path.resolve(values.output);
  if (path.extname(output).toLowerCase() !== ".png")
    throw new Error("--output must be a .png file path.");
  if (values.browser !== undefined && !values.browser.trim())
    throw new Error("--browser requires a Chrome/Edge executable path.");
  return { input, output, force: values.force, browser: values.browser, timeoutMs: Number(values.timeout) * 1000 };
}
