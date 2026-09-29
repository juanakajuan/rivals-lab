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

const WIDTH = 1600;
const PADDING = 40;
const GAP = 20;
const TEAMS: readonly Team[] = ["ally", "enemy"];
const COLORS = {
  background: "#08090a",
  panel: "#0f1011",
  surface: "#17181a",
  border: "#28292d",
  text: "#f4f5f8",
  muted: "#8a8f98",
  ally: "#6872d9",
  enemy: "#df6670",
};

interface DraftCard {
  readonly team: Team;
  readonly step: string;
  readonly action: string;
  readonly heroId: string | undefined;
  readonly pending: boolean;
}

function draftCards(comp: Comp): readonly DraftCard[] {
  if (!comp.draft) return [];
  const draft = comp.draft;
  let choiceIndex = 0;
  return draftPhases(draft).flatMap((phase, phaseIndex) => {
    const pending =
      phase.length > 1 &&
      draft.choices.length > choiceIndex &&
      draft.choices.length < choiceIndex + phase.length;
    return phase.map((action) => ({
      team: action.team,
      step: `Step ${phaseIndex + 1}${phase.length > 1 ? " · Both ban" : ""}`,
      action: action.kind === "ban" ? "Ban" : "Save",
      heroId: draft.choices[choiceIndex++],
      pending,
    }));
  });
}

