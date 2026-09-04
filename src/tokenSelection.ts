import Konva from 'konva';

const SELECTION_RING_NAME = 'selection-ring';
const SELECTED_STROKE = '#ffffff';

export function configureTokenSelection(
  group: Konva.Group,
  ring: Konva.Circle,
  tokenId: string,
  defaultStroke: string
): void {
  group.id(tokenId);
  ring.name(SELECTION_RING_NAME);
  ring.setAttr('defaultStroke', defaultStroke);
}

export function updateTokenSelection(
  container: Konva.Container,
  selectedTokenId: string | null
): void {
  for (const node of container.getChildren()) {
    if (!(node instanceof Konva.Group)) continue;

    const ring = node.findOne(`.${SELECTION_RING_NAME}`);
    if (!(ring instanceof Konva.Circle)) continue;

    const defaultStroke: unknown = ring.getAttr('defaultStroke');
    if (typeof defaultStroke !== 'string') continue;

    const isSelected = node.id() === selectedTokenId;
    ring.stroke(isSelected ? SELECTED_STROKE : defaultStroke);
    ring.strokeWidth(isSelected ? 4 : 3);
  }
}
