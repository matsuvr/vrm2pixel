import puppeteer from "@cloudflare/puppeteer";
import { ApiError, apiError, readVrm } from "./api";
import { timingSafeEqual, createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import type {} from "../src/api-render";

const RENDER_ORIGIN = "https://vrm-render.invalid";
const RENDER_TIMEOUT_MS = 120_000;

async function renderPng(bytes: ArrayBuffer, env: Env): Promise<Uint8Array<ArrayBuffer>> {
  const launch = () => puppeteer.launch(env.BROWSER, { keep_alive: 180_000 });
  const browser = await launch().catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    // Free accounts allow one launch every 20 seconds. Retry once while the
    // caller's request is still alive; daily quota exhaustion needs a later call.
    if (!/\b429\b/.test(message) || /time limit|for today|daily/i.test(message)) throw error;
    console.info(JSON.stringify({ event: "browser_launch_retry" }));
    await new Promise((resolve) => setTimeout(resolve, 21_000));
    return launch();
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      void (async () => {
        const url = new URL(request.url());
        if (url.origin !== RENDER_ORIGIN || (url.pathname !== "/render.html" && !url.pathname.startsWith("/assets/"))) {
          await request.abort();
          return;
        }
        const asset = await env.ASSETS.fetch(new Request(url));
        await request.respond({
          status: asset.status,
          headers: {
            "content-type": asset.headers.get("Content-Type") ?? "application/octet-stream",
            "content-security-policy": "default-src 'none'; script-src 'self'; img-src blob: data:; connect-src 'none'; base-uri 'none'",
          },
          body: new Uint8Array(await asset.arrayBuffer()),
        });
      })().catch(() => request.abort().catch(() => undefined));
    });
    const render = async (): Promise<Uint8Array<ArrayBuffer>> => {
      await page.goto(`${RENDER_ORIGIN}/render.html`, { waitUntil: "load" });
      await page.waitForFunction(() => Boolean(window.vrmRender));
      // Transfer bounded chunks: avoid a full-file base64 copy in the Worker.
      const input = new Uint8Array(bytes);
      for (let offset = 0; offset < input.length; offset += 192 * 1024) {
        const chunk = Buffer.from(input.buffer, input.byteOffset + offset, Math.min(192 * 1024, input.length - offset)).toString("base64");
        await page.evaluate((encoded) => {
          window.vrmRender.upload.push(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)));
        }, chunk);
      }
      const result = await page.evaluate(() => window.vrmRender.render());
      if (!result.png) throw new ApiError(422, "render_failed", result.error ?? "Unable to render this VRM.");
      return Uint8Array.from(atob(result.png), (char) => char.charCodeAt(0));
    };
    return await Promise.race([
      render(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ApiError(504, "render_timeout", "Rendering exceeded 120 seconds.")), RENDER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    await browser.close().catch(() => undefined);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path !== "/api" && !path.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (!env.API_KEY) return apiError(503, "api_not_configured", "API_KEY is not configured.");
    const match = /^Bearer (\S+)$/i.exec(request.headers.get("Authorization") ?? "");
    const hash = (value: string) => createHash("sha256").update(value).digest();
    if (!match || !timingSafeEqual(hash(match[1]!), hash(env.API_KEY))) {
      const response = apiError(401, "unauthorized", "A valid Bearer API key is required.");
      response.headers.set("WWW-Authenticate", 'Bearer realm="vrm-pixel-studio"');
      return response;
    }
    if (path !== "/api/render") return apiError(404, "not_found", "Unknown API endpoint.");
    if (request.method !== "POST") {
      const response = apiError(405, "method_not_allowed", "Use POST /api/render.");
      response.headers.set("Allow", "POST");
      return response;
    }
    try {
      const bytes = await readVrm(request);
      const png = await renderPng(bytes, env);
      return new Response(png, {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": 'attachment; filename="spritesheet.png"',
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      if (error instanceof ApiError) return apiError(error.status, error.code, error.message);
      // Do not log uploaded models, request headers, or browser error details.
      const status = error instanceof Error ? /code: (\d{3})/.exec(error.message)?.[1] : undefined;
      console.error(JSON.stringify({ event: "render_unavailable", serviceStatus: status }));
      return apiError(503, "render_unavailable", "The rendering service is unavailable. Please retry later.");
    }
  },
} satisfies ExportedHandler<Env>;
