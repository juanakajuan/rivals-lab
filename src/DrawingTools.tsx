import { useEffect, useRef, useState } from "react";
import {
  MAX_NOTE_LENGTH,
  type BoardDrawing,
  type BoardTool,
} from "./boardDrawings";

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
        {[
          {
            active: props.tool === "move",
            text: "Click any hero or drawing to select it. Drag to move it. Right-click to remove a drawing. Drag a white handle to resize the selection.",
          },
          {
            active: props.tool === "note",
            text: "Click empty map space to add a note. Drag existing elements to move them. Drag a white handle to resize the selection.",
          },
          {
            active: props.tool === "arrow" || props.tool === "zone",
            text: "Drag on empty map space to draw. Drag existing elements to move them. Drag a white handle to resize the selection.",
          },
        ].map(({ active, text }) => (
          <span
            key={text}
            aria-hidden={!active}
            style={{ visibility: active ? "visible" : "hidden" }}
          >
            {text}
          </span>
        ))}
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
          maxLength={MAX_NOTE_LENGTH}
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

const DRAWING_COLORS: readonly {
  readonly name: string;
  readonly value: string;
}[] = [
  { name: "Yellow", value: "#ffd166" },
  { name: "Orange", value: "#f49d50" },
  { name: "Red", value: "#df6670" },
  { name: "Pink", value: "#e891c3" },
  { name: "Purple", value: "#a78bfa" },
  { name: "Blue", value: "#6872d9" },
  { name: "Cyan", value: "#67d5e8" },
  { name: "Green", value: "#6ed6a0" },
  { name: "White", value: "#f4f5f8" },
  { name: "Gray", value: "#8a8f98" },
];

function DrawingColor({
  color,
  onCommit,
}: {
  readonly color: string;
  readonly onCommit: (color: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(color);
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const valid = /^#[0-9a-f]{6}$/i.test(draft);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent): void {
      if (
        event.target instanceof Node &&
        !picker.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  function close(): void {
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div
      className="drawing-color"
      ref={picker}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="drawing-color-trigger"
        aria-label="Drawing color"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setDraft(color);
          setOpen(!open);
        }}
      >
        Drawing color
        <span
          className="drawing-color-preview"
          style={{ backgroundColor: color }}
        />
      </button>
      {open ? (
        <form
          className="drawing-color-popover"
          role="dialog"
          aria-label="Choose drawing color"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            close();
            onCommit(draft.toLowerCase());
          }}
        >
          <div
            className="drawing-color-palette"
            role="group"
            aria-label="Preset colors"
          >
            {DRAWING_COLORS.map(({ name, value }) => (
              <button
                key={value}
                type="button"
                className="drawing-color-swatch"
                aria-label={name}
                aria-pressed={draft.toLowerCase() === value}
                onClick={() => setDraft(value)}
              >
                <span style={{ backgroundColor: value }} />
              </button>
            ))}
          </div>
          <label>
            Hex color
            <input
              autoFocus
              type="text"
              value={draft}
              maxLength={7}
              spellCheck={false}
              aria-invalid={!valid}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
          </label>
          <div className="drawing-color-footer">
            <span
              className="drawing-color-preview"
              style={{ backgroundColor: valid ? draft : color }}
            />
            <button type="button" onClick={close}>
              Cancel
            </button>
            <button type="submit" disabled={!valid}>
              Apply
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
