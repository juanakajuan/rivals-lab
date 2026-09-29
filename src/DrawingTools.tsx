import { useState } from "react";
import type { BoardDrawing, BoardTool } from "./boardDrawings";

interface DrawingToolsProps {
  readonly tool: BoardTool;
  readonly color: string;
  readonly selected: BoardDrawing | undefined;
  readonly onTool: (tool: BoardTool) => void;
  readonly onColor: (color: string) => void;
  readonly onAdd: () => void;
  readonly onEdit: (drawing: BoardDrawing) => void;
}
const TOOLS: readonly { readonly tool: BoardTool; readonly label: string }[] = [
  { tool: "move", label: "Move" },
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
        <button
          type="button"
          className={
            props.tool === "move" ? "drawing-add-placeholder" : undefined
          }
          disabled={props.tool === "move"}
          onClick={props.onAdd}
        >
          Add at center
        </button>
      </div>
      <p className="drawing-help">
        {props.tool === "move"
          ? "Click any hero or drawing to select it. Drag to move it. Right-click to remove a drawing."
          : props.tool === "note"
            ? "Click empty map space to add a note. Drag existing elements to move them."
            : "Drag on empty map space to draw. Drag existing elements to move them."}
      </p>
      {selected?.kind === "note" ? (
        <div className="drawing-details" aria-label="Selected note">
          <NoteEditor
            key={`${selected.id}:${selected.text}`}
            drawing={selected}
            onEdit={props.onEdit}
          />
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
      className="note-editor drawing-actions"
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
