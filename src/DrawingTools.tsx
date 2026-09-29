import { useState } from "react";
import type { BoardDrawing, BoardTool } from "./boardDrawings";

interface DrawingToolsProps {
  readonly tool: BoardTool;
  readonly color: string;
  readonly drawings: readonly BoardDrawing[];
  readonly selected: BoardDrawing | undefined;
  readonly onTool: (tool: BoardTool) => void;
  readonly onColor: (color: string) => void;
  readonly onAdd: () => void;
  readonly onSelect: (id: string) => void;
  readonly onEdit: (drawing: BoardDrawing) => void;
  readonly onRemove: () => void;
}
const TOOLS: readonly { readonly tool: BoardTool; readonly label: string }[] = [
  { tool: "heroes", label: "Move heroes" },
  { tool: "select", label: "Select drawings" },
  { tool: "arrow", label: "Draw arrow" },
  { tool: "zone", label: "Draw zone" },
  { tool: "note", label: "Add note" },
];

export function DrawingTools(props: DrawingToolsProps): React.JSX.Element {
  const { selected } = props;
  return (
    <div className="drawing-tools">
      <div className="drawing-actions" role="group" aria-label="Board mode">
        {TOOLS.map(({ tool, label }) => (
          <button
            key={tool}
            type="button"
            aria-pressed={props.tool === tool}
            onClick={() => props.onTool(tool)}
          >
            {label}
          </button>
        ))}
        <DrawingColor
          key={`${selected?.id ?? "new"}:${selected?.color ?? props.color}`}
          color={selected?.color ?? props.color}
          onCommit={(color) => {
            if (selected) props.onEdit({ ...selected, color });
            props.onColor(color);
          }}
        />
        {props.tool !== "heroes" && props.tool !== "select" ? (
          <button type="button" onClick={props.onAdd}>
            Add at center
          </button>
        ) : null}
      </div>
      <p className="drawing-help">
        {props.tool === "heroes"
          ? "Hero movement mode. Drag heroes to move them."
          : props.tool === "select"
            ? "Drawing selection mode. Drag a drawing to move it, or use the arrow keys."
            : props.tool === "note"
              ? "Note mode. Click the map to add a note, or use Add at center."
              : "Drawing mode. Drag on the map, or use Add at center."}
      </p>
      {props.drawings.length > 0 ? (
        <div
          className="drawing-actions drawing-list"
          role="group"
          aria-label="Drawings on this map"
        >
          {props.drawings.map((drawing, index) => (
            <button
              key={drawing.id}
              type="button"
              aria-pressed={drawing.id === selected?.id}
              onClick={() => props.onSelect(drawing.id)}
            >
              {drawing.kind === "note"
                ? `Note ${index + 1}: ${drawing.text}`
                : `${drawing.kind === "arrow" ? "Arrow" : "Zone"} ${index + 1}`}
            </button>
          ))}
        </div>
      ) : null}
      {selected ? (
        <div
          className="drawing-actions"
          role="group"
          aria-label="Selected drawing actions"
        >
          <button type="button" onClick={props.onRemove}>
            Remove drawing
          </button>
          {selected.kind === "note" ? (
            <NoteEditor
              key={`${selected.id}:${selected.text}`}
              drawing={selected}
              onEdit={props.onEdit}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
function NoteEditor({
  drawing,
  onEdit,
}: {
  readonly drawing: BoardDrawing & { readonly kind: "note" };
  readonly onEdit: (drawing: BoardDrawing) => void;
}): React.JSX.Element {
  const [text, setText] = useState(drawing.text);
  return (
    <form
      className="note-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) onEdit({ ...drawing, text: text.trim() });
      }}
    >
      <label>
        Note text{" "}
        <textarea
          value={text}
          maxLength={200}
          onChange={(event) => setText(event.currentTarget.value)}
        />
      </label>
      <button
        type="submit"
        disabled={!text.trim() || text.trim() === drawing.text}
      >
        Save note
      </button>
    </form>
  );
}

// A color picker can emit many input events. Commit once when focus leaves it.
function DrawingColor({
  color,
  onCommit,
}: {
  readonly color: string;
  readonly onCommit: (color: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(color);
  return (
    <label>
      Drawing color{" "}
      <input
        type="color"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={(event) => {
          const value = event.currentTarget.value;
          if (/^#[0-9a-f]{6}$/i.test(value)) onCommit(value);
        }}
      />
    </label>
  );
}
