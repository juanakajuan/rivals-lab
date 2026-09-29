// PNG encoding runs outside the page's idle-task queue.
globalThis.onmessage = async (event: MessageEvent<unknown>): Promise<void> => {
  const image = event.data;
  if (!(image instanceof ImageBitmap)) {
    postMessage("The image encoder received invalid image data.");
    return;
  }
  try {
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot encode an image.");
    context.drawImage(image, 0, 0);
    postMessage(await canvas.convertToBlob({ type: "image/png" }));
  } catch {
    postMessage("This browser could not create the PNG image.");
  } finally {
    image.close();
  }
};

export {};
