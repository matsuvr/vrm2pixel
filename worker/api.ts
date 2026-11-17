export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_FILE_BYTES + 1024 * 1024;

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export function apiError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function readBounded(request: Request): Promise<ArrayBuffer> {
  const length = Number(request.headers.get("Content-Length"));
  if (length > MAX_BODY_BYTES) throw new ApiError(413, "file_too_large", "Maximum VRM size is 25 MiB.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "missing_file", "A VRM file is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ApiError(413, "file_too_large", "Maximum VRM size is 25 MiB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

export async function readVrm(request: Request): Promise<ArrayBuffer> {
  const contentType = request.headers.get("Content-Type") ?? "";
  const mime = contentType.split(";", 1)[0]!.trim().toLowerCase();
  if (!["multipart/form-data", "application/octet-stream", "model/gltf-binary", "model/vrm"].includes(mime)) {
    throw new ApiError(415, "unsupported_media_type", "Use multipart/form-data (file field) or application/octet-stream.");
  }
  const body = await readBounded(request);
  let bytes = body;
  if (mime === "multipart/form-data") {
    let form: FormData;
    try {
      form = await new Response(body, { headers: { "Content-Type": contentType } }).formData();
    } catch {
      throw new ApiError(400, "invalid_multipart", "Malformed multipart/form-data body.");
    }
    const files = form.getAll("file");
    if (files.length !== 1 || typeof files[0] === "string" || !files[0]) {
      throw new ApiError(400, "missing_file", "Provide exactly one VRM in the file field.");
    }
    bytes = await files[0].arrayBuffer();
  }
  if (bytes.byteLength > MAX_FILE_BYTES) throw new ApiError(413, "file_too_large", "Maximum VRM size is 25 MiB.");
  if (bytes.byteLength < 20) throw new ApiError(400, "invalid_vrm", "Expected a binary VRM (GLB 2.0) file.");
  const header = new DataView(bytes);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== bytes.byteLength) {
    throw new ApiError(400, "invalid_vrm", "Expected a binary VRM (GLB 2.0) file.");
  }
  return bytes;
}
