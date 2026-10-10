import Konva from "konva";
import {
  NOTE_FONT_SIZE,
  NOTE_LINE_HEIGHT,
  NOTE_PADDING,
  type MeasureBoardNote,
} from "./boardDrawings";

export function createBoardNote(text: string, width: number): Konva.Text {
  return new Konva.Text({
    text,
    width,
    padding: NOTE_PADDING,
    fontSize: NOTE_FONT_SIZE,
    fontFamily: "Arial",
    lineHeight: NOTE_LINE_HEIGHT,
    wrap: "word",
  });
}

export const measureBoardNote: MeasureBoardNote = (text, width) => {
  const note = createBoardNote(text, width);
  const size = { width: note.width(), height: note.height() };
  note.destroy();
  return size;
};
