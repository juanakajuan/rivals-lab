import { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  ArrowUpRight,
  Download,
  FolderOpen,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import {
  BuilderModal,
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
import type { MapId } from "./maps";
import { MapPicker } from "./MapPicker";
import { BOARD_MAP_OPTIONS, COMP_MAP_OPTIONS } from "./mapPickerOptions";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Badge } from "./components/ui/badge";
import { Card } from "./components/ui/card";
import { Alert } from "./components/ui/alert";
import {
  NativeSelect,
  NativeSelectOption,
} from "./components/ui/native-select";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "./components/ui/collapsible";
import { DialogContent } from "./components/ui/dialog";
import { ConfirmAction, type ConfirmationCopy } from "./ConfirmAction";
import { visibleFocusTarget } from "./overlayFocus";
import "./builder.css";

type NameRequest =
  | { readonly kind: "copy"; readonly name: string }
  | { readonly kind: "rename"; readonly id: string; readonly name: string };

type BuilderConfirmation =
  | { readonly kind: "load"; readonly entry: SavedComp | null }
  | { readonly kind: "delete"; readonly entry: SavedComp }
  | Extract<CompEdit, { kind: "resetTeam" | "draftFormat" | "resetDraft" }>;

function confirmationCopy(
  intent: BuilderConfirmation | null,
): ConfirmationCopy {
  switch (intent?.kind) {
    case "load":
      return {
        title: "Discard unsaved comp edits?",
        description: "Your unsaved changes will be lost.",
        confirmLabel: "Discard edits",
      };
    case "delete":
      return {
        title: "Delete comp?",
        description: `Delete “${intent.entry.comp.name}” from this browser?`,
        confirmLabel: "Delete comp",
      };
    case "resetTeam":
      return {
        title: `Reset ${teamLabel(intent.team)}?`,
        description: `Clear all heroes and slot notes for ${teamLabel(intent.team)}?`,
        confirmLabel: "Reset team",
      };
    case "draftFormat":
      return {
        title: "Change draft settings?",
        description:
          "Change draft settings and reset all bans and saves? Heroes and notes will stay.",
        confirmLabel: "Change draft",
      };
    case "resetDraft":
      return {
        title: "Reset draft?",
        description:
          "Reset all bans and saves? Comp heroes and notes will stay.",
        confirmLabel: "Reset draft",
      };
    case undefined:
      return {
        title: "Confirm action",
        description: "",
        confirmLabel: "Confirm",
      };
  }
}

function focusedElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
}

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
  open,
  request,
  pending,
  onClose,
  onSubmit,
  finalFocus,
}: {
  readonly finalFocus: ComponentProps<typeof DialogContent>["finalFocus"];
  readonly open: boolean;
  readonly request: NameRequest | null;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (name: string) => void;
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [closedTitle, setClosedTitle] = useState("Save comp as");
  const title = request
    ? request.kind === "copy"
      ? "Save comp as"
      : "Rename comp"
    : closedTitle;
  useEffect(() => {
    if (!request) return;
    setName(request.name);
    setClosedTitle(request.kind === "copy" ? "Save comp as" : "Rename comp");
  }, [request]);
  return (
    <BuilderModal
      open={open}
      title={title}
      onClose={onClose}
      initialFocus={inputRef}
      finalFocus={finalFocus}
    >
      <form
        className="dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmedName = name.trim();
          if (trimmedName) onSubmit(trimmedName);
        }}
      >
        <Label>
          Comp name
          <Input
            ref={inputRef}
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </Label>
        <div className="dialog-actions">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !name.trim()}>
            Save name
          </Button>
        </div>
      </form>
    </BuilderModal>
  );
}

