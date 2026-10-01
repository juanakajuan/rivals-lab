import type { HeroSelection, Team } from "./heroes";

export interface BoardToken extends HeroSelection {
  readonly id: string;
  readonly team: Team;
  readonly x: number;
  readonly y: number;
}

export const TOKEN_RADIUS = 22;

export function tokenBoundary(iconSize: number): number {
  // Include the selected ring, which is the widest visible token outline.
  return Math.ceil(((TOKEN_RADIUS + 2) * iconSize) / 100);
}

export function clampToBoard(
  value: number,
  maximum: number,
  iconSize: number,
): number {
  const boundary = tokenBoundary(iconSize);
  return Math.round(Math.max(boundary, Math.min(maximum - boundary, value)));
}
