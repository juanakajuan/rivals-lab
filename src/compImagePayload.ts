import { parseCompSnapshot, type Comp } from "./comps";

const HEADER_BYTES = 48;
const MAX_BYTES = 1_000_000;
const MAGIC = [82, 86, 76, 83];
const GRAYS = [56, 104, 152, 200];
const GRAY_BITS = [0, 1, 3, 2];
const PARITY_POSITIONS = [1, 2, 4, 8];
const INVALID =
  "The comp image data is damaged or incomplete. Include the complete bottom strip and try again.";
const UNSUPPORTED = "This comp image version is not supported.";
const TOO_MANY =
  "This image has too many data areas. Import one comp image at a time.";

type DrawingContext =
  CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface Rail {
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

interface StripGeometry {
  readonly left: number;
  readonly top: number;
  readonly pitch: number;
  readonly columns: number;
}

function codeword(byte: number): number {
  let word = 0;
  let bit = 0;
  for (let position = 1; position <= 12; position++)
    if (!PARITY_POSITIONS.includes(position))
      word |= ((byte >> bit++) & 1) << (position - 1);
  for (const parity of PARITY_POSITIONS) {
    let value = 0;
    for (let position = 1; position <= 12; position++)
      if (position & parity) value ^= (word >> (position - 1)) & 1;
    word |= value << (parity - 1);
  }
  return word;
}

function byteFromCodeword(word: number): number {
  let syndrome = 0;
  for (const parity of PARITY_POSITIONS) {
    let value = 0;
    for (let position = 1; position <= 12; position++)
      if (position & parity) value ^= (word >> (position - 1)) & 1;
    if (value) syndrome |= parity;
  }
  if (syndrome > 12) throw new Error(INVALID);
  if (syndrome) word ^= 1 << (syndrome - 1);
  let byte = 0;
  let bit = 0;
  for (let position = 1; position <= 12; position++)
    if (!PARITY_POSITIONS.includes(position))
      byte |= ((word >> (position - 1)) & 1) << bit++;
  return byte;
}

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
    MAX_BYTES + 1024,
  );
  const codec = zipped.length < source.length ? 1 : 0;
  const body = codec === 1 ? zipped : source;
  const columns = Math.floor((width - 80) / 24) * 6;
  if (!Number.isInteger(width) || width > 16000 || columns < 288)
    throw new Error(
      "This build is too large for one image. Shorten the notes or use JSON export.",
    );
  const frame = new Uint8Array(HEADER_BYTES + body.length);
  const header = new DataView(frame.buffer);
  frame.set(MAGIC);
  header.setUint8(4, 1);
  header.setUint8(5, codec);
  header.setUint16(6, columns);
  header.setUint32(8, body.length);
  header.setUint32(12, source.length);
  frame.set(new Uint8Array(await crypto.subtle.digest("SHA-256", source)), 16);
  frame.set(body, HEADER_BYTES);
  const pitch = 4;
  const rows = Math.ceil((frame.length * 6) / columns);
  const height = 24 + (rows + 2) * pitch;
  const left = Math.floor((width - columns * pitch) / 2);
  return {
    height,
    draw(context, top) {
      context.save();
      context.fillStyle = "#08090a";
      context.fillRect(0, top, width, height);
      context.fillStyle = "#8a8f98";
      context.font = "14px system-ui, sans-serif";
      context.textBaseline = "top";
      context.textAlign = "left";
      context.fillText("Rivals Lab · keep this strip to import", left, top + 4);
      const y = top + 24;
      context.fillStyle = "rgb(48,112,144)";
      context.fillRect(left, y, columns * pitch, pitch);
      for (let column = 0; column < columns; column++) {
        const value = column < 16 ? (column % 2 ? 200 : 56) : 104;
        context.fillStyle = `rgb(${value},${value},${value})`;
        context.fillRect(left + column * pitch, y + pitch, pitch, pitch);
      }
      for (let index = 0; index < (rows * columns) / 6; index++) {
        const word = codeword(frame[index] ?? 0);
        for (let pair = 0; pair < 6; pair++) {
          const value =
            GRAYS[GRAY_BITS.indexOf((word >> (pair * 2)) & 3)] ?? 56;
          const cell = index * 6 + pair;
          context.fillStyle = `rgb(${value},${value},${value})`;
          context.fillRect(
            left + (cell % columns) * pitch,
            y + (2 + Math.floor(cell / columns)) * pitch,
            pitch,
            pitch,
          );
        }
      }
      context.restore();
    },
  };
}

