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
import { COMP_MAPS } from "./compMaps";
import {
  COMP_STORAGE_KEY,
  MAX_IMPORT_BYTES,
  compStatus,
  emptyComp,
  parseCompLibrary,
  readCompLibrary,
  serializeCompLibrary,
  updateCompLibrary,
  type Comp,
  type CompSlot,
  type SavedComp,
} from "./comps";
import {
  chooseDraftHero,
  draftChoiceError,
  draftEffects,
  draftProgress,
  type DraftState,
} from "./draft";
import {
  HERO_BY_ID,
  heroImagePath,
  isTeam,
  teamLabel,
  type HeroSelection,
  type Team,
} from "./heroes";
import { MAPS, isMapId, type MapId } from "./maps";
import "./builder.css";

type Picker =
  | { readonly kind: "draft" }
  | { readonly kind: "slot"; readonly team: Team; readonly index: number };
type NameRequest =
  | { readonly kind: "copy"; readonly name: string }
  | { readonly kind: "rename"; readonly id: string; readonly name: string };

interface LibraryState {
  readonly entries: readonly SavedComp[];
  readonly error: string | null;
}

const TEAMS: readonly Team[] = ["ally", "enemy"];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The operation failed.";
}

function loadLibrary(): LibraryState {
  try {
    return { entries: readCompLibrary(), error: null };
  } catch (error) {
    return {
      entries: [],
      error: `Saved comps could not be read: ${errorMessage(error)}`,
    };
  }
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
  onClose,
  onSubmit,
}: {
  readonly request: NameRequest;
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
            disabled={!name.trim()}
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
  const [comp, setComp] = useState<Comp>(emptyComp);
  const [baseline, setBaseline] = useState<Comp>(emptyComp);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryState>(loadLibrary);
  const [librarySearch, setLibrarySearch] = useState("");
  const [picker, setPicker] = useState<Picker | null>(null);
  const [nameRequest, setNameRequest] = useState<NameRequest | null>(null);
  const [boardMapOpen, setBoardMapOpen] = useState(false);
  const [boardMapId, setBoardMapId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(comp) !== JSON.stringify(baseline);
  const effects = draftEffects(comp.draft);
  const status = compStatus(comp);
  const selectedMap = COMP_MAPS.find((map) => map.id === comp.mapId);
  const search = librarySearch.trim().toLowerCase();
  const filteredComps = library.entries.filter((entry) =>
    entry.comp.name.toLowerCase().includes(search),
  );
  let saveStatus = "New comp · not saved";
  if (message) saveStatus = message;
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
    function refresh(event: StorageEvent): void {
      if (event.key === COMP_STORAGE_KEY || event.key === null)
        setLibrary(loadLibrary());
    }
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  function commit(
    update: (current: readonly SavedComp[]) => readonly SavedComp[],
  ): boolean {
    try {
      const entries = updateCompLibrary(update);
      setLibrary({ entries, error: null });
      setError(null);
      return true;
    } catch (cause) {
      setError(
        `Could not save changes. ${errorMessage(cause)} Existing saved data was kept.`,
      );
      return false;
    }
  }

  function canDiscard(): boolean {
    return !dirty || window.confirm("Discard unsaved comp edits?");
  }

  function edit(next: Comp): void {
    setComp(next);
    setMessage("");
    setError(null);
  }

  function load(compToLoad: Comp, id: string | null): void {
    if (!canDiscard()) return;
    setComp(compToLoad);
    setBaseline(compToLoad);
    setSavedId(id);
    setPicker(null);
    setMessage(id ? `Loaded ${compToLoad.name}.` : "New comp.");
    setError(null);
  }

  function save(name: string, asCopy = false): void {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a comp name before saving.");
      return;
    }
    const nextComp = { ...comp, name: trimmed };
    const id = asCopy || savedId === null ? crypto.randomUUID() : savedId;
    const entry: SavedComp = {
      id,
      comp: nextComp,
      updatedAt: new Date().toISOString(),
    };
    if (
      !commit((current) => [entry, ...current.filter((item) => item.id !== id)])
    )
      return;
    setComp(nextComp);
    setBaseline(nextComp);
    setSavedId(id);
    setNameRequest(null);
    setMessage(`Saved ${trimmed}.`);
  }

  function rename(id: string, name: string): void {
    const renamed = commit((current) =>
      current.map((entry) => {
        if (entry.id !== id) return entry;
        return {
          ...entry,
          comp: { ...entry.comp, name },
          updatedAt: new Date().toISOString(),
        };
      }),
    );
    if (!renamed) return;
    if (savedId === id) {
      setComp((current) => ({ ...current, name }));
      setBaseline((current) => ({ ...current, name }));
    }
    setNameRequest(null);
    setMessage(`Renamed comp to ${name}.`);
  }

  function deleteComp(entry: SavedComp): void {
    if (!window.confirm(`Delete “${entry.comp.name}” from this browser?`))
      return;
    if (!commit((current) => current.filter((item) => item.id !== entry.id)))
      return;
    if (savedId === entry.id) {
      setSavedId(null);
      setBaseline(emptyComp());
    }
    setMessage(`Deleted ${entry.comp.name}.`);
  }

  async function importFile(file: File): Promise<void> {
    try {
      if (file.size > MAX_IMPORT_BYTES)
        throw new Error("The file must be smaller than 2 MB.");
      const imported = parseCompLibrary(await file.text());
      if (!imported.length) throw new Error("This file has no saved comps.");
      const copies = imported.map((entry): SavedComp => ({
        ...entry,
        id: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
      }));
      if (commit((current) => [...copies, ...current]))
        setMessage(
          `Imported ${copies.length} comp${copies.length === 1 ? "" : "s"} as copies.`,
        );
    } catch (cause) {
      setError(`Import failed. ${errorMessage(cause)}`);
    }
  }

  function changeSlot(team: Team, index: number, slot: CompSlot): void {
    const slots = comp.teams[team].map((current, slotIndex) =>
      slotIndex === index ? slot : current,
    );
    edit({ ...comp, teams: { ...comp.teams, [team]: slots } });
  }

  function resetTeam(team: Team): void {
    if (
      !window.confirm(`Clear all heroes and slot notes for ${teamLabel(team)}?`)
    )
      return;
    edit({
      ...comp,
      teams: { ...comp.teams, [team]: emptyComp().teams[team] },
    });
  }

  function choiceError(heroId: string): string | null {
    if (!picker) return "No selection.";
    if (picker.kind === "draft")
      return comp.draft
        ? draftChoiceError(comp.draft, heroId)
        : "No draft selected.";
    if (effects.banned[picker.team].has(heroId)) return "Banned for this team.";
    if (
      comp.teams[picker.team].some(
        (slot, index) => index !== picker.index && slot.heroId === heroId,
      )
    )
      return "Already on this team.";
    return null;
  }

  function chooseHero(selection: HeroSelection): void {
    const { heroId } = selection;
    if (!picker || choiceError(heroId)) return;
    if (picker.kind === "draft" && comp.draft)
      edit({ ...comp, draft: chooseDraftHero(comp.draft, heroId) });
    else if (picker.kind === "slot") {
      const slot = comp.teams[picker.team][picker.index];
      if (slot)
        changeSlot(picker.team, picker.index, {
          ...selection,
          notes: slot.notes,
        });
    }
    setPicker(null);
  }

  function changeDraft(next: DraftState | null): void {
    if (
      comp.draft?.choices.length &&
      !window.confirm(
        "Change draft settings and reset all bans and saves? Heroes and notes will stay.",
      )
    )
      return;
    edit({ ...comp, draft: next });
  }

  function changeMap(mapId: string): void {
    if (mapId !== "" && !COMP_MAPS.some((map) => map.id === mapId)) return;
    if (
      comp.draft?.choices.length &&
      !window.confirm(
        "Change map and reset its draft? Heroes and notes will stay.",
      )
    )
      return;
    edit({
      ...comp,
      mapId: mapId || null,
      draft: comp.draft ? { ...comp.draft, choices: [] } : null,
    });
  }

  function openBoard(): void {
    if (selectedMap?.boardMapId) {
      onOpenBoard(comp, selectedMap.boardMapId);
      return;
    }
    setBoardMapId("");
    setBoardMapOpen(true);
  }

  const draftAction = comp.draft ? draftProgress(comp.draft).action : undefined;
  const pickerTitle =
    picker?.kind === "slot"
      ? `Choose hero · ${teamLabel(picker.team)} · Slot ${picker.index + 1}`
      : `${draftAction?.kind === "save" ? "Save" : "Ban"} hero · ${draftAction ? teamLabel(draftAction.team) : ""}`;

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
          onClick={() => load(emptyComp(), null)}
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
          {filteredComps.map((entry) => (
            <article
              className={`saved-comp${entry.id === savedId ? " selected" : ""}`}
              key={entry.id}
            >
              <button
                type="button"
                className="load-comp"
                onClick={() => load(entry.comp, entry.id)}
                aria-label={`Load ${entry.comp.name}`}
              >
                <strong>{entry.comp.name}</strong>
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
                    downloadJson(
                      serializeCompLibrary([entry]),
                      "rivals-comp.json",
                    )
                  }
                >
                  Export
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${entry.comp.name}`}
                  onClick={() => deleteComp(entry)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
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
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={14} />
              Import
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!library.entries.length}
              onClick={() =>
                downloadJson(
                  serializeCompLibrary(library.entries),
                  "rivals-comps.json",
                )
              }
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
            <p>Set your bans. Build your six. Keep the plan.</p>
          </div>
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
        {library.error && (
          <div className="builder-error" role="alert">
            <p>{library.error} Existing data will not be overwritten.</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                try {
                  downloadJson(
                    localStorage.getItem(COMP_STORAGE_KEY) ?? "",
                    "rivals-comps-recovery.json",
                  );
                } catch (cause) {
                  setError(errorMessage(cause));
                }
              }}
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
          <div className="comp-name-row">
            <label>
              Comp name
              <input
                value={comp.name}
                maxLength={100}
                placeholder="e.g. Midtown dive"
                onChange={(event) =>
                  edit({ ...comp, name: event.currentTarget.value })
                }
              />
            </label>
            <span className={`status-tag status-${status.toLowerCase()}`}>
              {status}
            </span>
            <button
              type="button"
              className="secondary-button"
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
              onClick={() => save(comp.name)}
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
                    changeDraft({
                      format,
                      firstTeam: comp.draft?.firstTeam ?? "ally",
                      choices: [],
                    });
                }}
              >
                <option value="free">Free build</option>
                <option value="mrc">MRC · 4 bans / 2 saves</option>
                <option value="ignite">Ignite · 5 bans / 2 saves</option>
              </select>
            </label>
            {comp.draft && (
              <label>
                Team 1
                <select
                  aria-label="Team 1"
                  value={comp.draft.firstTeam}
                  onChange={(event) => {
                    const team = event.currentTarget.value;
                    if (comp.draft && isTeam(team))
                      changeDraft({
                        ...comp.draft,
                        firstTeam: team,
                        choices: [],
                      });
                  }}
                >
                  <option value="ally">Allies</option>
                  <option value="enemy">Opponents</option>
                </select>
              </label>
            )}
          </div>
        </section>
        {comp.draft && (
          <DraftPanel
            draft={comp.draft}
            onChange={(draft) => edit({ ...comp, draft })}
            onChoose={() => setPicker({ kind: "draft" })}
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
            onChange={(index, slot) => changeSlot(team, index, slot)}
            onReset={() => resetTeam(team)}
          />
        ))}
        <section className="builder-card comp-notes">
          <label>
            <h2>Comp notes</h2>
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
                edit({ ...comp, notes: event.currentTarget.value })
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
          onClose={() => setNameRequest(null)}
          onSubmit={(name) => {
            if (nameRequest.kind === "copy") save(name, true);
            else rename(nameRequest.id, name);
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
