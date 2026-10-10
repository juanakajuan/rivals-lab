import { useState } from "react";
import { Download, FolderOpen, Plus, Search, Upload } from "lucide-react";
import type { SavedComp } from "./comps";
import type { SavedCompLibraryView } from "./savedComps";
import { SavedCompCard } from "./SavedCompCard";
import { SearchField } from "./ui/SearchField";

export interface CompLibraryPanelProps {
  readonly library: SavedCompLibraryView;
  readonly savedId: string | null;
  readonly writing: boolean;
  readonly onLoad: (entry: SavedComp | null) => void;
  readonly onRename: (entry: SavedComp) => void;
  readonly onExport: (entry: SavedComp) => void;
  readonly onDelete: (entry: SavedComp) => void;
  readonly onImport: () => void;
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
        <div className="library-file-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={writing}
            onClick={onImport}
          >
            <Upload size={14} />
            Import
          </button>
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
        <p>
          Saved in this browser. Export all saves only your comps. To move the
          board, custom maps, and open comp too, use Backup in the top bar.
        </p>
      </div>
    </aside>
  );
}
