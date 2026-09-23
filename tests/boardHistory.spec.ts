import { expect, test } from '@playwright/test';
import { boardHistoryReducer, createBoardHistory, type BoardState } from '../src/boardHistory';
import { DEFAULT_MAP_ID } from '../src/maps';

const initial: BoardState = {
  mapId: DEFAULT_MAP_ID,
  tokens: [{ id: 'ally-strange', heroId: 'strange', team: 'ally', x: 270, y: 635 }]
};

test('history restores grouped map and position edits in order', () => {
  const moved: BoardState = {
    mapId: 'hells-heaven-domination',
    tokens: initial.tokens.map((token) => ({ ...token, y: 632 }))
  };
  let history = createBoardHistory(initial);
  history = boardHistoryReducer(history, { type: 'edit', update: () => moved });
  history = boardHistoryReducer(history, {
    type: 'edit', update: (board) => ({ ...board, tokens: [] })
  });
  history = boardHistoryReducer(history, { type: 'undo' });
  expect(history.present).toEqual(moved);
  history = boardHistoryReducer(history, { type: 'undo' });
  expect(history.present).toEqual(initial);
  expect(boardHistoryReducer(history, { type: 'undo' })).toBe(history);
  history = boardHistoryReducer(history, { type: 'redo' });
  expect(history.present).toEqual(moved);
  history = boardHistoryReducer(history, { type: 'redo' });
  expect(history.present.tokens).toEqual([]);
  expect(boardHistoryReducer(history, { type: 'redo' })).toBe(history);
});

test('new edits clear redo while equal edits preserve both stacks', () => {
  let history = boardHistoryReducer(createBoardHistory(initial), {
    type: 'edit', update: (board) => ({ ...board, tokens: [] })
  });
  history = boardHistoryReducer(history, { type: 'undo' });
  expect(boardHistoryReducer(history, {
    type: 'edit',
    update: (board) => ({ ...board, tokens: board.tokens.map((token) => ({ ...token })) })
  })).toBe(history);
  history = boardHistoryReducer(history, {
    type: 'edit', update: (board) => ({ ...board, mapId: 'museum-of-contemplation-convoy' })
  });
  expect(history.future).toEqual([]);
  expect(history.past).toEqual([initial]);
  expect(boardHistoryReducer(history, { type: 'redo' })).toBe(history);
});