function isRail(data: Uint8ClampedArray, offset: number): boolean {
  const red = data[offset] ?? 0;
  const green = data[offset + 1] ?? 0;
  const blue = data[offset + 2] ?? 0;
  return blue - red > 48 && green - red > 30 && blue - green > 12 && red < 100;
}

function grayLevel(data: Uint8ClampedArray, offset: number): number {
  const value =
    ((data[offset] ?? 0) + (data[offset + 1] ?? 0) + (data[offset + 2] ?? 0)) /
    3;
  return Math.max(0, Math.min(3, Math.round((value - 56) / 48)));
}

export async function readCompImageBitmap(image: ImageBitmap): Promise<Comp> {
  const canvas = new OffscreenCanvas(image.width, 128);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot read comp images.");
  const rails: Rail[] = [];
  let active: Rail[] = [];
  const finishRail = (rail: Rail, bottom: number): void => {
    if (bottom - rail.top > 8) return;
    rails.push(rail);
    if (rails.length > 32) throw new Error(TOO_MANY);
  };
  for (let top = 0; top < image.height; top += 128) {
    const height = Math.min(128, image.height - top);
    context.clearRect(0, 0, image.width, 128);
    context.drawImage(
      image,
      0,
      top,
      image.width,
      height,
      0,
      0,
      image.width,
      height,
    );
    const band = context.getImageData(0, 0, image.width, height).data;
    for (let row = 0; row < height; row++) {
      const y = top + row;
      const next: Rail[] = [];
      const continued = new Set<Rail>();
      let start = -1;
      for (let x = 0; x <= image.width; x++) {
        if (x < image.width && isRail(band, (row * image.width + x) * 4)) {
          if (start < 0) start = x;
          continue;
        }
        if (start < 0) continue;
        const left = start;
        start = -1;
        const width = x - left;
        if (width < 288) continue;
        const previous = active.find(
          (rail) =>
            Math.abs(rail.left - left) < 4 && Math.abs(rail.width - width) < 8,
        );
        if (previous) continued.add(previous);
        next.push(previous ?? { left, top: y, width });
      }
      for (const rail of active) if (!continued.has(rail)) finishRail(rail, y);
      active = next;
    }
  }
  for (const rail of active) finishRail(rail, image.height);

  let pixelsRead = 0;
  let candidates = 0;
  let failure = rails.length
    ? INVALID
    : "No Rivals Lab comp data was found. Use a new image export and include the complete bottom strip.";
  let recovered: { readonly comp: Comp; readonly key: string } | undefined;
  for (const rail of rails) {
    candidate: for (const pitch of [2, 4, 3, 1, 5, 6, 7, 8]) {
      for (const dx of [0, -1, 1, -2, 2]) {
        for (const dy of [0, -1, 1]) {
          const geometry: StripGeometry = {
            left: rail.left + dx,
            top: rail.top + dy,
            pitch,
            columns: Math.round(rail.width / pitch / 6) * 6,
          };
          const { left, top, columns } = geometry;
          const width = columns * pitch;
          if (
            columns < 288 ||
            columns > 4000 ||
            left < 0 ||
            top < 0 ||
            left + width > image.width ||
            top + 3 * pitch > image.height
          )
            continue;
          const calibrationWidth = 16 * pitch;
          const calibrationTop = Math.floor(top + 1.5 * pitch);
          pixelsRead += calibrationWidth;
          if (pixelsRead > 128_000_000) throw new Error(TOO_MANY);
          context.clearRect(0, 0, calibrationWidth, 1);
          context.drawImage(
            image,
            left,
            calibrationTop,
            calibrationWidth,
            1,
            0,
            0,
            calibrationWidth,
            1,
          );
          const calibration = context.getImageData(
            0,
            0,
            calibrationWidth,
            1,
          ).data;
          if (
            Array.from({ length: 16 }, (_, column) =>
              grayLevel(calibration, Math.floor((column + 0.5) * pitch) * 4),
            ).some((value, column) => value !== (column % 2 ? 3 : 0))
          )
            continue;
          if (++candidates > 64) throw new Error(TOO_MANY);
          let bandTop = -1;
          let bandHeight = 0;
          let band = new Uint8ClampedArray();
          const level = (column: number, row: number): number => {
            const x = Math.floor((column + 0.5) * pitch);
            const y = Math.floor(top + (row + 0.5) * pitch);
            if (y < bandTop || y >= bandTop + bandHeight) {
              bandTop = y;
              bandHeight = Math.min(128, image.height - y);
              pixelsRead += width * bandHeight;
              if (pixelsRead > 128_000_000) throw new Error(TOO_MANY);
              if (canvas.width !== width) canvas.width = width;
              context.clearRect(0, 0, width, 128);
              context.drawImage(
                image,
                left,
                y,
                width,
                bandHeight,
                0,
                0,
                width,
                bandHeight,
              );
              band = context.getImageData(0, 0, width, bandHeight).data;
            }
            const offset = ((y - bandTop) * width + x) * 4;
            return grayLevel(band, offset);
          };
          const sample = (size: number): Uint8Array<ArrayBuffer> => {
            const rows = Math.ceil((size * 6) / columns);
            if (top + (rows + 2) * pitch > image.height)
              throw new Error(INVALID);
            const bytes = new Uint8Array(size);
            for (let index = 0; index < size; index++) {
              let word = 0;
              for (let pair = 0; pair < 6; pair++) {
                const cell = index * 6 + pair;
                word |=
                  (GRAY_BITS[
                    level(cell % columns, 2 + Math.floor(cell / columns))
                  ] ?? 0) <<
                  (pair * 2);
              }
              bytes[index] = byteFromCodeword(word);
            }
            return bytes;
          };
          let comp: Comp;
          try {
            const headerBytes = sample(HEADER_BYTES);
            if (!MAGIC.every((byte, index) => headerBytes[index] === byte))
              continue;
            if (headerBytes[4] !== 1) {
              failure = UNSUPPORTED;
              continue;
            }
            const header = new DataView(headerBytes.buffer);
            const codec = header.getUint8(5);
            const length = header.getUint32(8);
            const sourceLength = header.getUint32(12);
            if (
              codec > 1 ||
              header.getUint16(6) !== columns ||
              length < 1 ||
              length > MAX_BYTES ||
              sourceLength < 1 ||
              sourceLength > MAX_BYTES ||
              (codec === 0 && length !== sourceLength)
            )
              continue;
            const body = sample(HEADER_BYTES + length).slice(HEADER_BYTES);
            const source =
              codec === 1
                ? await collect(
                    new Blob([body])
                      .stream()
                      .pipeThrough(new DecompressionStream("gzip")),
                    sourceLength,
                  )
                : body;
            if (source.length !== sourceLength) continue;
            const digest = new Uint8Array(
              await crypto.subtle.digest("SHA-256", source),
            );
            if (digest.some((byte, index) => byte !== headerBytes[16 + index]))
              continue;
            const value: unknown = JSON.parse(
              new TextDecoder("utf-8", { fatal: true }).decode(source),
            );
            comp = parseCompSnapshot(value);
          } catch (error) {
            if (error instanceof Error && error.message === TOO_MANY)
              throw error;
            continue;
          }
          const key = JSON.stringify(comp);
          if (recovered && recovered.key !== key)
            throw new Error(
              "This image contains different comps. Import one complete comp image at a time.",
            );
          recovered = { comp, key };
          break candidate;
        }
      }
    }
  }
  if (recovered) return recovered.comp;
  throw new Error(failure);
}
