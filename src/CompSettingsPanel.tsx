import type { Comp } from "./comps";
import type { DraftFormat } from "./draft";
import { compStatus } from "./compEdits";
import { COMP_MAPS } from "./compMaps";
import { COMP_MAP_OPTIONS } from "./mapPickerOptions";
import { MapPicker } from "./MapPicker";

export interface CompSettingsPanelProps {
  readonly comp: Comp;
  readonly writing: boolean;
  readonly onNameChange: (name: string) => void;
  readonly onSaveAs: () => void;
  readonly onSave: () => void;
  readonly onMapChange: (mapId: string | null) => void;
  readonly onDraftChange: (format: DraftFormat | null) => void;
}

export function CompSettingsPanel({
  comp,
  writing,
  onNameChange,
  onSaveAs,
  onSave,
  onMapChange,
  onDraftChange,
}: CompSettingsPanelProps): React.JSX.Element {
  const status = compStatus(comp);
  const selectedMap = COMP_MAPS.find((map) => map.id === comp.mapId);
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
          <div className="comp-map-field">
            <span>Comp map</span>
            <MapPicker<string | null>
              options={COMP_MAP_OPTIONS}
              selectedValue={comp.mapId}
              triggerLabel="Comp map"
              triggerContent={
                selectedMap
                  ? `${selectedMap.name} · ${selectedMap.mode}`
                  : "Any map"
              }
              title="Choose comp map"
              onChoose={onMapChange}
            />
          </div>
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
      {selectedMap ? (
        <figure className="selected-map-preview">
          <img
            src={selectedMap.previewImagePath}
            alt=""
            style={{ objectPosition: selectedMap.selectedCardPosition }}
          />
          <figcaption>
            {selectedMap.name} · {selectedMap.mode}
          </figcaption>
        </figure>
      ) : (
        <p className="selected-map-neutral">Any map</p>
      )}
    </section>
  );
}
