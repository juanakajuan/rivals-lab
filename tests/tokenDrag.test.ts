import assert from 'node:assert/strict';
import test from 'node:test';
import Konva from 'konva';

import { bindTokenDragLifecycle } from '../src/tokenDrag.ts';

test('selects a token when its drag starts', () => {
  const group = new Konva.Group({ x: 120, y: 180 });
  let selectionCount = 0;
  let moveCount = 0;

  bindTokenDragLifecycle(group, {
    onSelect: () => {
      selectionCount += 1;
    },
    onDragStart: () => undefined,
    onDragEnd: () => {
      moveCount += 1;
    }
  });

  group.fire('dragstart');

  assert.equal(selectionCount, 1);
  assert.equal(moveCount, 0);

  group.fire('dragend');

  assert.equal(selectionCount, 1);
  assert.equal(moveCount, 1);
});
