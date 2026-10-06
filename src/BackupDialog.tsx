import { useEffect, useState } from "react";
import { DatabaseBackup, Download, Upload } from "lucide-react";
import {
  applyImport,
  exportBackup,
  readImportFile,
  REPLACED_ELSEWHERE_MESSAGE,
  type AutosaveStatus,
  type DataSummary,
  type ImportPlan,
  type WorkspaceAutosave,
} from "./appData";
import { Dialog } from "./ui/Dialog";
import { FilePickerButton } from "./ui/FilePickerButton";

type BackupStep =
  | {
      readonly kind: "choose";
      readonly notice: {
        readonly kind: "error" | "done";
        readonly text: string;
      } | null;
    }
  | { readonly kind: "busy"; readonly label: string }
  | { readonly kind: "preview"; readonly plan: ImportPlan };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The operation failed.";
}

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

const EXPORTED_AT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function fileContents(file: DataSummary): string {
  const comps = file.unavailableComps
    ? `${count(file.savedComps, "saved comp")} (${file.unavailableComps} cannot be loaded)`
    : count(file.savedComps, "saved comp");
  const openComp = file.openComp
    ? `${file.openComp.name.trim() ? `the open comp “${file.openComp.name}”` : "an unnamed open comp"}${file.openComp.unsaved ? " (unsaved changes)" : ""}`
    : "no open comp";
  const drawings = file.drawings
    ? `${count(file.drawings, "drawing")} on ${count(file.mapsWithDrawings, "map")}`
    : "no drawings";
  const maps = file.customMaps
    ? `${count(file.customMaps, "custom map image")} (${megabytes(file.customMapBytes)})`
    : "no custom map images";
  return `${comps}, ${openComp}, a board on “${file.boardMapName}” with ${count(file.heroes, "hero")} and ${drawings}, ${maps}, and icon size ${file.iconSize}%`;
}

function RestorePreview({
  plan,
  onCancel,
  onConfirm,
  onBackupFirst,
}: {
  readonly plan: ImportPlan;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly onBackupFirst: () => void;
}): React.JSX.Element | null {
  const { preview } = plan;
  if (preview.kind === "addComps")
    return (
      <section className="backup-preview" aria-labelledby="backup-preview">
        <h3 id="backup-preview">
          Add {count(preview.count, "comp")} as copies?
        </h3>
        <p>Your board, open comp, and other saved comps stay as they are.</p>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={onConfirm}>
            Add comps
          </button>
        </div>
      </section>
    );
  const { file, current } = preview;
  return (
    <section className="backup-preview" aria-labelledby="backup-preview">
      <h3 id="backup-preview">Replace everything in this browser?</h3>
      <p>
        The file (exported {EXPORTED_AT.format(new Date(preview.exportedAt))})
        has {fileContents(file)}.
      </p>
      {file.openComp?.link === "detached" ? (
        <p>The open comp is kept, but it is no longer tied to a saved comp.</p>
      ) : null}
      <p>
        This browser has {count(current.savedComps, "saved comp")} and{" "}
        {count(current.customMaps, "custom map image")} now. They will be{" "}
        <strong>replaced</strong>.
      </p>
      <div className="dialog-actions backup-preview-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onBackupFirst}
        >
          <Download size={14} />
          Download this browser’s backup first
        </button>
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary-button" onClick={onConfirm}>
          Replace browser data
        </button>
      </div>
    </section>
  );
}

export function BackupButton({
  onClick,
}: {
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="secondary-button backup-button"
      aria-label="Backup"
      onClick={onClick}
    >
      <DatabaseBackup size={16} aria-hidden="true" />
      <span>Backup</span>
    </button>
  );
}

