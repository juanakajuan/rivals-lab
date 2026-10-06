import {
  HERO_BY_ID,
  isDeadpoolRole,
  type HeroSelection,
  type Team,
} from "./heroes";

export interface BoardToken extends HeroSelection {
  readonly id: string;
  readonly team: Team;
  readonly x: number;
  readonly y: number;
}

export const TOKEN_RADIUS = 22;

export const ICON_SIZES = [
  50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150,
] as const;
export type IconSize = (typeof ICON_SIZES)[number];
export const DEFAULT_ICON_SIZE: IconSize = 100;

export function parseIconSize(value: unknown): IconSize {
  const size = ICON_SIZES.find((candidate) => candidate === value);
  if (size === undefined) throw new Error("Invalid hero icon size.");
  return size;
}

function coordinate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("Invalid hero position.");
  return value;
}

export function decodeToken(value: unknown): BoardToken {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid hero token.");
  const token: Partial<Record<string, unknown>> = value;
  const { id, heroId, team, deadpoolRole } = token;
  if (typeof heroId !== "string" || !HERO_BY_ID.has(heroId))
    throw new Error(`Unknown hero: ${String(heroId)}.`);
  if (team !== "ally" && team !== "enemy")
    throw new Error("Invalid hero team.");
  if (id !== `${team}-${heroId}`) throw new Error("Invalid hero token ID.");
  if (
    deadpoolRole !== undefined &&
    (heroId !== "deadpool" || !isDeadpoolRole(deadpoolRole))
  )
    throw new Error("Invalid Deadpool role.");
  return {
    id,
    heroId,
    team,
    ...(deadpoolRole === undefined ? {} : { deadpoolRole }),
    x: coordinate(token.x),
    y: coordinate(token.y),
  };
}

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
