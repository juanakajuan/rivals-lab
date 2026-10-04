import { parseCompSnapshot, type Comp } from "./comps";

const HEADER = 64;
const CHUNK_BYTES = 1500;
const MAX_BYTES = 1_000_000;
const MAGIC = [82, 86, 76, 67];
const INVALID =
  "The image codes are damaged or incomplete. Include the complete code area and try again.";

type DrawingContext =
  CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

async function collect(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > limit) throw new Error("The comp image data is too large.");
      parts.push(part.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

export async function createCompImageFooter(
  comp: Comp,
  width: number,
): Promise<{
  readonly height: number;
  readonly draw: (context: DrawingContext, top: number) => void;
}> {
  const source = new TextEncoder().encode(
    JSON.stringify(parseCompSnapshot(comp)),
  );
  if (source.length > MAX_BYTES)
    throw new Error("The comp image data is too large.");
  const zipped = await collect(
    new Blob([source]).stream().pipeThrough(new CompressionStream("gzip")),
    MAX_BYTES,
  );
  const codec = zipped.length < source.length ? 1 : 0;
  const bytes = codec === 1 ? zipped : source;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", source));
  const { create } = await import("qrcode");
  const count = Math.ceil(bytes.length / CHUNK_BYTES);
  const codes = Array.from({ length: count }, (_, index) => {
    const data = bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
    const chunk = new Uint8Array(HEADER + data.length);
    const header = new DataView(chunk.buffer);
    chunk.set(MAGIC);
    header.setUint8(4, 1);
    header.setUint8(5, codec);
    header.setUint16(6, index);
    header.setUint16(8, count);
    header.setUint32(12, bytes.length);
    header.setUint32(16, source.length);
    chunk.set(digest, 20);
    chunk.set(data, HEADER);
    return create([{ mode: "byte", data: chunk }], {
      errorCorrectionLevel: "Q",
    }).modules;
  });
  const size = Math.max(...codes.map((code) => (code.size + 8) * 4));
  const columns = Math.max(1, Math.floor((width - 60) / (size + 20)));
  const height = 100 + Math.ceil(count / columns) * (size + 20) + 20;
  return {
    height,
    draw(context, top) {
      context.fillStyle = "#f4f5f8";
      context.font = "600 24px sans-serif";
      context.fillText("Import this image into Rivals Lab", 40, top + 20);
      context.font = "20px sans-serif";
      context.fillText(
        "Include the complete code area when taking a screenshot.",
        40,
        top + 54,
      );
      codes.forEach((code, index) => {
        const left = 40 + (index % columns) * (size + 20);
        const y = top + 100 + Math.floor(index / columns) * (size + 20);
        const square = (code.size + 8) * 4;
        context.fillStyle = "#fff";
        context.fillRect(left, y, square, square);
        context.fillStyle = "#000";
        for (let row = 0; row < code.size; row++)
          for (let column = 0; column < code.size; column++)
            if (code.get(row, column))
              context.fillRect(
                left + (column + 4) * 4,
                y + (row + 4) * 4,
                4,
                4,
              );
      });
    },
  };
}

export class CompImageChunks {
  private readonly chunks = new Map<number, Uint8Array>();
  private packet: {
    readonly codec: number;
    readonly count: number;
    readonly length: number;
    readonly sourceLength: number;
    readonly digest: Uint8Array;
    readonly key: string;
  } | null = null;

  add(raw: readonly number[]): void {
    if (!MAGIC.every((byte, index) => raw[index] === byte)) return;
    if (raw.length < HEADER) throw new Error(INVALID);
    const bytes = new Uint8Array(raw);
    const header = new DataView(bytes.buffer);
    if (header.getUint8(4) !== 1)
      throw new Error("This comp image version is not supported.");
    const codec = header.getUint8(5);
    const index = header.getUint16(6);
    const count = header.getUint16(8);
    const length = header.getUint32(12);
    const sourceLength = header.getUint32(16);
    if (
      codec > 1 ||
      header.getUint16(10) !== 0 ||
      bytes.subarray(52, HEADER).some((byte) => byte !== 0) ||
      length < 1 ||
      length > MAX_BYTES ||
      sourceLength < 1 ||
      sourceLength > MAX_BYTES ||
      count !== Math.ceil(length / CHUNK_BYTES) ||
      index >= count ||
      bytes.length !==
        HEADER + Math.min(CHUNK_BYTES, length - index * CHUNK_BYTES)
    )
      throw new Error(INVALID);
    const digest = bytes.slice(20, 52);
    const key = [codec, count, length, sourceLength, ...digest].join(",");
    if (this.packet && this.packet.key !== key)
      throw new Error(
        "This image contains different comps. Import one complete comp image at a time.",
      );
    this.packet = { codec, count, length, sourceLength, digest, key };
    const data = bytes.slice(HEADER);
    const previous = this.chunks.get(index);
    if (
      previous &&
      (previous.length !== data.length ||
        previous.some((byte, offset) => byte !== data[offset]))
    )
      throw new Error(INVALID);
    this.chunks.set(index, data);
  }

  async read(): Promise<Comp> {
    const packet = this.packet;
    if (!packet)
      throw new Error(
        "No Rivals Lab comp codes were found. Use a new image export and include the complete code area.",
      );
    if (this.chunks.size !== packet.count) throw new Error(INVALID);
    const bytes = new Uint8Array(packet.length);
    for (const [index, data] of this.chunks)
      bytes.set(data, index * CHUNK_BYTES);
    const source =
      packet.codec === 1
        ? await collect(
            new Blob([bytes])
              .stream()
              .pipeThrough(new DecompressionStream("gzip")),
            packet.sourceLength,
          )
        : bytes;
    if (source.length !== packet.sourceLength) throw new Error(INVALID);
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", source),
    );
    if (digest.some((byte, index) => byte !== packet.digest[index]))
      throw new Error(INVALID);
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(source),
    );
    return parseCompSnapshot(value);
  }
}
