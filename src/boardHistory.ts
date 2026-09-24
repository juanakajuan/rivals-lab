import type { BoardToken } from './boardCanvas';
import type { MapId } from './maps';

export interface BoardState {
  readonly mapId: MapId;
  readonly tokens: readonly BoardToken[];
}

export interface BoardHistory {
  readonly past: readonly BoardState[];
  readonly present: BoardState;
  readonly future: readonly BoardState[];
}

export type BoardHistoryAction =
  | { readonly type: 'edit'; readonly update: (board: BoardState) => BoardState }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' };

export function createBoardHistory(present: BoardState): BoardHistory {
  return { past: [], present, future: [] };
}

function equalBoards(left: BoardState, right: BoardState): boolean {
  return left.mapId === right.mapId && left.tokens.length === right.tokens.length &&
    left.tokens.every((token, index) => {
      const other = right.tokens[index];
      return other !== undefined && token.id === other.id && token.heroId === other.heroId &&
        token.team === other.team && token.deadpoolRole === other.deadpoolRole && token.x === other.x && token.y === other.y;
    });
}

/** Only committed board edits enter history. View state stays with the caller. */
export function boardHistoryReducer(
  history: BoardHistory,
  action: BoardHistoryAction
): BoardHistory {
  switch (action.type) {
    case 'edit': {
      const present = action.update(history.present);
      if (equalBoards(history.present, present)) return history;
      return { past: [...history.past, history.present], present, future: [] };
    }
    case 'undo': {
      const present = history.past.at(-1);
      if (!present) return history;
      return {
        past: history.past.slice(0, -1),
        present,
        future: [history.present, ...history.future]
      };
    }
    case 'redo': {
      const present = history.future[0];
      if (!present) return history;
      return {
        past: [...history.past, history.present],
        present,
        future: history.future.slice(1)
      };
    }
  }
}
