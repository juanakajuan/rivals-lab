import { readCompImageBitmap } from "./compImagePayload";

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
    return await readCompImageBitmap(image);
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
