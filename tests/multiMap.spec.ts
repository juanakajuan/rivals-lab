import { expect, test, type Page } from "@playwright/test";
import { BoardSession } from "../src/boardSession";
import { applyCompEdit } from "../src/compEdits";
import {
  emptyComp,
  parseCompLibrary,
  serializeCompLibrary,
} from "../src/comps";

const measureNote = () => ({ width: 180, height: 36 });
const wakanda = { kind: "builtin", id: "birnin-tchalla-domination" } as const;
const hydra = { kind: "builtin", id: "hells-heaven-domination" } as const;

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

test("each map tab keeps its own hero positions", () => {
  const session = new BoardSession(measureNote);
  const state = session.selectMaps([wakanda, hydra]);
  expect(state.maps.map((map) => map.id)).toEqual([wakanda.id, hydra.id]);
  session.moveToken({ id: "ally-strange", point: { x: 500, y: 300 } });
  const second = session.setActiveMap(hydra.id);
  expect(second.map.id).toBe(hydra.id);
  expect(
    second.tokens.find((token) => token.id === "ally-strange"),
  ).toMatchObject({ x: 500, y: 300 });
  session.moveToken({ id: "ally-strange", point: { x: 200, y: 200 } });
  const first = session.setActiveMap(wakanda.id);
  expect(
    first.tokens.find((token) => token.id === "ally-strange"),
  ).toMatchObject({ x: 500, y: 300 });
  expect(
    session
      .setActiveMap(hydra.id)
      .tokens.find((token) => token.id === "ally-strange"),
  ).toMatchObject({ x: 200, y: 200 });
  const removed = session.removeToken("ally-strange");
  expect(removed.tokens.some((token) => token.id === "ally-strange")).toBe(
    false,
  );
  expect(JSON.stringify(removed.positionsByMap)).not.toContain("ally-strange");
});

test("a game mode clears maps, and maps clear the mode", () => {
  const session = new BoardSession(measureNote);
  session.selectMaps([wakanda, hydra]);
  const mode = session.selectMode("Convoy");
  expect(mode).toMatchObject({ mode: "Convoy", maps: [], positionsByMap: {} });
  expect(mode.tokens).toHaveLength(6);
  const maps = session.selectMaps([hydra]);
  expect(maps).toMatchObject({ mode: null, map: hydra });
  expect(session.undo().mode).toBe("Convoy");
});

test("opening a multi-map comp gives every map a formation", () => {
  const session = new BoardSession(measureNote);
  const comp = {
    ...emptyComp(),
    teams: {
      ...emptyComp().teams,
      ally: [{ heroId: "luna", notes: "" }, ...emptyComp().teams.ally.slice(1)],
    },
  };
  const opened = session.openComp({ comp, mapIds: [wakanda.id, hydra.id] });
  expect(opened.maps).toHaveLength(2);
  expect(opened.positionsByMap[hydra.id]?.["ally-luna"]).toBeDefined();
  const mode = session.openComp({
    comp: { ...comp, gameMode: "Domination" },
    mapIds: [],
  });
  expect(mode).toMatchObject({ mode: "Domination", maps: [] });
});

async function openPicker(page: Page, trigger: string, title: string) {
  await page.getByRole("button", { name: trigger, exact: true }).click();
  return page.getByRole("dialog", { name: title, exact: true });
}

test("the board shows tabs for several maps and a hint for a game mode", async ({
  page,
}) => {
  await page.goto("/");
  let dialog = await openPicker(page, "Choose map", "Choose map");
  await dialog.getByRole("button", { name: "Select several maps" }).click();
  await dialog
    .getByRole("button", { name: "Hell’s Heaven" })
    .or(dialog.getByRole("button", { name: /Hell's Heaven|Hell’s Heaven/ }))
    .first()
    .click();
  await dialog.getByRole("button", { name: /Use 2 maps/ }).click();
  const tabs = page.getByRole("tablist", { name: "Maps" });
  await expect(tabs.getByRole("tab")).toHaveCount(2);
  await expect(tabs.getByRole("tab").first()).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await tabs.getByRole("tab").nth(1).click();
  await expect(tabs.getByRole("tab").nth(1)).toHaveAttribute(
    "aria-selected",
    "true",
  );

  dialog = await openPicker(page, "Choose map", "Choose map");
  await dialog.getByRole("button", { name: "Convoy", exact: true }).click();
  await expect(tabs).toHaveCount(0);
  await expect(page.getByText("Pick a map to place positions.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Convoy game mode",
  );
  await expect(page.locator(".board-shell")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Move", exact: true }),
  ).toHaveCount(0);

  dialog = await openPicker(page, "Choose map", "Choose map");
  await dialog
    .getByRole("button", { name: "Museum of Contemplation", exact: true })
    .click();
  await expect(page.getByText("Pick a map to place positions.")).toHaveCount(0);
  await expect(page.locator(".board-shell")).toBeVisible();
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
  await dialog.getByRole("button", { name: "Select several maps" }).click();
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
