import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const DIST_DIRECTORY = fileURLToPath(new URL("../dist/", import.meta.url));
const RENDER_ORIGIN = "https://vrm-render.invalid";
const CHUNK_BYTES = 192 * 1024;
const CONTENT_SECURITY_POLICY = "default-src 'none'; script-src 'self'; img-src blob: data:; connect-src 'none'; base-uri 'none'";
// Select the CPU-backed ANGLE driver explicitly: headless Windows hosts may
// expose an unusable GPU instead of falling back automatically.
// https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/swiftshader.md
export const HEADLESS_BROWSER_ARGS = Object.freeze([
  "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  "--disable-background-networking", "--disable-component-update",
]);

export async function findBrowser(explicitPath) {
  const configured = explicitPath ?? process.env.VRM_PIXEL_BROWSER_PATH;
  const candidates = configured !== undefined ? [path.resolve(configured)] : process.platform === "win32"
    ? ["Google/Chrome/Application/chrome.exe", "Microsoft/Edge/Application/msedge.exe"]
      .flatMap((executable) => [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]
        .filter(Boolean).map((base) => path.join(base, executable)))
    : process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      if ((await stat(candidate)).isFile()) return candidate;
    } catch { /* Try the next installation location. */ }
  }
  throw new Error(configured !== undefined
    ? `Chrome/Edge executable not found: ${configured}`
    : "Chrome/Edge was not found. Install either browser, or specify --browser <exe> / VRM_PIXEL_BROWSER_PATH.");
}

/** Serve the exact same built render page used by the Worker, entirely in memory. */
export async function openRenderPage(browser, timeoutMs) {
  const page = await browser.newPage();
  page.setDefaultTimeout(timeoutMs);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    void (async () => {
      const url = new URL(request.url());
      if (url.origin !== RENDER_ORIGIN || (url.pathname !== "/render.html" && !url.pathname.startsWith("/assets/"))) {
        await request.abort();
        return;
      }
      const filename = path.resolve(DIST_DIRECTORY, `.${decodeURIComponent(url.pathname)}`);
      const relative = path.relative(DIST_DIRECTORY, filename);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        await request.abort();
        return;
      }
      const body = await readFile(filename);
      const contentType = filename.endsWith(".html") ? "text/html; charset=utf-8"
        : filename.endsWith(".js") ? "text/javascript; charset=utf-8"
          : filename.endsWith(".css") ? "text/css; charset=utf-8" : "application/octet-stream";
      if (!request.isInterceptResolutionHandled()) {
        await request.respond({ status: 200, headers: { "content-type": contentType, "content-security-policy": CONTENT_SECURITY_POLICY }, body });
      }
    })().catch(() => {
      if (!request.isInterceptResolutionHandled()) void request.abort().catch(() => undefined);
    });
  });
  await page.goto(`${RENDER_ORIGIN}/render.html`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.vrmRender));
  return page;
}

export async function renderPng(bytes, { browser: browserPath, timeoutMs = 120_000 } = {}) {
  try {
    await access(path.join(DIST_DIRECTORY, "render.html"));
  } catch {
    throw new Error("Built engine assets are missing. Run npm run build in the VRM Pixel Studio folder first.");
  }
  const executablePath = await findBrowser(browserPath);
  const browser = await puppeteer.launch({
    executablePath,
    browser: "chrome",
    headless: true,
    // A private, temporary browser profile is created and removed by Puppeteer.
    args: [...HEADLESS_BROWSER_ARGS],
    timeout: Math.min(timeoutMs, 30_000),
    protocolTimeout: timeoutMs,
  }).catch((error) => {
    throw new Error(`Could not start ${path.basename(executablePath)} in headless mode. Install/update Chrome or specify --browser <chrome.exe>.\n${error.message}`);
  });
  let timer;
  try {
    const render = async () => {
      const page = await openRenderPage(browser, timeoutMs);
      for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
        const chunk = bytes.subarray(offset, offset + CHUNK_BYTES).toString("base64");
        await page.evaluate((encoded) => {
          window.vrmRender.upload.push(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)));
        }, chunk);
      }
      const result = await page.evaluate(() => window.vrmRender.render());
      if (!result.png) throw new Error(result.error ?? "The VRM could not be rendered.");
      return Buffer.from(result.png, "base64");
    };
    return await Promise.race([
      render(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Rendering exceeded ${timeoutMs / 1000} seconds.`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    await browser.close().catch(() => browser.process()?.kill());
  }
}