/** Wrap without losing newlines or clipping long words and pasted URLs. */
function wrapText(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
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
  const canvas =
    typeof OffscreenCanvas === "undefined"
      ? document.createElement("canvas")
      : new OffscreenCanvas(1, 1);
  const drawingContext =
    canvas instanceof HTMLCanvasElement
      ? canvas.getContext("2d")
      : canvas.getContext("2d");
  if (!drawingContext) throw new Error("This browser cannot create an image.");
  const context = drawingContext;
  const cards = draftCards(comp);
  const heroIds = new Set([
    ...TEAMS.flatMap((team) =>
      comp.teams[team].flatMap((slot) => (slot.heroId ? [slot.heroId] : [])),
    ),
    ...cards.flatMap((card) => (card.heroId ? [card.heroId] : [])),
  ]);
  const images = new Map<string, HTMLImageElement>();
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
  const font = (size: number): string =>
    `${size >= 20 ? "600" : "400"} ${size}px system-ui, sans-serif`;
  function text(
    value: string,
    x: number,
    y: number,
    width: number,
    size = 18,
    color: string = COLORS.text,
    center = false,
  ): number {
    context.font = font(size);
    const lines = wrapText(context, value, width);
    lines.forEach((line, index) =>
      commands.push(() => {
        context.font = font(size);
        context.fillStyle = color;
        context.textAlign = center ? "center" : "left";
        context.fillText(
          line,
          center ? x + width / 2 : x,
          y + index * size * 1.4,
        );
      }),
    );
    return lines.length * size * 1.4;
  }
  function panel(
    x: number,
    y: number,
    width: number,
    height: number,
    surface = false,
    before = commands.length,
  ): void {
    commands.splice(before, 0, () => {
      context.fillStyle = surface ? COLORS.surface : COLORS.panel;
      context.strokeStyle = COLORS.border;
      context.beginPath();
      context.roundRect(x, y, width, height, 10);
      context.fill();
      context.stroke();
    });
  }
  function portrait(
    heroId: string | null | undefined,
    x: number,
    y: number,
    size: number,
  ): void {
    const image = heroId ? images.get(heroId) : undefined;
    if (image) commands.push(() => context.drawImage(image, x, y, size, size));
    else text("—", x, y + size / 4, size, 22, COLORS.muted, true);
  }

  text(
    "RIVALS LAB  /  DRAFT & COMP BUILDER",
    PADDING,
    30,
    WIDTH - PADDING * 2,
    16,
    COLORS.muted,
    true,
  );
  let y =
    62 +
    text(
      comp.name || "Untitled comp",
      PADDING,
      62,
      WIDTH - PADDING * 2,
      32,
      COLORS.text,
      true,
    );
  const map = COMP_MAPS.find((entry) => entry.id === comp.mapId);
  y +=
    10 +
    text(
      `Map: ${map ? `${map.name} · ${map.mode}` : "Not selected"}   /   ${compStatus(comp)}`,
      PADDING,
      y + 10,
      WIDTH - PADDING * 2,
      18,
      COLORS.muted,
      true,
    );
  y += 28;

  const teamWidth = (WIDTH - PADDING * 2 - GAP) / 2;
  const cardWidth = (teamWidth - 40 - GAP * 2) / 3;
  const effects = draftEffects(comp.draft);
  const teamHeight = 378;
  TEAMS.forEach((team, teamIndex) => {
    const x = PADDING + teamIndex * (teamWidth + GAP);
    panel(x, y, teamWidth, teamHeight);
    text(
      `${teamLabel(team)}  ·  ${comp.teams[team].filter((slot) => slot.heroId).length} / 6`,
      x,
      y + 18,
      teamWidth,
      22,
      COLORS[team],
      true,
    );
    comp.teams[team].forEach((slot, index) => {
      const left = x + 20 + (index % 3) * (cardWidth + GAP);
      const top = y + 62 + Math.floor(index / 3) * 152;
      panel(left, top, cardWidth, 140, true);
      portrait(slot.heroId, left + (cardWidth - 48) / 2, top + 10, 48);
      const hero = slot.heroId ? HERO_BY_ID.get(slot.heroId) : undefined;
      text(
        `${index + 1}. ${hero?.name ?? "Empty slot"}`,
        left + 8,
        top + 65,
        cardWidth - 16,
        18,
        COLORS.text,
        true,
      );
      const role = selectedHeroRole(slot.heroId, slot.deadpoolRole);
      const banned = slot.heroId && effects.banned[team].has(slot.heroId);
      text(
        role ?? "Not selected",
        left + 8,
        top + 94,
        cardWidth - 16,
        16,
        COLORS.muted,
        true,
      );
      if (banned)
        text(
          "Banned for this team",
          left + 8,
          top + 116,
          cardWidth - 16,
          14,
          COLORS.enemy,
          true,
        );
    });
  });
  y += teamHeight + GAP;

  const draftTop = y;
  const draftHeader = comp.draft
    ? `${comp.draft.format.toUpperCase()} DRAFT · ${teamLabel(comp.draft.firstTeam)} first`
    : "FREE BUILD";
  // Draw this panel before its content once its measured height is known.
  const panelIndex = commands.length;
  y += 20;
  y +=
    text(draftHeader, PADDING, y, WIDTH - PADDING * 2, 20, COLORS.text, true) +
    8;
  y +=
    text(
      comp.draft
        ? comp.draft.format === "mrc"
          ? "Bans and saves apply to both teams."
          : "Ban for the opponent. Save for your team."
        : "No draft selected",
      PADDING,
      y,
      WIDTH - PADDING * 2,
      16,
      COLORS.muted,
      true,
    ) + 18;
  for (const team of TEAMS) {
    const teamCards = cards.filter((card) => card.team === team);
    if (!teamCards.length) continue;
    text(teamLabel(team), PADDING + 16, y + 50, 112, 18, COLORS[team], true);
    const left = PADDING + 140;
    const width =
      (WIDTH - PADDING - left - 16 - 12 * (teamCards.length - 1)) /
      teamCards.length;
    let rowHeight = 0;
    teamCards.forEach((card, index) => {
      const x = left + index * (width + 12);
      portrait(card.heroId, x + (width - 44) / 2, y + 28, 44);
      text(card.step, x, y, width, 14, COLORS.muted, true);
      text(
        card.action,
        x,
        y + 78,
        width,
        15,
        card.action === "Save" ? COLORS.ally : COLORS.enemy,
        true,
      );
      const nameHeight = text(
        card.heroId
          ? (HERO_BY_ID.get(card.heroId)?.name ?? "Unknown hero")
          : "Not selected",
        x + 4,
        y + 100,
        width - 8,
        17,
        COLORS.text,
        true,
      );
      let height = 104 + nameHeight;
      if (card.pending && card.heroId)
        height += text(
          "Pending joint ban",
          x,
          y + height,
          width,
          14,
          COLORS.muted,
          true,
        );
      rowHeight = Math.max(rowHeight, height);
    });
    y += rowHeight + 18;
  }
  panel(
    PADDING,
    draftTop,
    WIDTH - PADDING * 2,
    y - draftTop,
    false,
    panelIndex,
  );
  y += GAP;

  const compNoteWidth = WIDTH - PADDING * 2;
  context.font = font(18);
  let compLines = wrapText(
    context,
    comp.notes || "No notes",
    compNoteWidth - 32,
  );
  const compColumns = compLines.length > 40 ? 3 : 1;
  const compColumnWidth =
    (compNoteWidth - 32 - GAP * (compColumns - 1)) / compColumns;
  if (compColumns > 1)
    compLines = wrapText(context, comp.notes, compColumnWidth);
  let compPages = 0;
  let compNotesHeight = 0;
  for (let start = 0; start < compLines.length; start += compColumns * 200) {
    const chunk = compLines.slice(start, start + compColumns * 200);
    const rows = Math.ceil(chunk.length / compColumns);
    const left = compPages * WIDTH + PADDING;
    const height = rows * 26 + 84;
    panel(left, y, compNoteWidth, height);
    text(
      `Comp notes${start ? " (continued)" : ""}`,
      left + 16,
      y + 16,
      compNoteWidth - 32,
      18,
      COLORS.ally,
    );
    chunk.forEach((line, index) =>
      text(
        line,
        left + 16 + Math.floor(index / rows) * (compColumnWidth + GAP),
        y + 68 + (index % rows) * 26,
        compColumnWidth,
      ),
    );
    compNotesHeight = Math.max(compNotesHeight, height);
    compPages++;
  }
  y += compNotesHeight + GAP;

  const notes: { readonly label: string; readonly value: string }[] = [];
  for (const team of TEAMS)
    comp.teams[team].forEach((slot, index) => {
      if (slot.notes)
        notes.push({
          label: `${teamLabel(team)} · ${index + 1}. ${slot.heroId ? HERO_BY_ID.get(slot.heroId)?.name : "Empty slot"}`,
          value: slot.notes,
        });
    });
  const noteWidth = (WIDTH - PADDING * 2 - GAP * 2) / 3;
  context.font = font(18);
  const noteBlocks = notes.map((note) => ({
    label: note.label,
    lines: wrapText(context, note.value, noteWidth - 32),
  }));
  const maxLines = Math.max(
    5,
    Math.min(
      200,
      Math.ceil(
        noteBlocks.reduce((total, note) => total + note.lines.length + 2, 0) /
          3,
      ),
    ),
  );
  const columnHeights = [0, 0, 0];
  for (const note of noteBlocks) {
    for (let start = 0; start < note.lines.length; start += maxLines) {
      const chunk = note.lines.slice(start, start + maxLines);
      let column = columnHeights.indexOf(Math.min(...columnHeights));
      let offset = columnHeights[column] ?? 0;
      const blockHeight = (chunk.length + 2) * 26 + 32;
      if (offset + blockHeight > 6000) {
        column = columnHeights.length;
        columnHeights.push(0);
        offset = 0;
      }
      const page = Math.floor(column / 3);
      const x = page * WIDTH + PADDING + (column % 3) * (noteWidth + GAP);
      const top = y + offset;
      panel(x, top, noteWidth, blockHeight);
      text(
        `${note.label}${start ? " (continued)" : ""}`,
        x + 16,
        top + 16,
        noteWidth - 32,
        18,
        COLORS.ally,
      );
      chunk.forEach((line, index) =>
        text(line, x + 16, top + 68 + index * 26, noteWidth - 32),
      );
      columnHeights[column] = offset + blockHeight + GAP;
    }
  }
  const width =
    Math.max(compPages, Math.ceil(columnHeights.length / 3)) * WIDTH;
  const notesHeight = Math.max(...columnHeights) - GAP;
  const height = Math.ceil(y + notesHeight + PADDING);
  if (width > 16000 || width * height > 64_000_000)
    throw new Error(
      "This build is too large for one image. Shorten the notes and try again.",
    );
  canvas.width = width;
  canvas.height = height;
  context.fillStyle = COLORS.background;
  context.fillRect(0, 0, width, height);
  context.textBaseline = "top";
  for (const draw of commands) draw();
  // Encoding in a worker avoids the page's idle-task queue for PNG export.
  if ("transferToImageBitmap" in canvas && typeof Worker !== "undefined") {
    const image = canvas.transferToImageBitmap();
    let worker: Worker | undefined;
    try {
      worker = new Worker(
        new URL("./compImageEncoder.worker.ts", import.meta.url),
        { type: "module" },
      );
      const encoder = worker;
      return await new Promise<Blob>((resolve, reject) => {
        encoder.onmessage = (event: MessageEvent<unknown>) => {
          if (event.data instanceof Blob && event.data.type === "image/png")
            resolve(event.data);
          else
            reject(
              new Error(
                typeof event.data === "string"
                  ? event.data
                  : "The image encoder returned invalid data.",
              ),
            );
        };
        encoder.onerror = () =>
          reject(new Error("The image encoder could not start. Try again."));
        encoder.onmessageerror = () =>
          reject(new Error("The image encoder returned invalid data."));
        encoder.postMessage(image, [image]);
      });
    } finally {
      image.close();
      worker?.terminate();
    }
  }
  if ("convertToBlob" in canvas)
    return canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("This browser could not create the PNG image."));
    }, "image/png");
  });
}

