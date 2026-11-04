import type { Page } from "@playwright/test";
import { resolveBoardMap, type BoardMapDefinition } from "../src/boardMaps";
import { initialBoard } from "../src/boardSession";

export interface ClientPoint {
  readonly x: number;
  readonly y: number;
}

export interface BoardGeometry {
  readonly bounds: ClientPoint & {
    readonly width: number;
    readonly height: number;
  };
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

export const DEFAULT_BOARD: BoardMapDefinition = resolveBoardMap(
  initialBoard().map,
);

export function coordinatesText(point: ClientPoint): string {
  return `x ${point.x}, y ${point.y}`;
}

export async function boardGeometry(page: Page): Promise<BoardGeometry> {
  const host = page.locator(".stage-host").first();
  const bounds = await host.locator("canvas").first().boundingBox();
  if (!bounds) throw new Error("Missing board bounds");
  const width = Number(await host.getAttribute("data-map-width"));
  const height = Number(await host.getAttribute("data-map-height"));
  if (!width || !height) throw new Error("Missing board size");
  const scale = await host.evaluate(
    (element, map) =>
      Math.min(
        element.clientWidth / map.width,
        element.clientHeight / map.height,
      ),
    { width, height },
  );
  return { bounds, width, height, scale };
}

export async function boardPoint(
  page: Page,
  x: number,
  y: number,
): Promise<ClientPoint> {
  const { bounds, scale } = await boardGeometry(page);
  return { x: bounds.x + x * scale, y: bounds.y + y * scale };
}
