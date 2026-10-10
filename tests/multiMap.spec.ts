import { expect, test } from "@playwright/test";
import { applyCompEdit } from "../src/compEdits";
import {
  emptyComp,
  parseCompLibrary,
  serializeCompLibrary,
} from "../src/comps";

function libraryWith(comp: unknown): string {
  return JSON.stringify({
    version: 1,
    comps: [{ id: "a", updatedAt: "2026-10-01T00:00:00Z", comp }],
  });
}

test("a comp with a single legacy map keeps working", () => {
  const rest: Record<string, unknown> = { ...emptyComp() };
  delete rest["mapIds"];
  delete rest["gameMode"];
  const [entry] = parseCompLibrary(
    libraryWith({ ...rest, name: "Old", mapId: "midtown" }),
  );
  expect(entry?.comp.mapIds).toEqual(["midtown"]);
  expect(entry?.comp.gameMode).toBeNull();
  const [none] = parseCompLibrary(
    libraryWith({ ...rest, name: "Old", mapId: null }),
  );
  expect(none?.comp.mapIds).toEqual([]);
});

test("a comp saves several maps or a game mode, never both", () => {
  const base = { ...emptyComp(), name: "Plan" };
  const several = applyCompEdit(base, {
    kind: "maps",
    mapIds: ["midtown", "thebes", "midtown"],
  });
  expect(several.mapIds).toEqual(["midtown", "thebes"]);
  const mode = applyCompEdit(several, { kind: "gameMode", mode: "Convoy" });
  expect(mode).toMatchObject({ mapIds: [], gameMode: "Convoy" });
  const back = applyCompEdit(mode, { kind: "maps", mapIds: ["krakoa"] });
  expect(back).toMatchObject({ mapIds: ["krakoa"], gameMode: null });
  for (const comp of [several, mode])
    expect(
      parseCompLibrary(
        serializeCompLibrary([
          { id: "a", updatedAt: "2026-10-01T00:00:00Z", comp },
        ]),
      )[0]?.comp,
    ).toEqual(comp);
  expect(() =>
    parseCompLibrary(
      libraryWith({ ...base, mapIds: ["midtown"], gameMode: "Convoy" }),
    ),
  ).toThrow("game mode and specific maps");
  expect(() =>
    parseCompLibrary(libraryWith({ ...base, gameMode: "Payload" })),
  ).toThrow("Unknown game mode");
  expect(() =>
    parseCompLibrary(libraryWith({ ...base, mapIds: ["midtown", "midtown"] })),
  ).toThrow("twice");
  expect(() =>
    applyCompEdit(base, { kind: "maps", mapIds: ["nowhere"] }),
  ).toThrow("Unknown map");
});

test("the comp builder shows several maps and a game mode and lists them when saved", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: "Draft / Comp Builder", exact: true })
    .click();
  await page.getByLabel("Comp name", { exact: true }).fill("Prep");
  await page.getByRole("button", { name: "Comp map", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Choose comp map",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Select multiple maps" }).click();
  for (const name of ["Midtown", "Thebes"])
    await dialog.getByRole("button", { name, exact: true }).click();
  await dialog.getByRole("button", { name: /Use 2 maps/ }).click();
  await expect(page.locator(".selected-map-preview figcaption")).toHaveText(
    "Midtown, Thebes",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".saved-comp-map")).toHaveText(
    /2 maps · Midtown, Thebes/,
  );

  await page.getByRole("button", { name: "Comp map", exact: true }).click();
  await dialog.getByRole("button", { name: "Domination", exact: true }).click();
  await expect(page.locator(".selected-map-preview figcaption")).toHaveText(
    /Domination/,
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".saved-comp-map")).toHaveText(/Domination/);
  await page.reload();
  await page.getByRole("button", { name: "Load Prep", exact: true }).click();
  await expect(page.locator(".selected-map-preview figcaption")).toHaveText(
    /Domination/,
  );
});
