import { expect, type Page } from "@playwright/test";
import { resolveBoardMap } from "../src/boardMaps";
import { initialBoard } from "../src/boardSession";
import {
  boardTokenId,
  clampToBoard,
  DEFAULT_ICON_SIZE,
} from "../src/boardTokens";
import type { Team } from "../src/heroes";
import { encodeBoardRecord } from "../src/workspaceRecord";

interface Placement {
  readonly heroId: string;
  readonly team: Team;
  readonly x: number;
  readonly y: number;
}

/** Heroes for tests that need a populated board. A new board is empty. */
export const EXAMPLE_FORMATION: readonly Placement[] = [
  { heroId: "strange", team: "ally", x: 270, y: 435 },
  { heroId: "psylocke", team: "ally", x: 380, y: 350 },
  { heroId: "luna", team: "ally", x: 230, y: 520 },
  { heroId: "magneto", team: "enemy", x: 865, y: 310 },
  { heroId: "magik", team: "enemy", x: 960, y: 410 },
  { heroId: "rocket", team: "enemy", x: 910, y: 515 },
];

export async function boardPoint(
  page: Page,
  x: number,
  y: number,
): Promise<{ readonly x: number; readonly y: number }> {
  const bounds = await page.locator(".stage-host canvas").first().boundingBox();
  if (!bounds) throw new Error("Missing board bounds");
  const scale = bounds.width / 1200;
  return { x: bounds.x + x * scale, y: bounds.y + y * scale };
}

export async function dropHero(
  page: Page,
  heroId: string,
  x: number,
  y: number,
  team: Team = "ally",
): Promise<void> {
  const point = await boardPoint(page, x, y);
  const dataTransfer = await page.evaluateHandle(
    ({ heroId, team }) => {
      const data = new DataTransfer();
      data.setData("application/x-rivals-hero", heroId);
      data.setData("application/x-rivals-team", team);
      return data;
    },
    { heroId, team },
  );
  await page.locator(".stage-host canvas").first().dispatchEvent("drop", {
    dataTransfer,
    clientX: point.x,
    clientY: point.y,
  });
  await dataTransfer.dispose();
}

export async function clickToken(
  page: Page,
  x: number,
  y: number,
  button: "left" | "right" = "left",
): Promise<void> {
  // Canvas hit regions update on the next animation frame.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  const point = await boardPoint(page, x, y);
  await page.mouse.click(point.x, point.y, { button });
}

/**
 * Stores EXAMPLE_FORMATION as the saved board, then opens the board at `path`.
 * The test starts with exact positions, no edit history, and no selection.
 */
export async function openExampleBoard(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  // The app creates the database before it shows the board.
  await expect(page.locator(".stage-host canvas").first()).toBeVisible();
  const board = initialBoard();
  const map = resolveBoardMap(board.map);
  const record = encodeBoardRecord(
    {
      ...board,
      tokens: EXAMPLE_FORMATION.map(({ heroId, team, x, y }) => ({
        id: boardTokenId(team, heroId),
        heroId,
        team,
        ...clampToBoard({ x, y }, map, DEFAULT_ICON_SIZE),
      })),
    },
    DEFAULT_ICON_SIZE,
  );
  await page.evaluate(
    (record) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("rivals-lab");
        opening.onerror = () =>
          reject(opening.error ?? new Error("The database could not open."));
        opening.onsuccess = () => {
          const database = opening.result;
          const transaction = database.transaction("workspace", "readwrite");
          transaction.objectStore("workspace").put(record, "board");
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onabort = () => {
            database.close();
            reject(transaction.error ?? new Error("The board write failed."));
          };
        };
      }),
    record,
  );
  await page.reload();
  await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
    "Allies 3",
  );
  await expect(page.getByRole("button", { name: /^Opponents/ })).toHaveText(
    "Opponents 3",
  );
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
}
