import type { ReactNode } from "react";

interface ContextMenuPosition {
  readonly x: number;
  readonly y: number;
}

export function contextMenuPosition(
  clientX: number,
  clientY: number,
): ContextMenuPosition {
  return {
    x: Math.max(8, Math.min(clientX, window.innerWidth - 168)),
    y: Math.max(8, Math.min(clientY, window.innerHeight - 52)),
  };
}

export function ContextMenu({
  position,
  label,
  children,
}: {
  readonly position: ContextMenuPosition;
  readonly label: string;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      className="token-context-menu"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}
