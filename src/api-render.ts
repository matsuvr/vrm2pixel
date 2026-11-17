import { SpriteEngine } from "./engine";

export interface RenderPage {
  upload: Uint8Array[];
  render: () => Promise<{ png?: string; error?: string }>;
}

declare global {
  interface Window {
    vrmRender: RenderPage;
  }
}

window.vrmRender = {
  upload: [],
  async render() {
    let engine: SpriteEngine | undefined;
    try {
      const chunks = window.vrmRender.upload;
      const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      window.vrmRender.upload = [];
      engine = new SpriteEngine();
      await engine.load(bytes.buffer, "avatar.vrm");
      const { sprites } = await engine.generate();
      return { png: sprites.sheet.toDataURL("image/png").split(",")[1]! };
    } catch {
      return { error: "The VRM could not be rendered. Check the model, humanoid bones and embedded textures." };
    } finally {
      engine?.dispose();
      window.vrmRender.upload = [];
    }
  },
};
