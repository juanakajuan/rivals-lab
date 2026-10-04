import type { Comp } from "./comps";
import type { DraftFormat } from "./draft";
import { compStatus } from "./compEdits";
import { COMP_MAPS } from "./compMaps";
import { COMP_MAP_OPTIONS } from "./mapPickerOptions";
import { MapPicker } from "./MapPicker";
import { Map } from "lucide-react";

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
          selectedValue={comp.mapId}
          triggerLabel="Comp map"
          triggerClassName="selected-map-trigger"
          triggerContent={
            <>
              {selectedMap ? (
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
              <span className="selected-map-cue" aria-hidden="true">
                {selectedMap ? "Change map" : "Choose map"}
              </span>
            </>
          }
          title="Choose comp map"
          onChoose={onMapChange}
        />
        <figcaption>
          {selectedMap
            ? `${selectedMap.name} · ${selectedMap.mode}`
            : "Any map"}
        </figcaption>
      </figure>
    </section>
  );
}
