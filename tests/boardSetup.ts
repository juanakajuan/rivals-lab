import { expect, type Page } from "@playwright/test";
import { initialBoard } from "../src/boardSession";
import {
  boardTokenId,
  clampToBoard,
  DEFAULT_ICON_SIZE,
  type BoardToken,
} from "../src/boardTokens";
import type { Team } from "../src/heroes";
import { encodeBoardRecord } from "../src/workspaceRecord";
import { boardPoint, DEFAULT_BOARD } from "./boardGeometry";

interface Placement {
  readonly heroId: string;
  readonly team: Team;
  /** Fraction of the map width. */
  readonly x: number;
  /** Fraction of the map height. */
  readonly y: number;
}

const EXAMPLE_PLACEMENTS: readonly Placement[] = [
  { heroId: "strange", team: "ally", x: 0.225, y: 0.665 },
  { heroId: "psylocke", team: "ally", x: 0.317, y: 0.535 },
  { heroId: "luna", team: "ally", x: 0.192, y: 0.795 },
  { heroId: "magneto", team: "enemy", x: 0.721, y: 0.474 },
  { heroId: "magik", team: "enemy", x: 0.8, y: 0.627 },
  { heroId: "rocket", team: "enemy", x: 0.758, y: 0.787 },
];

/**
 * Heroes for tests that need a populated board, in map pixels on the
 * default map. A new board is empty.
 */
export const EXAMPLE_FORMATION: readonly BoardToken[] = EXAMPLE_PLACEMENTS.map(
  ({ heroId, team, x, y }) => ({
    id: boardTokenId(team, heroId),
    heroId,
    team,
    ...clampToBoard(
      { x: x * DEFAULT_BOARD.width, y: y * DEFAULT_BOARD.height },
      DEFAULT_BOARD,
      DEFAULT_ICON_SIZE,
    ),
  }),
);

export function exampleToken(heroId: string): BoardToken {
  const token = EXAMPLE_FORMATION.find((item) => item.heroId === heroId);
  if (!token) throw new Error(`${heroId} is not in the example formation`);
  return token;
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
  const record = encodeBoardRecord(
    { ...initialBoard(), tokens: EXAMPLE_FORMATION },
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
