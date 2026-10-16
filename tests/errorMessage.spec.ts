import { expect, test } from "@playwright/test";
import { errorMessage } from "../src/errorMessage";

test("error messages show the thrown message or a generic failure", () => {
  expect(errorMessage(new Error("Storage is full."))).toBe("Storage is full.");
  expect(errorMessage(new DOMException("Quota exceeded.", "QuotaError"))).toBe(
    "Quota exceeded.",
  );
  expect(errorMessage("Storage is full.")).toBe("The operation failed.");
  expect(errorMessage(undefined)).toBe("The operation failed.");
});