export function BackupDialog({
  onClose,
}: {
  readonly onClose: () => void;
}): React.JSX.Element {
  const [step, setStep] = useState<BackupStep>({
    kind: "choose",
    notice: null,
  });
  const busy = step.kind === "busy";

  async function download(): Promise<boolean> {
    try {
      await exportBackup();
      return true;
    } catch (error) {
      setStep({
        kind: "choose",
        notice: {
          kind: "error",
          text: `Could not create the backup. ${errorMessage(error)}`,
        },
      });
      return false;
    }
  }

  async function choose(file: File): Promise<void> {
    setStep({ kind: "busy", label: `Checking ${file.name}…` });
    try {
      setStep({ kind: "preview", plan: await readImportFile(file) });
    } catch (error) {
      setStep({
        kind: "choose",
        notice: {
          kind: "error",
          text: `Import failed. ${errorMessage(error)}`,
        },
      });
    }
  }

  async function confirm(plan: ImportPlan): Promise<void> {
    setStep({
      kind: "busy",
      label:
        plan.preview.kind === "restore"
          ? "Replacing browser data…"
          : "Adding comps…",
    });
    try {
      const outcome = await applyImport(plan);
      if (outcome.kind === "added")
        setStep({
          kind: "choose",
          notice: {
            kind: "done",
            text: `Imported ${count(outcome.count, "comp")} as copies.`,
          },
        });
    } catch (error) {
      setStep({
        kind: "choose",
        notice: {
          kind: "error",
          text: `Import failed. ${errorMessage(error)}`,
        },
      });
    }
  }

  return (
    <Dialog
      appearance="builder"
      openOnMount
      title="Back up everything in this browser"
      onCancel={onClose}
      onRequestClose={onClose}
    >
      <div className="backup-dialog">
        <p>
          One file holds your saved comps, the comp open in the builder, the
          Position Board (heroes, and the drawings and notes on every map), your
          custom map images, and hero icon size. Open it in another browser to
          continue where you left off. Undo history is not included.
        </p>
        {step.kind === "preview" ? (
          <RestorePreview
            plan={step.plan}
            onCancel={() => setStep({ kind: "choose", notice: null })}
            onConfirm={() => void confirm(step.plan)}
            onBackupFirst={() => void download()}
          />
        ) : (
          <>
            <div className="backup-choices">
              <div>
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void download()}
                >
                  <Download size={14} />
                  Download full backup
                </button>
                <p>
                  Saves <code>rivals-lab-backup-YYYY-MM-DD.json</code>.
                </p>
              </div>
              <div>
                <FilePickerButton
                  accept=".json,application/json"
                  inputLabel="Import backup or comps file"
                  inputAppearance="hidden"
                  buttonClassName="secondary-button"
                  disabled={busy}
                  onFile={(file) => void choose(file)}
                >
                  <Upload size={14} />
                  Import file…
                </FilePickerButton>
                <p>
                  Takes a full backup, or a comps file from{" "}
                  <strong>Export all</strong> or a comp card’s{" "}
                  <strong>Export</strong>.
                </p>
              </div>
            </div>
            <p className="muted-copy">
              A comp card’s <strong>Export</strong> saves one comp.{" "}
              <strong>Export all</strong> saves only your comps.{" "}
              <strong>Download &amp; Copy</strong> makes an image of the open
              comp.
            </p>
          </>
        )}
        {step.kind === "busy" ? (
          <p role="status" aria-busy="true">
            {step.label}
          </p>
        ) : null}
        {step.kind === "choose" && step.notice?.kind === "done" ? (
          <p role="status">{step.notice.text}</p>
        ) : null}
        {step.kind === "choose" && step.notice?.kind === "error" ? (
          <p className="builder-error" role="alert">
            {step.notice.text}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function useAutosaveStatus(autosave: WorkspaceAutosave): AutosaveStatus {
  const [status, setStatus] = useState<AutosaveStatus>({ kind: "idle" });
  useEffect(() => autosave.subscribe(setStatus), [autosave]);
  return status;
}

export function StorageNotice({
  autosave,
}: {
  readonly autosave: WorkspaceAutosave;
}): React.JSX.Element | null {
  const status = useAutosaveStatus(autosave);
  if (status.kind === "replacedElsewhere")
    return (
      <div className="storage-notice" role="alert">
        <p>{REPLACED_ELSEWHERE_MESSAGE}</p>
        <button
          type="button"
          className="primary-button"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  if (status.kind === "failed")
    return (
      <div className="storage-notice" role="alert">
        <p>
          This browser could not keep the latest board and open comp.{" "}
          {status.message}
        </p>
      </div>
    );
  return null;
}
