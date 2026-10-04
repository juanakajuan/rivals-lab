import { useState } from "react";
import { Download, FolderOpen, Plus, Search, Upload } from "lucide-react";
import type { SavedComp } from "./comps";
import type { SavedCompLibraryView } from "./savedComps";
import { SavedCompCard } from "./SavedCompCard";
import { SearchField } from "./ui/SearchField";
import { FilePickerButton } from "./ui/FilePickerButton";

export interface CompLibraryPanelProps {
  readonly library: SavedCompLibraryView;
  readonly savedId: string | null;
  readonly writing: boolean;
  readonly onLoad: (entry: SavedComp | null) => void;
  readonly onRename: (entry: SavedComp) => void;
  readonly onExport: (entry: SavedComp) => void;
  readonly onDelete: (entry: SavedComp) => void;
  readonly onImport: (file: File) => void;
  readonly onExportAll: () => void;
}

export function CompLibraryPanel({
  library,
  savedId,
  writing,
  onLoad,
  onRename,
  onExport,
  onDelete,
  onImport,
  onExportAll,
}: CompLibraryPanelProps): React.JSX.Element {
  const [librarySearch, setLibrarySearch] = useState("");
  const search = librarySearch.trim().toLowerCase();
  const filteredComps = library.entries.filter((entry) =>
    entry.comp.name.toLowerCase().includes(search),
  );
  return (
    <aside className="comp-library" aria-labelledby="library-heading">
      <div className="library-heading">
        <FolderOpen size={18} />
        <h2 id="library-heading">Saved comps</h2>
        <span>{library.entries.length}</span>
      </div>
      <button
        type="button"
        className="primary-button wide-button"
        onClick={() => onLoad(null)}
      >
        <Plus size={15} />
        New comp
      </button>
      <SearchField
        wrapper="label"
        className="builder-search"
        label="Search saved comps"
        placeholder="Search comps…"
        value={librarySearch}
        onValueChange={setLibrarySearch}
        icon={<Search size={15} />}
      />
      <div className="library-list">
        {filteredComps.map((entry) => (
          <SavedCompCard
            key={entry.id}
            entry={entry}
            savedId={savedId}
            writing={writing}
            onLoad={onLoad}
            onRename={onRename}
            onExport={onExport}
            onDelete={onDelete}
          />
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
        <FilePickerButton
          accept=".json,application/json"
          inputLabel="Import comps JSON"
          inputAppearance="hidden"
          buttonClassName="secondary-button"
          disabled={writing}
          onFile={onImport}
          render={({ button, input }) => (
            <>
              <div className="library-file-actions">
                {button}
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!library.entries.length && !library.error}
                  onClick={onExportAll}
                >
                  <Download size={14} />
                  Export all
                </button>
              </div>
              {input}
            </>
          )}
        >
          <Upload size={14} />
          Import
        </FilePickerButton>
        <p>
          Saved in this browser. Export a file to back up or move your comps.
        </p>
      </div>
    </aside>
  );
}
