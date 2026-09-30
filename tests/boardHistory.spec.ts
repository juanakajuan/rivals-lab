import { expect, test } from "@playwright/test";
import {
  BOARD_HISTORY_LIMIT,
  boardHistoryReducer,
  createBoardHistory,
  type BoardState,
} from "../src/boardHistory";
import { DEFAULT_MAP_ID } from "../src/maps";

const initial: BoardState = {
  mapId: DEFAULT_MAP_ID,
  tokens: [
    { id: "ally-strange", heroId: "strange", team: "ally", x: 270, y: 635 },
  ],
};

test("history restores grouped map and position edits in order", () => {
  const moved: BoardState = {
    mapId: "hells-heaven-domination",
    tokens: initial.tokens.map((token) => ({ ...token, y: 632 })),
  };
  let history = createBoardHistory(initial);
  history = boardHistoryReducer(history, { type: "edit", update: () => moved });
  history = boardHistoryReducer(history, {
    type: "edit",
    update: (board) => ({ ...board, tokens: [] }),
  });
  history = boardHistoryReducer(history, { type: "undo" });
  expect(history.present).toEqual(moved);
  history = boardHistoryReducer(history, { type: "undo" });
  expect(history.present).toEqual(initial);
  expect(boardHistoryReducer(history, { type: "undo" })).toBe(history);
  history = boardHistoryReducer(history, { type: "redo" });
  expect(history.present).toEqual(moved);
  history = boardHistoryReducer(history, { type: "redo" });
  expect(history.present.tokens).toEqual([]);
  expect(boardHistoryReducer(history, { type: "redo" })).toBe(history);
});

test("new edits clear redo while equal edits preserve both stacks", () => {
  let history = boardHistoryReducer(createBoardHistory(initial), {
    type: "edit",
    update: (board) => ({ ...board, tokens: [] }),
  });
  history = boardHistoryReducer(history, { type: "undo" });
  expect(
    boardHistoryReducer(history, {
      type: "edit",
      update: (board) => ({
        ...board,
        tokens: board.tokens.map((token) => ({ ...token })),
      }),
    }),
  ).toBe(history);
  history = boardHistoryReducer(history, {
    type: "edit",
    update: (board) => ({ ...board, mapId: "museum-of-contemplation-convoy" }),
  });
  expect(history.future).toEqual([]);
  expect(history.past).toEqual([initial]);
  expect(boardHistoryReducer(history, { type: "redo" })).toBe(history);
});

test("history records and restores Deadpool role changes", () => {
  const board: BoardState = {
    mapId: DEFAULT_MAP_ID,
    tokens: [
      {
        id: "ally-deadpool",
        heroId: "deadpool",
        team: "ally",
        deadpoolRole: "Duelist",
        x: 270,
        y: 435,
      },
    ],
  };
  const history = boardHistoryReducer(createBoardHistory(board), {
    type: "edit",
    update: (current) => ({
      ...current,
      tokens: current.tokens.map((token) => ({
        ...token,
        deadpoolRole: "Strategist",
      })),
    }),
  });
  expect(history.present.tokens[0]?.deadpoolRole).toBe("Strategist");
  const undone = boardHistoryReducer(history, { type: "undo" });
  expect(undone.present).toEqual(board);
  expect(boardHistoryReducer(undone, { type: "redo" }).present).toEqual(
    history.present,
  );
});

test("history limit preserves order, no-ops and branching", () => {
  let history = createBoardHistory(initial);
  const edits = BOARD_HISTORY_LIMIT + 5;
  for (let x = 1; x <= edits; x++) {
    history = boardHistoryReducer(history, {
      type: "edit",
      update: (board) => ({
        ...board,
        tokens: board.tokens.map((token) => ({ ...token, x })),
      }),
    });
  }
  expect(history.past).toHaveLength(BOARD_HISTORY_LIMIT);
  expect(
    boardHistoryReducer(history, {
      type: "edit",
      update: (board) => ({ ...board }),
    }),
  ).toBe(history);
  for (let x = edits - 1; x >= 5; x--) {
    history = boardHistoryReducer(history, { type: "undo" });
    expect(history.present.tokens[0]?.x).toBe(x);
    expect(history.past.length + history.future.length).toBe(
      BOARD_HISTORY_LIMIT,
    );
  }
  expect(boardHistoryReducer(history, { type: "undo" })).toBe(history);
  expect(
    boardHistoryReducer(history, {
      type: "edit",
      update: (board) => ({ ...board }),
    }),
  ).toBe(history);
  for (let x = 6; x <= edits; x++) {
    history = boardHistoryReducer(history, { type: "redo" });
    expect(history.present.tokens[0]?.x).toBe(x);
    expect(history.past.length + history.future.length).toBe(
      BOARD_HISTORY_LIMIT,
    );
  }
  expect(boardHistoryReducer(history, { type: "redo" })).toBe(history);
  history = boardHistoryReducer(history, { type: "undo" });
  history = boardHistoryReducer(history, {
    type: "edit",
    update: (board) => ({ ...board, tokens: [] }),
  });
  expect(history.past).toHaveLength(BOARD_HISTORY_LIMIT);
  expect(history.future).toEqual([]);
  expect(boardHistoryReducer(history, { type: "redo" })).toBe(history);
  expect(
    boardHistoryReducer(history, { type: "undo" }).present.tokens[0]?.x,
  ).toBe(edits - 1);
});
