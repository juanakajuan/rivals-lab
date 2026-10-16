export const NEWER_RECORD_MESSAGE =
  "This data was saved by a newer version of Rivals Lab. Reload the page to update.";

export class NewerRecordError extends Error {
  constructor() {
    super(NEWER_RECORD_MESSAGE);
    this.name = "NewerRecordError";
  }
}

export function storedVersion(value: unknown, current: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
    throw new Error("Unknown saved data version.");
  if (value > current) throw new NewerRecordError();
  return value;
}
