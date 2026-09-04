import assert from 'node:assert/strict';
import test from 'node:test';
import Konva from 'konva';

import {
  configureTokenSelection,
  updateTokenSelection
} from '../src/tokenSelection.ts';

test('updates selection without replacing the active token group', () => {
  const container = new Konva.Group();
  const group = new Konva.Group();
  const ring = new Konva.Circle({ stroke: '#50b9ff', strokeWidth: 3 });
  configureTokenSelection(group, ring, 'ally-strange', '#50b9ff');
  group.add(ring);
  container.add(group);

  updateTokenSelection(container, 'ally-strange');

  assert.equal(container.getChildren()[0], group);
  assert.equal(ring.stroke(), '#ffffff');
  assert.equal(ring.strokeWidth(), 4);
});
