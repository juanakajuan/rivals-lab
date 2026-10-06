import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Download } from "lucide-react";
import { DraftPanel, HeroPicker, TeamEditor } from "./BuilderPanels";
import { CompLibraryPanel } from "./CompLibraryPanel";
import { CompSettingsPanel } from "./CompSettingsPanel";
import { Dialog } from "./ui/Dialog";
import { downloadBlob } from "./downloadBlob";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { downloadAndCopyCompImage } from "./compImage";
import { COMP_MAPS } from "./compMaps";
import type { Comp, SavedComp } from "./comps";
import {
  compChoiceError,
  compStatus,
  hasDraftChoices,
  type CompEdit,
  type CompHeroTarget,
} from "./compEdits";
import {
  SavedCompSession,
  type OpenCompSnapshot,
  type SavedCompSessionStart,
} from "./savedComps";
import type { CompStorage } from "./appData";
import { draftEffects, type DraftFormat } from "./draft";
import { teamLabel, type HeroSelection, type Team } from "./heroes";
import type { MapId } from "./maps";
import { MapPicker } from "./MapPicker";
import { BOARD_MAP_OPTIONS } from "./mapPickerOptions";
import "./builder.css";

type NameRequest =
  | { readonly kind: "copy"; readonly name: string }
  | { readonly kind: "rename"; readonly id: string; readonly name: string };

const TEAMS: readonly Team[] = ["ally", "enemy"];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The operation failed.";
}

function writeErrorMessage(error: unknown): string {
  return `Could not save changes. ${errorMessage(error)} Existing saved data was kept.`;
}

