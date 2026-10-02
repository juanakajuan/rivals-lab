import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Download,
  FolderOpen,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import {
  BuilderDialog,
  DraftPanel,
  HeroPicker,
  TeamEditor,
} from "./BuilderPanels";
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
import { SavedCompSession, SavedCompWriteError } from "./savedComps";
import { browserCompStorage } from "./compStorage";
import { draftEffects, type DraftFormat } from "./draft";
import {
  HERO_BY_ID,
  heroImagePath,
  teamLabel,
  type HeroSelection,
  type Team,
} from "./heroes";
import { MAPS, isMapId, type MapId } from "./maps";
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

function downloadJson(source: string, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([source], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    <BuilderDialog
      title={request.kind === "copy" ? "Save comp as" : "Rename comp"}
      onClose={onClose}
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
    </BuilderDialog>
  );
}

export function CompBuilder({
  onOpenBoard,
}: {
  readonly onOpenBoard: (comp: Comp, mapId: MapId) => void;
}): React.JSX.Element {
  const [session] = useState(() => new SavedCompSession());
  const [savedState, setSavedState] = useState(() => session.state);
  const { comp, savedId, dirty, library } = savedState;
  const [librarySearch, setLibrarySearch] = useState("");
  const [picker, setPicker] = useState<CompHeroTarget | null>(null);
  const [nameRequest, setNameRequest] = useState<NameRequest | null>(null);
  const [boardMapOpen, setBoardMapOpen] = useState(false);
  const [boardMapId, setBoardMapId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exportingImage, setExportingImage] = useState(false);
  const exportingImageRef = useRef(false);
  const [writing, setWriting] = useState(false);
  const writingRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const effects = draftEffects(comp.draft);
  const status = compStatus(comp);
  const selectedMap = COMP_MAPS.find((map) => map.id === comp.mapId);
  const search = librarySearch.trim().toLowerCase();
  const filteredComps = library.entries.filter((entry) =>
    entry.comp.name.toLowerCase().includes(search),
  );
  let saveStatus = "New comp · not saved";
  if (writing) saveStatus = "Saving changes…";
  else if (message) saveStatus = message;
  else if (dirty) saveStatus = "Unsaved changes";
  else if (savedId) saveStatus = "All changes saved";

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent): void {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    let active = true;
    async function refresh(): Promise<void> {
      await session.refresh();
      if (active) setSavedState(session.state);
    }
    const unsubscribe = browserCompStorage.subscribe(() => void refresh());
    void refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [session]);

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
      downloadJson(await session.exportData(entry), filename);
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

  async function importFile(file: File): Promise<void> {
    try {
      const result = await session.importFile(file);
      setSavedState(session.state);
      setError(null);
      setMessage(
        `Imported ${result.count} comp${result.count === 1 ? "" : "s"} as copies.`,
      );
    } catch (cause) {
      setError(
        cause instanceof SavedCompWriteError
          ? writeErrorMessage(cause)
          : `Import failed. ${errorMessage(cause)}`,
      );
    }
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

  function changeMap(mapId: string): void {
    if (
      hasDraftChoices(comp) &&
      !window.confirm(
        "Change map and reset its draft? Heroes and notes will stay.",
      )
    )
      return;
    edit({ kind: "map", mapId: mapId || null });
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

  function openBoard(): void {
    if (selectedMap?.boardMapId) {
      onOpenBoard(comp, selectedMap.boardMapId);
      return;
    }
    setBoardMapId("");
    setBoardMapOpen(true);
  }

  let pickerTitle = "Choose hero";
  if (picker?.kind === "slot")
    pickerTitle = `Choose hero · ${teamLabel(picker.team)} · Slot ${picker.index + 1}`;
  if (picker?.kind === "draft")
    pickerTitle = `${picker.slot.kind === "save" ? "Save" : "Ban"} hero · ${teamLabel(picker.slot.team)} · ${picker.slot.index + 1}`;

  return (
    <main className="builder-layout">
      <aside className="comp-library" aria-labelledby="library-heading">
        <div className="library-heading">
          <FolderOpen size={18} />
          <h2 id="library-heading">Saved comps</h2>
          <span>{library.entries.length}</span>
        </div>
        <button
          type="button"
          className="primary-button wide-button"
          onClick={() => load(null)}
        >
          <Plus size={15} />
          New comp
        </button>
        <label className="builder-search">
          <Search size={15} />
          <input
            type="search"
            placeholder="Search comps…"
            aria-label="Search saved comps"
            value={librarySearch}
            onChange={(event) => setLibrarySearch(event.currentTarget.value)}
          />
        </label>
        <div className="library-list">
          {filteredComps.map((entry) => {
            const savedMap = COMP_MAPS.find(
              (map) => map.id === entry.comp.mapId,
            );
            return (
              <article
                className={`saved-comp${entry.id === savedId ? " selected" : ""}`}
                key={entry.id}
              >
                <button
                  type="button"
                  className="load-comp"
                  onClick={() => load(entry)}
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
                  <strong>{entry.comp.name}</strong>
                  <span className="saved-comp-map">
                    {savedMap?.name ?? "Any map"}
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
                    onClick={() =>
                      setNameRequest({
                        kind: "rename",
                        id: entry.id,
                        name: entry.comp.name,
                      })
                    }
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    aria-label={`Export ${entry.comp.name}`}
                    onClick={() =>
                      void exportStoredData("rivals-comp.json", entry)
                    }
                  >
                    Export
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${entry.comp.name}`}
                    disabled={writing}
                    onClick={() => void deleteComp(entry)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
          {!filteredComps.length && (
            <div className="library-empty">
              <FolderOpen size={28} />
              <p>
                {librarySearch
                  ? "No matching comps."
                  : "Your playbook starts here."}
              </p>
              <small>
                {librarySearch
                  ? "Try another name."
                  : "Build a team, add notes, then save it for your next match."}
              </small>
            </div>
          )}
        </div>
        <div className="library-footer">
          <div className="library-file-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={writing}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={14} />
              Import
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!library.entries.length && !library.error}
              onClick={() => void exportStoredData("rivals-comps.json")}
            >
              <Download size={14} />
              Export all
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept=".json,application/json"
            aria-label="Import comps JSON"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void importFile(file);
            }}
          />
          <p>
            Saved in this browser. Export a file to back up or move your comps.
          </p>
        </div>
      </aside>

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
            <button
              type="button"
              className="secondary-button"
              onClick={openBoard}
              disabled={
                !TEAMS.some((team) =>
                  comp.teams[team].some((slot) => slot.heroId),
                )
              }
            >
              Open on Position Board <ArrowUpRight size={15} />
            </button>
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
        <section
          className="builder-card comp-settings"
          aria-label="Comp settings"
        >
          <div className="comp-settings-fields">
            <div className="comp-name-row">
              <label>
                Comp name
                <input
                  value={comp.name}
                  maxLength={100}
                  placeholder="e.g. Midtown dive"
                  onChange={(event) =>
                    edit({ kind: "name", value: event.currentTarget.value })
                  }
                />
              </label>
              <span className={`status-tag status-${status.toLowerCase()}`}>
                {status}
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={writing}
                onClick={() =>
                  setNameRequest({
                    kind: "copy",
                    name: comp.name ? `${comp.name.slice(0, 93)} (copy)` : "",
                  })
                }
              >
                Save As
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={writing}
                aria-busy={writing}
                onClick={() => void save(comp.name)}
              >
                Save
              </button>
            </div>
            <div className="settings-grid">
              <label>
                Comp map
                <select
                  aria-label="Comp map"
                  value={comp.mapId ?? ""}
                  onChange={(event) => changeMap(event.currentTarget.value)}
                >
                  <option value="">Any map</option>
                  {COMP_MAPS.map((map) => (
                    <option key={map.id} value={map.id}>
                      {map.name} · {map.mode}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Draft format
                <select
                  aria-label="Draft format"
                  value={comp.draft?.format ?? "free"}
                  onChange={(event) => {
                    const format = event.currentTarget.value;
                    if (format === "free") changeDraft(null);
                    else if (format === "mrc" || format === "ignite")
                      changeDraft(format);
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
              <img src={selectedMap.previewImagePath} alt="" />
              <figcaption>
                {selectedMap.name} · {selectedMap.mode}
              </figcaption>
            </figure>
          ) : (
            <p className="selected-map-neutral">Any map</p>
          )}
        </section>
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
              Ignite Stage 2 map pool
            </a>
          </p>
          <p>
            The map list is for planning. Check your event’s current map pool.
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
      {boardMapOpen && (
        <BuilderDialog
          title="Choose a Position Board map"
          onClose={() => setBoardMapOpen(false)}
        >
          <p className="muted-copy">
            {selectedMap
              ? `${selectedMap.name} has no board image yet.`
              : "This comp has no map selected."}{" "}
            Choose a supported map. The saved comp’s map will stay unchanged.
          </p>
          <form
            className="dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (isMapId(boardMapId)) {
                setBoardMapOpen(false);
                onOpenBoard(comp, boardMapId);
              }
            }}
          >
            <label>
              Board map
              <select
                aria-label="Board map"
                autoFocus
                required
                value={boardMapId}
                onChange={(event) => setBoardMapId(event.currentTarget.value)}
              >
                <option value="">Choose a map</option>
                {MAPS.map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setBoardMapOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={!isMapId(boardMapId)}
              >
                Open board
              </button>
            </div>
          </form>
        </BuilderDialog>
      )}
    </main>
  );
}
