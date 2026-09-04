import Konva from 'konva';

interface TokenDragLifecycleOptions {
  readonly onSelect: () => void;
  readonly onDragStart: () => void;
  readonly onDragEnd: (x: number, y: number) => void;
}

export function bindTokenDragLifecycle(
  group: Konva.Group,
  { onSelect, onDragStart, onDragEnd }: TokenDragLifecycleOptions
): void {
  group.on('dragstart', () => {
    onSelect();
    onDragStart();
  });
  group.on('dragend', () => {
    onDragEnd(Math.round(group.x()), Math.round(group.y()));
  });
}
