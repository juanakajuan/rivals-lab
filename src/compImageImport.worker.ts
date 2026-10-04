import jsQR from "jsqr";
import { CompImageChunks } from "./compImagePayload";

interface Square {
  readonly left: number;
  readonly top: number;
  readonly size: number;
}

function white(data: Uint8ClampedArray, offset: number): boolean {
  return (
    (data[offset] ?? 0) > 235 &&
    (data[offset + 1] ?? 0) > 235 &&
    (data[offset + 2] ?? 0) > 235 &&
    (data[offset + 3] ?? 0) > 235
  );
}

function checkDimensions(width: number, height: number): void {
  if (
    !width ||
    !height ||
    width > 32000 ||
    height > 32000 ||
    width * height > 128_000_000
  )
    throw new Error(
      "This image is too large. Use the original comp export or a smaller screenshot.",
    );
}

async function checkImageFile(blob: Blob): Promise<void> {
  const bytes = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
  const data = new DataView(bytes.buffer);
  if (
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => bytes[index] === byte,
    )
  ) {
    if (bytes.length < 24) throw new Error("The PNG image is incomplete.");
    checkDimensions(data.getUint32(16), data.getUint32(20));
    return;
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    let offset = 2;
    while (offset + 4 <= blob.size) {
      const segment = new DataView(
        await blob.slice(offset, offset + 9).arrayBuffer(),
      );
      if (segment.getUint8(0) !== 255) break;
      const marker = segment.getUint8(1);
      if (marker === 255) {
        offset++;
        continue;
      }
      if (marker === 0x01) {
        offset += 2;
        continue;
      }
      if (marker < 0xc0 || (marker >= 0xd0 && marker <= 0xda)) break;
      const length = segment.getUint16(2);
      if (length < 2 || offset + length + 2 > blob.size) break;
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        if (length < 8) break;
        checkDimensions(segment.getUint16(7), segment.getUint16(5));
        return;
      }
      offset += length + 2;
    }
    throw new Error("The JPEG image header is incomplete or unsupported.");
  }

  if (
    bytes.length >= 30 &&
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP"
  ) {
    const kind = new TextDecoder().decode(bytes.subarray(12, 16));
    if (kind === "VP8X")
      checkDimensions(
        1 + (data.getUint32(24, true) & 0xffffff),
        1 + (data.getUint32(26, true) >>> 8),
      );
    else if (kind === "VP8L" && bytes[20] === 0x2f) {
      const dimensions = data.getUint32(21, true);
      checkDimensions(
        1 + (dimensions & 0x3fff),
        1 + ((dimensions >>> 14) & 0x3fff),
      );
    } else if (
      kind === "VP8 " &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    )
      checkDimensions(
        data.getUint16(26, true) & 0x3fff,
        data.getUint16(28, true) & 0x3fff,
      );
    return;
  }
  throw new Error("Choose a PNG, JPEG, or WebP comp image.");
}

async function readImage(blob: Blob): Promise<unknown> {
  await checkImageFile(blob);
  const image = await createImageBitmap(blob).catch(() => {
    throw new Error(
      "The image could not be read. Choose a complete PNG, JPEG, or WebP image.",
    );
  });
  try {
    checkDimensions(image.width, image.height);
    const canvas = new OffscreenCanvas(image.width, 128);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const crop = new OffscreenCanvas(1, 1);
    const cropContext = crop.getContext("2d", { willReadFrequently: true });
    if (!context || !cropContext)
      throw new Error("This browser cannot read comp images.");
    const squares: Square[] = [];
    const chunks = new CompImageChunks();
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
      const strip = context.getImageData(0, 0, image.width, height).data;
      for (let row = 0; row < height; row += 4) {
        let start = -1;
        for (let x = 0; x <= image.width; x++) {
          if (x < image.width && white(strip, (row * image.width + x) * 4)) {
            if (start < 0) start = x;
            continue;
          }
          if (start < 0) continue;
          const left = start;
          start = -1;
          const size = x - left;
          const y = top + row;
          if (
            size < 80 ||
            size > 1600 ||
            squares.some(
              (square) =>
                Math.abs(square.left - left) < 4 &&
                y >= square.top &&
                y <= square.top + square.size,
            )
          )
            continue;
          const columnTop = Math.max(0, y - size);
          const columnHeight = Math.min(size * 2 + 1, image.height - columnTop);
          crop.width = 1;
          crop.height = columnHeight;
          cropContext.drawImage(
            image,
            left + 2,
            columnTop,
            1,
            columnHeight,
            0,
            0,
            1,
            columnHeight,
          );
          const column = cropContext.getImageData(0, 0, 1, columnHeight).data;
          let first = y - columnTop;
          let last = first;
          while (first > 0 && white(column, (first - 1) * 4)) first--;
          while (last + 1 < columnHeight && white(column, (last + 1) * 4))
            last++;
          if (Math.abs(last - first + 1 - size) > 4) continue;
          const square = { left, top: columnTop + first, size };
          squares.push(square);
          if (squares.length > 700)
            throw new Error(
              "This image has too many code areas. Import one comp image at a time.",
            );
          const target = Math.min(800, size);
          crop.width = target;
          crop.height = target;
          cropContext.drawImage(
            image,
            left,
            square.top,
            size,
            size,
            0,
            0,
            target,
            target,
          );
          const pixels = cropContext.getImageData(0, 0, target, target);
          const code = jsQR(pixels.data, target, target, {
            inversionAttempts: "dontInvert",
          });
          if (code) chunks.add(code.binaryData);
        }
      }
    }
    return await chunks.read();
  } finally {
    image.close();
  }
}

self.onmessage = (event: MessageEvent<unknown>) => {
  if (!(event.data instanceof Blob)) {
    self.postMessage({ error: "Invalid comp image input." });
    return;
  }
  void readImage(event.data).then(
    (comp) => self.postMessage({ comp }),
    (error: unknown) =>
      self.postMessage({
        error:
          error instanceof Error
            ? error.message
            : "The image could not be read.",
      }),
  );
};
