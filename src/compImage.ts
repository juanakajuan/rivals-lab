import { COMP_MAPS } from "./compMaps";
import { compStatus, type Comp } from "./comps";
import { draftEffects, draftPhases } from "./draft";
import {
  HERO_BY_ID,
  heroImagePath,
  selectedHeroRole,
  teamLabel,
  type Team,
} from "./heroes";

const WIDTH = 1000;
const PADDING = 40;
const COLUMN_HEIGHT = 8000;
const TEAMS: readonly Team[] = ["ally", "enemy"];

interface ImageRow {
  readonly text: string;
  readonly size: number;
  readonly color: string;
  readonly heroId?: string;
}

function buildRows(comp: Comp): readonly ImageRow[] {
  const rows: ImageRow[] = [];
  const text = (value: string, size = 20, color = "#e6edf6"): void => {
    rows.push({ text: value, size, color });
  };
  text("RIVALS LAB · DRAFT / COMP BUILDER", 18, "#a7b7cd");
  text(comp.name || "Untitled comp", 32);
  const map = COMP_MAPS.find((entry) => entry.id === comp.mapId);
  text(`Map: ${map ? `${map.name} · ${map.mode}` : "Not selected"}`);
  text(`Build: ${compStatus(comp)}`, 18, "#a7b7cd");
  const effects = draftEffects(comp.draft);
  for (const team of TEAMS) {
    text(teamLabel(team), 28, team === "ally" ? "#6edbd5" : "#ffa5ab");
    comp.teams[team].forEach((slot, index) => {
      const hero = slot.heroId ? HERO_BY_ID.get(slot.heroId) : undefined;
      const role = selectedHeroRole(slot.heroId, slot.deadpoolRole);
      rows.push({
        text: `${index + 1}. ${hero?.name ?? "Empty slot"}${role ? ` · ${role}` : ""}`,
        size: 22,
        color: "#ffffff",
        ...(hero ? { heroId: hero.id } : {}),
      });
      if (slot.heroId && effects.banned[team].has(slot.heroId))
        text("Banned for this team", 18, "#ffa5ab");
      if (slot.notes) text(slot.notes);
    });
  }
  text("Draft", 28, "#6edbd5");
  if (comp.draft) {
    const draft = comp.draft;
    text(`${draft.format.toUpperCase()} · ${teamLabel(draft.firstTeam)} first`);
    text(
      draft.format === "mrc"
        ? "Bans and saves apply to both teams."
        : "Ban for the opponent. Save for your team.",
      18,
      "#a7b7cd",
    );
    let choiceIndex = 0;
    for (const [phaseIndex, phase] of draftPhases(draft).entries()) {
      const pending =
        phase.length > 1 &&
        draft.choices.length > choiceIndex &&
        draft.choices.length < choiceIndex + phase.length;
      for (const action of phase) {
        const heroId = draft.choices[choiceIndex++];
        rows.push({
          text: `Step ${phaseIndex + 1}${phase.length > 1 ? " · Both ban" : ""} · ${teamLabel(action.team)} · ${action.kind === "ban" ? "Ban" : "Save"}: ${heroId ? HERO_BY_ID.get(heroId)?.name : "Not selected"}${pending && heroId ? " (pending joint ban)" : ""}`,
          size: 20,
          color: "#e6edf6",
          ...(heroId ? { heroId } : {}),
        });
      }
    }
  } else text("Free build · No draft selected");
  text("Comp notes", 28, "#6edbd5");
  text(comp.notes || "No notes");
  return rows;
}

/** Wrap without losing newlines or clipping long words and pasted URLs. */
function wrapText(
  context: CanvasRenderingContext2D,
  value: string,
  width: number,
): readonly string[] {
  return value.split(/\r\n|\r|\n/).flatMap((paragraph) => {
    const lines: string[] = [];
    let line = "";
    for (const word of paragraph.split(/(?<=\s)/u)) {
      if (line && context.measureText(line + word).width > width) {
        lines.push(line);
        line = "";
      }
      if (context.measureText(word).width <= width) {
        line += word;
        continue;
      }
      for (const character of word) {
        if (line && context.measureText(line + character).width > width) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
    }
    lines.push(line);
    return lines;
  });
}

/** Render a read-only snapshot, independent of editor scroll and input sizes. */
export async function renderCompImage(comp: Comp): Promise<Blob> {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create an image.");
  const rows = buildRows(comp);
  const images = new Map<string, HTMLImageElement>();
  const heroIds = new Set(
    rows.flatMap((row) => (row.heroId ? [row.heroId] : [])),
  );
  await Promise.all(
    [...heroIds].map(async (heroId) => {
      const image = new Image();
      image.src = heroImagePath(heroId);
      try {
        await image.decode();
      } catch {
        throw new Error("A hero image could not load. Try again.");
      }
      images.set(heroId, image);
    }),
  );

  const commands: (() => void)[] = [];
  let column = 0;
  let y = PADDING;
  let maxY = 0;
  function reserve(height: number): number {
    if (y + height > COLUMN_HEIGHT - PADDING) {
      column++;
      y = PADDING;
    }
    const top = y;
    y += height;
    maxY = Math.max(maxY, y);
    return top;
  }
  for (const row of rows) {
    const font = `${row.size >= 22 ? "600" : "400"} ${row.size}px system-ui, sans-serif`;
    context.font = font;
    const image = row.heroId ? images.get(row.heroId) : undefined;
    const indent = image ? 80 : 0;
    const lines = wrapText(context, row.text, WIDTH - PADDING * 2 - indent);
    for (const [index, line] of lines.entries()) {
      const top = reserve(index === 0 && image ? 76 : row.size * 1.5);
      const left = column * WIDTH + PADDING;
      commands.push(() => {
        if (index === 0 && image) context.drawImage(image, left, top, 64, 64);
        context.font = font;
        context.fillStyle = row.color;
        context.fillText(
          line,
          left + indent,
          top + (index === 0 && image ? 18 : 0),
        );
      });
    }
    reserve(12);
  }
  const width = (column + 1) * WIDTH;
  const height = Math.ceil(maxY + PADDING);
  // Browser canvas limits vary. Fail clearly instead of copying a blank image.
  if (width > 16000 || width * height > 64_000_000)
    throw new Error(
      "This build is too large for one image. Shorten the notes and try again.",
    );
  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#111b2b";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = "top";
  for (const draw of commands) draw();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("This browser could not create the PNG image."));
    }, "image/png");
  });
}

/** Start the write during the click so browsers keep the user activation. */
export async function copyCompImage(comp: Comp): Promise<void> {
  if (
    !window.isSecureContext ||
    !navigator.clipboard?.write ||
    typeof ClipboardItem === "undefined" ||
    (typeof ClipboardItem.supports === "function" &&
      !ClipboardItem.supports("image/png"))
  )
    throw new Error(
      "Image clipboard access is not supported here. Use a browser with image clipboard support on HTTPS or localhost.",
    );
  const image = renderCompImage(comp);
  // A denied write can reject before rendering finishes.
  void image.catch(() => {});
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": image }),
    ]);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError")
      throw new Error(
        "Clipboard access was denied. Allow clipboard access and try again.",
      );
    throw error;
  }
}
