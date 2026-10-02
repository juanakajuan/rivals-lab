import Konva from "konva";
import type { MeasureBoardNote } from "./boardDrawings";

export function createBoardNote(text: string): Konva.Text {
  return new Konva.Text({
    text,
    width: 180,
    padding: 8,
    fontSize: 20,
    fontFamily: "Arial",
    lineHeight: 1,
    wrap: "word",
  });
}

export const measureBoardNote: MeasureBoardNote = (text) => {
  const note = createBoardNote(text);
  const size = { width: note.width(), height: note.height() };
  note.destroy();
  return size;
};
