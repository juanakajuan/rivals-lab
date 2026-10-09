import type { Comp } from "./comps";
import type { DraftFormat } from "./draft";
import { compStatus } from "./compEdits";
import { compMapLabel, selectedCompMaps } from "./compMaps";
import { GameModeIcon } from "./GameModeIcon";
import { COMP_MAP_OPTIONS } from "./mapPickerOptions";
import { MapPicker } from "./MapPicker";
import { Map } from "lucide-react";
import type { GameMode } from "./maps";

export interface CompSettingsPanelProps {
  readonly comp: Comp;
  readonly writing: boolean;
  readonly onNameChange: (name: string) => void;
  readonly onSaveAs: () => void;
  readonly onSave: () => void;
  readonly onMapChange: (mapId: string | null) => void;
  readonly onMapsChange: (mapIds: readonly string[]) => void;
  readonly onGameModeChange: (mode: GameMode) => void;
  readonly onDraftChange: (format: DraftFormat | null) => void;
}

export function CompSettingsPanel({
  comp,
  writing,
  onNameChange,
  onSaveAs,
  onSave,
  onMapChange,
  onMapsChange,
  onGameModeChange,
  onDraftChange,
}: CompSettingsPanelProps): React.JSX.Element {
  const status = compStatus(comp);
  const selectedMaps = selectedCompMaps(comp);
  const selectedMap = selectedMaps[0];
  const { gameMode } = comp;
  const hasSelection = selectedMaps.length > 0 || gameMode !== null;
  return (
    <section className="builder-card comp-settings" aria-label="Comp settings">
      <div className="comp-settings-fields">
        <div className="comp-name-row">
          <label>
            Comp name
            <input
              value={comp.name}
              maxLength={100}
              placeholder="e.g. Midtown dive"
              onChange={(event) => onNameChange(event.currentTarget.value)}
            />
          </label>
          <span className={`status-tag status-${status.toLowerCase()}`}>
            {status}
          </span>
          <button
            type="button"
            className="secondary-button"
            disabled={writing}
            onClick={() => onSaveAs()}
          >
            Save As
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={writing}
            aria-busy={writing}
            onClick={() => onSave()}
          >
            Save
          </button>
        </div>
        <div className="settings-grid">
          <label>
            Draft format
            <select
              aria-label="Draft format"
              value={comp.draft?.format ?? "free"}
              onChange={(event) => {
                const format = event.currentTarget.value;
                if (format === "free") onDraftChange(null);
                else if (format === "mrc" || format === "ignite")
                  onDraftChange(format);
              }}
            >
              <option value="free">Free build</option>
              <option value="mrc">MRC · 4 bans / 2 saves</option>
              <option value="ignite">Ignite · 5 bans / 2 saves</option>
            </select>
          </label>
        </div>
      </div>
      <figure className="selected-map-preview">
        <MapPicker<string | null>
          options={COMP_MAP_OPTIONS}
          selectedValue={
            gameMode
              ? undefined
              : selectedMaps.length > 1
                ? undefined
                : (selectedMap?.id ?? null)
          }
          multiple={{
            selectedValues: comp.mapIds,
            onApply: (ids) =>
              onMapsChange(ids.filter((id): id is string => id !== null)),
          }}
          modes={{ selected: gameMode, onChoose: onGameModeChange }}
          triggerLabel="Comp map"
          triggerClassName="selected-map-trigger"
          triggerContent={
            <>
              {gameMode ? (
                <span className="selected-map-neutral" aria-hidden="true">
                  <GameModeIcon mode={gameMode} />
                </span>
              ) : selectedMap ? (
                <img
                  src={selectedMap.previewImagePath}
                  alt=""
                  style={{ objectPosition: selectedMap.selectedCardPosition }}
                />
              ) : (
                <span className="selected-map-neutral" aria-hidden="true">
                  <Map />
                </span>
              )}
              {selectedMaps.length > 1 ? (
                <span className="selected-map-count" aria-hidden="true">
                  {selectedMaps.length} maps
                </span>
              ) : null}
              <span className="selected-map-cue" aria-hidden="true">
                {hasSelection ? "Change map" : "Choose map"}
              </span>
            </>
          }
          title="Choose comp map"
          onChoose={onMapChange}
        />
        <figcaption>
          {selectedMaps.length === 1 && selectedMap
            ? `${selectedMap.name} · ${selectedMap.mode}`
            : compMapLabel(comp)}
        </figcaption>
      </figure>
    </section>
  );
}
