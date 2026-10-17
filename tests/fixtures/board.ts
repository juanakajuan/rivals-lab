import Konva from "konva";
import {
  createBoardCanvas,
  type BoardCanvas,
  type BoardSnapshot,
} from "../../src/boardCanvas.ts";
import { resolveBoardMap } from "../../src/boardMaps.ts";
import { DEFAULT_MAP_ID } from "../../src/maps.ts";

interface BoardHarness {
  readonly board: BoardCanvas;
  readonly stage: Konva.Stage;
  snapshot: BoardSnapshot;
  readonly moves: { readonly x: number; readonly y: number }[];
}

declare global {
  interface Window {
    boardHarness: BoardHarness;
  }
}

const host = document.getElementById("board");
if (!(host instanceof HTMLDivElement)) throw new Error("Missing board host");

const board = createBoardCanvas(host, {
  onSelect(token) {
    const harness = window.boardHarness;
    harness.snapshot = {
      ...harness.snapshot,
      selectedTokenId: token?.id ?? null,
    };
    board.update(harness.snapshot);
  },
  onMove(token, { x, y }) {
    const harness = window.boardHarness;
    harness.moves.push({ x, y });
    harness.snapshot = {
      ...harness.snapshot,
      boardRevision: harness.snapshot.boardRevision + 1,
      tokens: harness.snapshot.tokens.map((current) =>
        current.id === token.id ? { ...current, x, y } : current,
      ),
    };
    board.update(harness.snapshot);
  },
  onContextMenu() {},
});
const stage = Konva.stages.find((candidate) => candidate.container() === host);
if (!stage) throw new Error("Missing board stage");
window.boardHarness = {
  board,
  stage,
  snapshot: {
    map: resolveBoardMap({ kind: "builtin", id: DEFAULT_MAP_ID }),
    boardRevision: 0,
    tokens: [
      { id: "ally-strange", heroId: "strange", team: "ally", x: 200, y: 200 },
    ],
    selectedTokenId: null,
    iconSize: 100,
  },
  moves: [],
};
board.update(window.boardHarness.snapshot);