export function CompBuilder({
  active,
  onOpenBoard,
}: {
  readonly active: boolean;
  readonly onOpenBoard: (
    comp: Comp,
    mapId: MapId,
    opener?: HTMLElement | null,
  ) => void;
}): React.JSX.Element {
  const [session] = useState(() => new SavedCompSession());
  const [savedState, setSavedState] = useState(() => session.state);
  const { comp, savedId, dirty, library } = savedState;
  const [librarySearch, setLibrarySearch] = useState("");
  const [picker, setPicker] = useState<CompHeroTarget | null>(null);
  const [nameRequest, setNameRequest] = useState<NameRequest | null>(null);
  const [confirmation, setConfirmation] = useState<BuilderConfirmation | null>(
    null,
  );
  const confirmationOpener = useRef<HTMLElement | null>(null);
  const pickerOpener = useRef<HTMLElement | null>(null);
  const nameOpener = useRef<HTMLElement | null>(null);
  const activeRef = useRef(active);
  const activeCycle = useRef(0);
  activeRef.current = active;
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
  const supportedBoardMapId = selectedMap?.boardMapId;
  const boardTransferDisabled = !TEAMS.some((team) =>
    comp.teams[team].some((slot) => slot.heroId),
  );
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
    if (active) return;
    activeCycle.current += 1;
    setPicker(null);
    setNameRequest(null);
    setConfirmation(null);
  }, [active]);

  function openHeroPicker(target: CompHeroTarget): void {
    pickerOpener.current = focusedElement();
    setPicker(target);
  }

  function openNameDialog(request: NameRequest): void {
    nameOpener.current = focusedElement();
    setNameRequest(request);
  }

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
    setSavedState(session.load(entry));
    setPicker(null);
    setMessage(entry ? `Loaded ${entry.comp.name}.` : "New comp.");
    setError(null);
  }

  async function applyConfirmation(intent: BuilderConfirmation): Promise<void> {
    if (intent.kind === "load" || intent.kind === "delete") {
      const entry = intent.entry;
      if (entry) {
        const currentComp = session.state.comp;
        const requestedCycle = activeCycle.current;
        await session.refresh();
        setSavedState(session.state);
        if (!activeRef.current || activeCycle.current !== requestedCycle)
          return;
        if (intent.kind === "load" && session.state.comp !== currentComp) {
          setError(
            "Your comp changed while loading. Your edits were kept. Choose the saved comp again.",
          );
          return;
        }
        const current = session.state.library.entries.find(
          (item) => item.id === entry.id,
        );
        if (!current || JSON.stringify(current) !== JSON.stringify(entry)) {
          setError(
            current
              ? "This comp changed in another tab. Your edits were kept. Choose the saved comp again."
              : "This comp was deleted in another tab. Your edits were kept.",
          );
          return;
        }
      }
      if (intent.kind === "load") load(intent.entry);
      else if (await commit(() => session.remove(intent.entry.id)))
        setMessage(`Deleted ${intent.entry.comp.name}.`);
      return;
    }
    edit(intent);
  }

  function request(intent: BuilderConfirmation): void {
    const requiresApproval =
      (intent.kind !== "load" && intent.kind !== "draftFormat") ||
      (intent.kind === "load" && session.state.dirty) ||
      (intent.kind === "draftFormat" && hasDraftChoices(session.state.comp));
    if (!requiresApproval) {
      void applyConfirmation(intent);
      return;
    }
    confirmationOpener.current = focusedElement();
    setConfirmation(intent);
  }

  function confirmPending(): void {
    if (!active || !confirmation) return;
    const intent = confirmation;
    setConfirmation(null);
    void applyConfirmation(intent);
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

  function choiceError(heroId: string): string | null {
    return picker ? compChoiceError(comp, picker, heroId) : "No selection.";
  }

  function chooseHero(selection: HeroSelection): void {
    if (picker && edit({ kind: "chooseHero", target: picker, selection }))
      setPicker(null);
  }

  function changeDraft(format: DraftFormat | null): void {
    request({ kind: "draftFormat", format });
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
      <aside className="comp-library" aria-labelledby="library-heading">
        <div className="library-heading">
          <FolderOpen size={18} />
          <h2 id="library-heading">Saved comps</h2>
          <Badge variant="secondary">{library.entries.length}</Badge>
        </div>
        <Button
          type="button"
          className="wide-button"
          onClick={() => request({ kind: "load", entry: null })}
        >
          <Plus size={15} />
          New comp
        </Button>
        <Label className="builder-search">
          <Search size={15} />
          <Input
            type="search"
            placeholder="Search comps…"
            aria-label="Search saved comps"
            value={librarySearch}
            onChange={(event) => setLibrarySearch(event.currentTarget.value)}
          />
        </Label>
        <div className="library-list">
          {filteredComps.map((entry) => {
            const savedMap = COMP_MAPS.find(
              (map) => map.id === entry.comp.mapId,
            );
            return (
              <Card
                render={<article />}
                size="sm"
                className={`saved-comp shrink-0${entry.id === savedId ? " selected" : ""}`}
                key={entry.id}
              >
                <Button
                  type="button"
                  variant="ghost"
                  className="load-comp"
                  onClick={() => request({ kind: "load", entry })}
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
                </Button>
                <div className="saved-comp-actions">
                  <Button
                    variant="ghost"
                    size="xs"
                    type="button"
                    aria-label={`Rename ${entry.comp.name}`}
                    disabled={writing}
                    onClick={() =>
                      openNameDialog({
                        kind: "rename",
                        id: entry.id,
                        name: entry.comp.name,
                      })
                    }
                  >
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    type="button"
                    aria-label={`Export ${entry.comp.name}`}
                    onClick={() =>
                      void exportStoredData("rivals-comp.json", entry)
                    }
                  >
                    Export
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    type="button"
                    aria-label={`Delete ${entry.comp.name}`}
                    disabled={writing}
                    onClick={() => request({ kind: "delete", entry })}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
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
            <Button
              type="button"
              variant="outline"
              disabled={writing}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={14} />
              Import
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!library.entries.length && !library.error}
              onClick={() => void exportStoredData("rivals-comps.json")}
            >
              <Download size={14} />
              Export all
            </Button>
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
            <Button
              type="button"
              variant="outline"
              disabled={exportingImage}
              aria-busy={exportingImage}
              onClick={() => void shareImage()}
            >
              <Download size={15} />
              {exportingImage ? "Preparing image…" : "Download & Copy"}
            </Button>
            {supportedBoardMapId !== undefined ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenBoard(comp, supportedBoardMapId)}
                disabled={boardTransferDisabled}
              >
                Open on Position Board <ArrowUpRight size={15} />
              </Button>
            ) : (
              <MapPicker<MapId>
                active={active}
                options={BOARD_MAP_OPTIONS}
                selectedValue={undefined}
                triggerLabel="Open on Position Board"
                triggerContent={
                  <>
                    Open on Position Board <ArrowUpRight size={15} />
                  </>
                }
                disabled={boardTransferDisabled}
                title="Choose a Position Board map"
                description={`${selectedMap ? `${selectedMap.name} has no board image yet.` : "This comp has no map selected."} Choose a supported map. The saved comp’s map will stay unchanged.`}
                onChoose={(mapId, opener) => onOpenBoard(comp, mapId, opener)}
              />
            )}
          </div>
        </div>
        {library.error && (
          <Alert variant="destructive" className="builder-error">
            <p>
              {library.error}{" "}
              {library.unavailableCount
                ? "Entries that cannot be loaded stay stored for recovery."
                : "Existing data will not be overwritten."}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void exportStoredData("rivals-comps-recovery.json")
              }
            >
              Export stored data for recovery
            </Button>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="builder-error">
            {error}
          </Alert>
        )}
        <div className="save-status" role="status">
          {saveStatus}
        </div>
        <Card
          render={<section />}
          className="builder-card comp-settings"
          aria-label="Comp settings"
        >
          <div className="comp-settings-fields">
            <div className="comp-name-row">
              <Label>
                Comp name
                <Input
                  value={comp.name}
                  maxLength={100}
                  placeholder="e.g. Midtown dive"
                  onChange={(event) =>
                    edit({ kind: "name", value: event.currentTarget.value })
                  }
                />
              </Label>
              <Badge
                variant="secondary"
                className={`status-tag status-${status.toLowerCase()}`}
              >
                {status}
              </Badge>
              <Button
                type="button"
                variant="outline"
                disabled={writing}
                onClick={() =>
                  openNameDialog({
                    kind: "copy",
                    name: comp.name ? `${comp.name.slice(0, 93)} (copy)` : "",
                  })
                }
              >
                Save As
              </Button>
              <Button
                type="button"
                disabled={writing}
                aria-busy={writing}
                onClick={() => void save(comp.name)}
              >
                Save
              </Button>
            </div>
            <div className="settings-grid">
              <div className="comp-map-field">
                <span>Comp map</span>
                <MapPicker<string | null>
                  active={active}
                  options={COMP_MAP_OPTIONS}
                  selectedValue={comp.mapId}
                  triggerLabel="Comp map"
                  triggerContent={
                    selectedMap
                      ? `${selectedMap.name} · ${selectedMap.mode}`
                      : "Any map"
                  }
                  title="Choose comp map"
                  onChoose={changeMap}
                />
              </div>
              <Label>
                Draft format
                <NativeSelect
                  aria-label="Draft format"
                  value={comp.draft?.format ?? "free"}
                  onChange={(event) => {
                    const format = event.currentTarget.value;
                    if (format === "free") changeDraft(null);
                    else if (format === "mrc" || format === "ignite")
                      changeDraft(format);
                  }}
                >
                  <NativeSelectOption value="free">
                    Free build
                  </NativeSelectOption>
                  <NativeSelectOption value="mrc">
                    MRC · 4 bans / 2 saves
                  </NativeSelectOption>
                  <NativeSelectOption value="ignite">
                    Ignite · 5 bans / 2 saves
                  </NativeSelectOption>
                </NativeSelect>
              </Label>
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
        </Card>
        {comp.draft && (
          <DraftPanel
            draft={comp.draft}
            onEdit={edit}
            onChoose={(slot) => openHeroPicker({ kind: "draft", slot })}
            onResetDraft={() => request({ kind: "resetDraft" })}
          />
        )}
        {status === "Conflict" && (
          <Alert variant="destructive" className="builder-error">
            A comp hero is banned. Replace that hero or change the draft. You
            can still save this plan.
          </Alert>
        )}
        {TEAMS.map((team) => (
          <TeamEditor
            key={team}
            team={team}
            slots={comp.teams[team]}
            banned={effects.banned[team]}
            onChoose={(index) => openHeroPicker({ kind: "slot", team, index })}
            onEdit={edit}
            onReset={() => request({ kind: "resetTeam", team })}
          />
        ))}
        <Card render={<section />} className="builder-card comp-notes">
          <Label>
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
          </Label>
        </Card>
        <Collapsible className="rules-reference">
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
            Rules and map sources
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p>
              Configured 23 September 2026. These sequences use the agreed MRC
              and Ignite rules. Public rulebooks can describe older formats.
              Saves protect heroes from later bans; they do not reverse bans.
              Every action is required in this planner.
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
              The planning list includes The God Quarry from the 24 September
              2026 update. It is separate from the 8 September Ignite Stage 2
              event pool. Check your event's current map pool.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </div>
      {active && picker && (
        <HeroPicker
          title={pickerTitle}
          mode={picker.kind === "slot" ? "comp" : "draft"}
          unavailable={choiceError}
          onChoose={chooseHero}
          onClose={() => setPicker(null)}
          finalFocus={() => visibleFocusTarget(pickerOpener.current)}
        />
      )}
      <NameDialog
        open={active && nameRequest !== null}
        request={nameRequest}
        finalFocus={() => visibleFocusTarget(nameOpener.current)}
        pending={writing}
        onClose={() => setNameRequest(null)}
        onSubmit={(name) => {
          if (!active || !nameRequest) return;
          if (nameRequest.kind === "copy") void save(name, true);
          else void rename(nameRequest.id, name);
        }}
      />
      <ConfirmAction
        open={active && confirmation !== null}
        copy={confirmationCopy(confirmation)}
        onCancel={() => setConfirmation(null)}
        onConfirm={confirmPending}
        finalFocus={() => visibleFocusTarget(confirmationOpener.current)}
      />
    </main>
  );
}
