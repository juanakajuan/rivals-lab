import { useId, useRef, useState } from "react";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Toggle } from "./components/ui/toggle";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./components/ui/popover";
import { visibleFocusTarget } from "./overlayFocus";
import type { BoardDrawing, BoardTool } from "./boardDrawings";

interface DrawingToolsProps {
  readonly active: boolean;
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
          <Toggle
            key={tool}
            variant="outline"
            size="sm"
            pressed={props.tool === tool}
            onPressedChange={() => props.onTool(tool)}
          >
            {label}
          </Toggle>
        ))}
        <DrawingColor
          key={selected?.id ?? "new"}
          active={props.active}
          color={selected?.color ?? props.color}
          onCommit={(color) => {
            if (selected) props.onEdit({ ...selected, color });
            props.onColor(color);
          }}
        />
        <Button
          variant="outline"
          size="sm"
          type="button"
          className={
            props.tool === "move" ? "drawing-add-placeholder" : undefined
          }
          disabled={props.tool === "move"}
          onClick={props.onAdd}
        >
          Add at center
        </Button>
      </div>
      <p className="drawing-help">
        {[
          {
            active: props.tool === "move",
            text: "Click any hero or drawing to select it. Drag to move it. Right-click to remove a drawing.",
          },
          {
            active: props.tool === "note",
            text: "Click empty map space to add a note. Drag existing elements to move them.",
          },
          {
            active: props.tool === "arrow" || props.tool === "zone",
            text: "Drag on empty map space to draw. Drag existing elements to move them.",
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
  const textId = useId();
  return (
    <form
      className="note-editor drawing-actions"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) onEdit({ ...drawing, text: text.trim() });
      }}
    >
      <div className="note-text-field">
        <Label htmlFor={textId}>Note text</Label>
        <AutoGrowTextarea
          id={textId}
          rows={2}
          value={text}
          maxLength={200}
          onChange={(event) => setText(event.currentTarget.value)}
        />
      </div>
      <Button
        size="sm"
        type="submit"
        disabled={!text.trim() || text.trim() === drawing.text}
      >
        Save note
      </Button>
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
  active,
  color,
  onCommit,
}: {
  readonly active: boolean;
  readonly color: string;
  readonly onCommit: (color: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(color);
  const [open, setOpen] = useState(false);
  const [previousActive, setPreviousActive] = useState(active);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const valid = /^#[0-9a-f]{6}$/i.test(draft);

  if (active !== previousActive) {
    setPreviousActive(active);
    if (!active) setOpen(false);
  }

  return (
    <Popover
      open={active && open}
      onOpenChange={(nextOpen, details) => {
        if (details.reason === "escape-key" && details.event.isComposing) {
          details.cancel();
          return;
        }
        if (nextOpen) setDraft(color);
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger
        render={<Button variant="outline" size="sm" />}
        ref={trigger}
        aria-label="Drawing color"
      >
        Drawing color
        <span
          className="drawing-color-preview"
          style={{ backgroundColor: color }}
        />
      </PopoverTrigger>
      <PopoverContent
        className="drawing-color-popover"
        ref={popup}
        align="start"
        aria-label="Choose drawing color"
        initialFocus={input}
        finalFocus={() => {
          const focused = document.activeElement;
          if (
            focused instanceof HTMLElement &&
            focused !== document.body &&
            focused.getClientRects().length > 0 &&
            !popup.current?.contains(focused)
          )
            return false;
          return visibleFocusTarget(trigger.current);
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            setOpen(false);
            onCommit(draft.toLowerCase());
          }}
        >
          <div
            className="drawing-color-palette"
            role="group"
            aria-label="Preset colors"
          >
            {DRAWING_COLORS.map(({ name, value }) => (
              <Toggle
                key={value}
                variant="outline"
                size="sm"
                className="drawing-color-swatch"
                aria-label={name}
                pressed={draft.toLowerCase() === value}
                onPressedChange={() => setDraft(value)}
              >
                <span style={{ backgroundColor: value }} />
              </Toggle>
            ))}
          </div>
          <div className="drawing-color-field">
            <Label htmlFor={inputId}>Hex color</Label>
            <Input
              ref={input}
              id={inputId}
              type="text"
              value={draft}
              maxLength={7}
              spellCheck={false}
              aria-invalid={!valid}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
          </div>
          <div className="drawing-color-footer">
            <span
              className="drawing-color-preview"
              style={{ backgroundColor: valid ? draft : color }}
            />
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={!valid}>
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