function NameDialog({
  request,
  pending,
  onClose,
  onSubmit,
}: {
  readonly request: NameRequest;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (name: string) => void;
}): React.JSX.Element {
  const [name, setName] = useState(request.name);
  return (
    <Dialog
      appearance="builder"
      openOnMount
      onCancel={onClose}
      title={request.kind === "copy" ? "Save comp as" : "Rename comp"}
      onRequestClose={onClose}
    >
      <form
        className="dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmedName = name.trim();
          if (trimmedName) onSubmit(trimmedName);
        }}
      >
        <label>
          Comp name
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={pending || !name.trim()}
          >
            Save name
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function CompBuilder({
  storage,
  start,
  onOpenComp,
  onImport,
  onOpenBoard,
}: {
  readonly storage: CompStorage;
  readonly start: SavedCompSessionStart;
  readonly onOpenComp: (openComp: OpenCompSnapshot) => void;
  readonly onImport: () => void;
  readonly onOpenBoard: (comp: Comp, mapId: MapId) => void;
}): React.JSX.Element {
  const [session] = useState(() => new SavedCompSession(storage, start));
  const [savedState, setSavedState] = useState(() => session.state);
  const { comp, savedId, dirty, library } = savedState;
  const [picker, setPicker] = useState<CompHeroTarget | null>(null);
  const [nameRequest, setNameRequest] = useState<NameRequest | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exportingImage, setExportingImage] = useState(false);
  const exportingImageRef = useRef(false);
  const [writing, setWriting] = useState(false);
  const writingRef = useRef(false);
  const effects = draftEffects(comp.draft);
  const status = compStatus(comp);
  const selectedMap = COMP_MAPS.find((map) => map.id === comp.mapId);
  const supportedBoardMapId = selectedMap?.boardMapId;
  const boardTransferDisabled = !TEAMS.some((team) =>
    comp.teams[team].some((slot) => slot.heroId),
  );
  let saveStatus = "New comp · not saved";
  if (writing) saveStatus = "Saving changes…";
  else if (message) saveStatus = message;
  else if (dirty) saveStatus = "Unsaved changes";
  else if (savedId) saveStatus = "All changes saved";

  useEffect(
    () => onOpenComp(session.openComp),
    [onOpenComp, session, savedState],
  );

  useEffect(() => {
    let active = true;
    async function refresh(): Promise<void> {
      await session.refresh();
      if (active) setSavedState(session.state);
    }
    const unsubscribe = storage.subscribe(() => void refresh());
    void refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [session, storage]);

  async function commit<T>(
    operation: () => Promise<T>,
  ): Promise<{ readonly result: T } | null> {
    if (writingRef.current) return null;
    writingRef.current = true;
    setWriting(true);
    try {
      const result = await operation();
      setSavedState(session.state);
      setError(null);
      return { result };
    } catch (cause) {
      setError(writeErrorMessage(cause));
      return null;
    } finally {
      writingRef.current = false;
      setWriting(false);
    }
  }

  async function exportStoredData(
    filename: string,
    entry?: SavedComp,
  ): Promise<void> {
    try {
      downloadBlob({
        blob: new Blob([await session.exportData(entry)], {
          type: "application/json",
        }),
        filename,
      });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  function canDiscard(): boolean {
    return !dirty || window.confirm("Discard unsaved comp edits?");
  }

  function edit(change: CompEdit): boolean {
    try {
      setSavedState(session.edit(change));
      setMessage("");
      setError(null);
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    }
  }

  function load(entry: SavedComp | null): void {
    if (!canDiscard()) return;
    setSavedState(session.load(entry));
    setPicker(null);
    setMessage(entry ? `Loaded ${entry.comp.name}.` : "New comp.");
    setError(null);
  }

  async function save(name: string, asCopy = false): Promise<void> {
    if (!name.trim()) {
      setError("Enter a comp name before saving.");
      return;
    }
    const committed = await commit(() => session.save(name, asCopy));
    if (!committed) return;
    setNameRequest(null);
    switch (committed.result.kind) {
      case "clean":
        setMessage(`Saved ${name.trim()}.`);
        break;
      case "newerEdits":
        setMessage(`Saved ${name.trim()}. Newer edits are not saved.`);
        break;
      case "differentEditor":
        setMessage(`Saved ${name.trim()}. The current comp was kept.`);
        break;
    }
  }

  async function rename(id: string, name: string): Promise<void> {
    if (!(await commit(() => session.rename(id, name)))) return;
    setNameRequest(null);
    setMessage(`Renamed comp to ${name}.`);
  }

  async function deleteComp(entry: SavedComp): Promise<void> {
    if (!window.confirm(`Delete “${entry.comp.name}” from this browser?`))
      return;
    if (!(await commit(() => session.remove(entry.id)))) return;
    setMessage(`Deleted ${entry.comp.name}.`);
  }

  function resetTeam(team: Team): void {
    if (
      !window.confirm(`Clear all heroes and slot notes for ${teamLabel(team)}?`)
    )
      return;
    edit({ kind: "resetTeam", team });
  }

  function choiceError(heroId: string): string | null {
    return picker ? compChoiceError(comp, picker, heroId) : "No selection.";
  }

  function chooseHero(selection: HeroSelection): void {
    if (picker && edit({ kind: "chooseHero", target: picker, selection }))
      setPicker(null);
  }

  function changeDraft(format: DraftFormat | null): void {
    if (
      hasDraftChoices(comp) &&
      !window.confirm(
        "Change draft settings and reset all bans and saves? Heroes and notes will stay.",
      )
    )
      return;
    edit({ kind: "draftFormat", format });
  }

  function changeMap(mapId: string | null): void {
    if (mapId === comp.mapId) return;
    edit({ kind: "map", mapId });
  }

  async function shareImage(): Promise<void> {
    if (exportingImageRef.current) return;
    exportingImageRef.current = true;
    setExportingImage(true);
    setMessage("");
    setError(null);
    try {
      const result = await downloadAndCopyCompImage(comp, () => {
        setMessage("Download started. Copying image…");
      });
      setMessage(
        [
          result.downloadError === null ? "Download started." : "",
          result.copyError === null ? "Image copied to clipboard." : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
      const errors = [
        result.downloadError
          ? `Download could not start. ${result.downloadError}`
          : "",
        result.copyError ? `Image was not copied. ${result.copyError}` : "",
      ].filter(Boolean);
      setError(errors.length ? errors.join(" ") : null);
    } catch (cause) {
      setError(`Could not create image. ${errorMessage(cause)}`);
    } finally {
      exportingImageRef.current = false;
      setExportingImage(false);
    }
  }

  let pickerTitle = "Choose hero";
  if (picker?.kind === "slot")
    pickerTitle = `Choose hero · ${teamLabel(picker.team)} · Slot ${picker.index + 1}`;
  if (picker?.kind === "draft")
    pickerTitle = `${picker.slot.kind === "save" ? "Save" : "Ban"} hero · ${teamLabel(picker.slot.team)} · ${picker.slot.index + 1}`;

  return (
    <main className="builder-layout">
      <CompLibraryPanel
        library={library}
        savedId={savedId}
        writing={writing}
        onLoad={load}
        onRename={(entry) =>
          setNameRequest({
            kind: "rename",
            id: entry.id,
            name: entry.comp.name,
          })
        }
        onExport={(entry) => void exportStoredData("rivals-comp.json", entry)}
        onDelete={(entry) => void deleteComp(entry)}
        onImport={onImport}
        onExportAll={() => void exportStoredData("rivals-comps.json")}
      />

      <div className="builder-workspace">
        <div className="builder-heading">
          <div>
            <p className="eyebrow">Plan the matchup</p>
            <h1>Draft / Comp Builder</h1>
          </div>
          <div className="builder-heading-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={exportingImage}
              aria-busy={exportingImage}
              onClick={() => void shareImage()}
            >
              <Download size={15} />
              {exportingImage ? "Preparing image…" : "Download & Copy"}
            </button>
            {supportedBoardMapId !== undefined ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => onOpenBoard(comp, supportedBoardMapId)}
                disabled={boardTransferDisabled}
              >
                Open on Position Board <ArrowUpRight size={15} />
              </button>
            ) : (
              <MapPicker<MapId>
                options={BOARD_MAP_OPTIONS}
                selectedValue={undefined}
                triggerLabel="Open on Position Board"
                triggerContent={
                  <>
                    Open on Position Board <ArrowUpRight size={15} />
                  </>
                }
                triggerClassName="secondary-button"
                disabled={boardTransferDisabled}
                title="Choose a Position Board map"
                description={`${selectedMap ? `${selectedMap.name} has no board image yet.` : "This comp has no map selected."} Choose a supported map. The saved comp’s map will stay unchanged.`}
                onChoose={(mapId) => onOpenBoard(comp, mapId)}
              />
            )}
          </div>
        </div>
        {library.error && (
          <div className="builder-error" role="alert">
            <p>
              {library.error}{" "}
              {library.unavailableCount
                ? "Entries that cannot be loaded stay stored for recovery."
                : "Existing data will not be overwritten."}
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                void exportStoredData("rivals-comps-recovery.json")
              }
            >
              Export stored data for recovery
            </button>
          </div>
        )}
        {error && (
          <p className="builder-error" role="alert">
            {error}
          </p>
        )}
        <div className="save-status" role="status">
          {saveStatus}
        </div>
        <CompSettingsPanel
          comp={comp}
          writing={writing}
          onNameChange={(value) => edit({ kind: "name", value })}
          onSaveAs={() =>
            setNameRequest({
              kind: "copy",
              name: comp.name ? `${comp.name.slice(0, 93)} (copy)` : "",
            })
          }
          onSave={() => void save(comp.name)}
          onMapChange={changeMap}
          onDraftChange={changeDraft}
        />
        {comp.draft && (
          <DraftPanel
            draft={comp.draft}
            onEdit={edit}
            onChoose={(slot) => setPicker({ kind: "draft", slot })}
          />
        )}
        {status === "Conflict" && (
          <p className="builder-error">
            A comp hero is banned. Replace that hero or change the draft. You
            can still save this plan.
          </p>
        )}
        {TEAMS.map((team) => (
          <TeamEditor
            key={team}
            team={team}
            slots={comp.teams[team]}
            banned={effects.banned[team]}
            onChoose={(index) => setPicker({ kind: "slot", team, index })}
            onEdit={edit}
            onReset={() => resetTeam(team)}
          />
        ))}
        <section className="builder-card comp-notes">
          <label>
            <h2>Comp Notes</h2>
            <p className="muted-copy">
              Win conditions, opening plan, swaps, and reminders.
            </p>
            <AutoGrowTextarea
              value={comp.notes}
              rows={5}
              maxLength={10_000}
              aria-label="Comp notes"
              placeholder="What makes this comp work?"
              onChange={(event) =>
                edit({ kind: "notes", value: event.currentTarget.value })
              }
            />
          </label>
        </section>
        <details className="rules-reference">
          <summary>Rules and map sources</summary>
          <p>
            Configured 23 September 2026. These sequences use the agreed MRC and
            Ignite rules. Public rulebooks can describe older formats. Saves
            protect heroes from later bans; they do not reverse bans. Every
            action is required in this planner.
          </p>
          <p>
            <a
              href="https://www.marvelrivals.com/Marvel_Rivals_Championship_S7_Tournament_Rules_V1.7_EN.pdf"
              target="_blank"
              rel="noreferrer"
            >
              MRC Season 7 reference
            </a>
            {" · "}
            <a
              href="https://www.marvelrivals.com/Marvel_Rivals_Ignite_2026_Rules_Stage1_2026.5.9_V2.0.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Ignite Stage 1 reference
            </a>
            {" · "}
            <a
              href="https://www.marvelrivalsesports.com/20260908/42828_1313342.html"
              target="_blank"
              rel="noreferrer"
            >
              8 September Ignite Stage 2 map pool
            </a>
            {" · "}
            <a
              href="https://www.marvelrivals.com/gameupdate/20260923/41548_1314808.html"
              target="_blank"
              rel="noreferrer"
            >
              24 September update · The God Quarry
            </a>
          </p>
          <p>
            The planning list includes The God Quarry from the 24 September 2026
            update. It is separate from the 8 September Ignite Stage 2 event
            pool. Check your event's current map pool.
          </p>
        </details>
      </div>
      {picker && (
        <HeroPicker
          title={pickerTitle}
          mode={picker.kind === "slot" ? "comp" : "draft"}
          unavailable={choiceError}
          onChoose={chooseHero}
          onClose={() => setPicker(null)}
        />
      )}
      {nameRequest && (
        <NameDialog
          request={nameRequest}
          pending={writing}
          onClose={() => setNameRequest(null)}
          onSubmit={(name) => {
            if (nameRequest.kind === "copy") void save(name, true);
            else void rename(nameRequest.id, name);
          }}
        />
      )}
    </main>
  );
}
