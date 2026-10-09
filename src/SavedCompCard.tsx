import type { SavedComp } from "./comps";
import { compMapLabel, selectedCompMaps } from "./compMaps";
import { GameModeIcon } from "./GameModeIcon";
import { compStatus } from "./compEdits";
import { HERO_BY_ID, heroImagePath } from "./heroes";

export interface SavedCompCardProps {
  readonly entry: SavedComp;
  readonly savedId: string | null;
  readonly writing: boolean;
  readonly onLoad: (entry: SavedComp) => void;
  readonly onRename: (entry: SavedComp) => void;
  readonly onExport: (entry: SavedComp) => void;
  readonly onDelete: (entry: SavedComp) => void;
}

export function SavedCompCard({
  entry,
  savedId,
  writing,
  onLoad,
  onRename,
  onExport,
  onDelete,
}: SavedCompCardProps): React.JSX.Element {
  const savedMaps = selectedCompMaps(entry.comp);
  const savedMap = savedMaps[0];
  const { gameMode } = entry.comp;
  return (
    <article className={`saved-comp${entry.id === savedId ? " selected" : ""}`}>
      <button
        type="button"
        className="load-comp"
        onClick={() => onLoad(entry)}
        aria-label={`Load ${entry.comp.name}`}
      >
        {savedMap && (
          <img
            className="saved-map-preview"
            src={savedMap.previewImagePath}
            alt=""
            loading="lazy"
          />
        )}
        {gameMode && (
          <span className="saved-map-preview saved-mode-preview">
            <GameModeIcon mode={gameMode} size={28} />
          </span>
        )}
        <strong>{entry.comp.name}</strong>
        <span className="saved-comp-map">
          {savedMaps.length > 1 ? `${savedMaps.length} maps · ` : ""}
          {compMapLabel(entry.comp)}
        </span>
        <span className="saved-comp-meta">
          {entry.comp.draft?.format.toUpperCase() ?? "Free build"} ·{" "}
          {compStatus(entry.comp)}
        </span>
        <span className="saved-portraits">
          {entry.comp.teams.ally.map((slot, index) =>
            slot.heroId ? (
              <img
                key={index}
                src={heroImagePath(slot.heroId)}
                alt={`${HERO_BY_ID.get(slot.heroId)?.name ?? ""}${slot.deadpoolRole ? ` · ${slot.deadpoolRole}` : ""}`}
              />
            ) : (
              <span key={index} />
            ),
          )}
        </span>
      </button>
      <div className="saved-comp-actions">
        <button
          type="button"
          aria-label={`Rename ${entry.comp.name}`}
          disabled={writing}
          onClick={() => onRename(entry)}
        >
          Rename
        </button>
        <button
          type="button"
          aria-label={`Export ${entry.comp.name}`}
          onClick={() => onExport(entry)}
        >
          Export
        </button>
        <button
          type="button"
          aria-label={`Delete ${entry.comp.name}`}
          disabled={writing}
          onClick={() => onDelete(entry)}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