interface ImageShareResult {
  readonly downloadError: string | null;
  readonly copyError: string | null;
}

function imageError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError")
    return "Clipboard access was denied. Allow clipboard access and try again.";
  return error instanceof Error ? error.message : "The operation failed.";
}

async function copyImageToClipboard(image: Promise<Blob>): Promise<void> {
  if (
    !window.isSecureContext ||
    !navigator.clipboard?.write ||
    typeof ClipboardItem === "undefined" ||
    (typeof ClipboardItem.supports === "function" &&
      !ClipboardItem.supports("image/png"))
  )
    throw new Error("Image clipboard access is not supported here.");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
}

function downloadImage(image: Blob, name: string): void {
  const stem = name
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/ +/g, "-")
    .slice(0, 80);
  const filename =
    !stem || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)
      ? "rivals-comp"
      : stem;
  const url = URL.createObjectURL(image);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.png`;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Start clipboard access during the click; download need not wait for it. */
export async function downloadAndCopyCompImage(
  comp: Comp,
  onDownloadStarted: () => void,
): Promise<ImageShareResult> {
  const image = renderCompImage(comp);
  const copyResult = copyImageToClipboard(image).then(
    () => null,
    (error: unknown) => imageError(error),
  );
  const blob = await image;
  let downloadError: string | null = null;
  try {
    downloadImage(blob, comp.name);
    onDownloadStarted();
  } catch (error) {
    downloadError = imageError(error);
  }
  return { downloadError, copyError: await copyResult };
}
