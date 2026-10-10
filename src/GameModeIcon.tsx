import { Flag, Merge, Truck, type LucideIcon } from "lucide-react";
import type { GameMode } from "./maps";

const GAME_MODE_ICONS: Readonly<Record<GameMode, LucideIcon>> = {
  Domination: Flag,
  Convoy: Truck,
  Convergence: Merge,
};

export function GameModeIcon({
  mode,
  size,
}: {
  readonly mode: GameMode;
  readonly size?: number;
}): React.JSX.Element {
  const Icon = GAME_MODE_ICONS[mode];
  return <Icon aria-hidden="true" {...(size === undefined ? {} : { size })} />;
}
