import { downloadBlob } from "./downloadBlob";
import { compMapChoice } from "./compMaps";
import { type Comp, type CompSlot } from "./comps";
import {
  DRAFT_RULES,
  draftSlots,
  type DraftActionKind,
  type DraftFormat,
} from "./draft";
import {
  HERO_BY_ID,
  heroImagePath,
  TEAMS,
  TEAM_SIZE,
  selectedHeroRole,
  teamCountLabel,
  teamLabel,
  type Team,
} from "./heroes";
import { errorMessage } from "./errorMessage";
import { BANNED_FOR_TEAM, bannedHeroConflicts } from "./compEdits";

const WIDTH = 1600;
const PADDING = 40;
const GAP = 20;
const COLORS = {
  background: "#08090a",
  panel: "#0f1011",
  surface: "#17181a",
  border: "#28292d",
  text: "#f4f5f8",
  muted: "#8a8f98",
  ally: "#6872d9",
  enemy: "#df6670",
  ban: "#e28a78",
  save: "#5e6ad2",
};

interface Recorded<T> {
  readonly draws: readonly (() => void)[];
  readonly result: T;
}

interface DraftCard {
  readonly team: Team;
  readonly step: string;
  readonly kind: DraftActionKind;
  readonly heroId: string | null;
}

function draftCards(comp: Comp): readonly DraftCard[] {
  if (!comp.draft) return [];
  return draftSlots(comp.draft).map((slot) => ({
    team: slot.team,
    step: `${slot.kind === "ban" ? "Ban" : "Save"} ${slot.index + 1}`,
    kind: slot.kind,
    heroId: slot.heroId,
  }));
}

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

async function encodeInWorker(canvas: OffscreenCanvas): Promise<Blob | null> {
  let image: ImageBitmap | undefined;
  let worker: Worker | undefined;
  try {
    // Keep the rendered canvas intact if worker startup or encoding fails.
    const snapshot = await createImageBitmap(canvas);
    image = snapshot;
    worker = new Worker(
      new URL("./compImageEncoder.worker.ts", import.meta.url),
      { type: "module" },
    );
    const encoder = worker;
    return await new Promise<Blob>((resolve, reject) => {
      encoder.onmessage = (event: MessageEvent<unknown>) => {
        if (
          event.data instanceof Blob &&
          event.data.type === "image/png" &&
          event.data.size > 0
        )
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
      encoder.postMessage(snapshot, [snapshot]);
    });
  } catch {
    return null;
  } finally {
    image?.close();
    worker?.terminate();
  }
}

export async function renderCompImage(comp: Comp): Promise<Blob> {
  const teams = TEAMS.filter((team) =>
    comp.teams[team].some((slot) => slot.heroId || slot.notes.trim()),
  );
  const cards = draftCards(comp).filter((card) => card.heroId);
  const choice = compMapChoice(comp);
  const map =
    choice.kind === "maps" && choice.maps.length === 1
      ? choice.maps[0]
      : undefined;
  const mapLabel =
    choice.kind === "mode"
      ? `Game mode: ${choice.mode}`
      : map
        ? `Map: ${map.shortName} · ${map.mode}`
        : choice.kind === "maps"
          ? `Maps: ${choice.maps.map((entry) => entry.shortName).join(", ")}`
          : null;
  if (
    !comp.name.trim() &&
    !mapLabel &&
    !teams.length &&
    !cards.length &&
    !comp.notes.trim()
  )
    throw new Error(
      "Add a title, map, hero, draft choice, or note before exporting.",
    );
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
  let mapImage: HTMLImageElement | undefined;
  if (map?.preview) {
    const image = new Image();
    image.src = map.preview.imagePath;
    try {
      await image.decode();
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0)
        throw new Error("Invalid map image dimensions.");
    } catch {
      throw new Error(`${map.shortName} preview could not load. Try again.`);
    }
    mapImage = image;
  }
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

  let commands: (() => void)[] = [];
  function record<T>(draw: () => T): Recorded<T> {
    const outer = commands;
    const draws: (() => void)[] = [];
    commands = draws;
    try {
      return { draws, result: draw() };
    } finally {
      commands = outer;
    }
  }
  function replay(recorded: Recorded<unknown>): void {
    commands.push(...recorded.draws);
  }
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
  ): void {
    commands.push(() => {
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

  function draftPortrait(
    heroId: string | null,
    kind: DraftActionKind,
    x: number,
    y: number,
  ): void {
    portrait(heroId, x, y, 44);
    commands.push(() => {
      context.save();
      context.strokeStyle = COLORS[kind];
      context.lineWidth = 2;
      context.strokeRect(x, y, 44, 44);
      if (kind === "ban") {
        context.globalAlpha = 0.75;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(x + 2, y + 42);
        context.lineTo(x + 42, y + 2);
        context.stroke();
        context.globalAlpha = 1;
      }
      const badgeX = x + 43;
      const badgeY = y + 43;
      context.fillStyle = COLORS[kind];
      context.strokeStyle = COLORS.panel;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(badgeX, badgeY, 10, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.lineWidth = 1.5;
      context.beginPath();
      if (kind === "ban") {
        context.arc(badgeX, badgeY, 5, 0, Math.PI * 2);
        context.moveTo(badgeX - 3.5, badgeY + 3.5);
        context.lineTo(badgeX + 3.5, badgeY - 3.5);
      } else {
        context.moveTo(badgeX, badgeY - 5);
        context.lineTo(badgeX + 4, badgeY - 3);
        context.lineTo(badgeX + 4, badgeY + 1);
        context.quadraticCurveTo(badgeX + 3, badgeY + 4, badgeX, badgeY + 5);
        context.quadraticCurveTo(
          badgeX - 3,
          badgeY + 4,
          badgeX - 4,
          badgeY + 1,
        );
        context.lineTo(badgeX - 4, badgeY - 3);
        context.closePath();
        context.moveTo(badgeX - 2, badgeY);
        context.lineTo(badgeX, badgeY + 2);
        context.lineTo(badgeX + 2, badgeY - 1);
      }
      context.stroke();
      context.restore();
    });
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
  let y = 62;
  if (comp.name.trim())
    y +=
      text(comp.name, PADDING, y, WIDTH - PADDING * 2, 32, COLORS.text, true) +
      10;
  if (mapLabel)
    y +=
      text(mapLabel, PADDING, y, WIDTH - PADDING * 2, 18, COLORS.muted, true) +
      10;
  y += 18;
  if (mapImage) {
    const image = mapImage;
    const scale = Math.min(
      (WIDTH - PADDING * 2) / image.naturalWidth,
      320 / image.naturalHeight,
    );
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const left = (WIDTH - width) / 2;
    const top = y;
    commands.push(() => context.drawImage(image, left, top, width, height));
    y += height + GAP;
  }

  const teamWidth =
    teams.length === 1 ? WIDTH - PADDING * 2 : (WIDTH - PADDING * 2 - GAP) / 2;
  const teamTop = y;
  const teamBlocks = teams.map((team, teamIndex) => {
    const x = PADDING + teamIndex * (teamWidth + GAP);
    return { x, ...record(() => drawTeam(team, x)) };
  });
  const teamHeight = Math.max(0, ...teamBlocks.map((block) => block.result));
  for (const block of teamBlocks) {
    panel(block.x, teamTop, teamWidth, teamHeight);
    replay(block);
  }
  if (teams.length) y += teamHeight + GAP;

  function drawTeam(team: Team, x: number): number {
    text(
      `${teamLabel(team)}  ·  ${teamCountLabel(comp.teams[team])}`,
      x,
      teamTop + 18,
      teamWidth,
      22,
      COLORS[team],
      true,
    );
    const conflicts = bannedHeroConflicts(comp, team);
    const slots = comp.teams[team]
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.heroId || slot.notes.trim());
    const columns = TEAM_SIZE / teams.length;
    const cardWidth = (teamWidth - 40 - GAP * (columns - 1)) / columns;
    let rowTop = teamTop + 62;
    for (let row = 0; row < Math.ceil(slots.length / columns); row++) {
      const rowCards = slots
        .slice(row * columns, (row + 1) * columns)
        .map(({ slot, index }, column) => {
          const left = x + 20 + column * (cardWidth + GAP);
          return { left, ...record(() => drawSlot(slot, index, left)) };
        });
      const rowHeight = Math.max(140, ...rowCards.map((card) => card.result));
      for (const card of rowCards) {
        panel(card.left, rowTop, cardWidth, rowHeight, true);
        replay(card);
      }
      rowTop += rowHeight + 12;
    }
    return rowTop - teamTop + 12;

    function drawSlot(slot: CompSlot, index: number, left: number): number {
      portrait(slot.heroId, left + (cardWidth - 48) / 2, rowTop + 10, 48);
      const hero = slot.heroId ? HERO_BY_ID.get(slot.heroId) : undefined;
      let bottom = rowTop + 65;
      bottom += text(
        `${index + 1}. ${hero?.name ?? "Empty slot"}`,
        left + 8,
        bottom,
        cardWidth - 16,
        18,
        COLORS.text,
        true,
      );
      const role = selectedHeroRole(slot.heroId, slot.deadpoolRole);
      if (role)
        bottom +=
          text(
            role,
            left + 8,
            bottom + 4,
            cardWidth - 16,
            16,
            COLORS.muted,
            true,
          ) + 4;
      if (conflicts.has(index))
        bottom += text(
          BANNED_FOR_TEAM,
          left + 8,
          bottom,
          cardWidth - 16,
          14,
          COLORS.enemy,
          true,
        );
      if (slot.notes.trim())
        bottom +=
          12 + text(slot.notes, left + 12, bottom + 12, cardWidth - 24, 16);
      return bottom - rowTop + 14;
    }
  }

  if (cards.length && comp.draft) {
    const { format } = comp.draft;
    const draftTop = y;
    const content = record(() => drawDraft(format));
    panel(PADDING, draftTop, WIDTH - PADDING * 2, y - draftTop);
    replay(content);
    y += GAP;
  }

  function drawDraft(format: DraftFormat): void {
    const draftHeader = `${format.toUpperCase()} DRAFT`;
    y += 20;
    y +=
      text(
        draftHeader,
        PADDING,
        y,
        WIDTH - PADDING * 2,
        20,
        COLORS.text,
        true,
      ) + 8;
    y +=
      text(
        DRAFT_RULES[format].scope,
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
        draftPortrait(card.heroId, card.kind, x + (width - 44) / 2, y + 28);
        text(card.step, x, y, width, 14, COLORS[card.kind], true);
        text(
          card.kind === "save" ? "Save" : "Ban",
          x,
          y + 88,
          width,
          15,
          COLORS[card.kind],
          true,
        );
        const nameHeight = text(
          card.heroId
            ? (HERO_BY_ID.get(card.heroId)?.name ?? "Unknown hero")
            : "Not selected",
          x + 4,
          y + 110,
          width - 8,
          17,
          COLORS.text,
          true,
        );
        const height = 114 + nameHeight;
        rowHeight = Math.max(rowHeight, height);
      });
      y += rowHeight + 18;
    }
  }
  let compPages = 1;
  if (comp.notes.trim()) {
    const compNoteWidth = WIDTH - PADDING * 2;
    context.font = font(18);
    let compLines = wrapText(context, comp.notes, compNoteWidth - 32);
    const compColumns = compLines.length > 40 ? 3 : 1;
    const compColumnWidth =
      (compNoteWidth - 32 - GAP * (compColumns - 1)) / compColumns;
    if (compColumns > 1)
      compLines = wrapText(context, comp.notes, compColumnWidth);
    compPages = 0;
    let compNotesHeight = 0;
    for (let start = 0; start < compLines.length; start += compColumns * 200) {
      const chunk = compLines.slice(start, start + compColumns * 200);
      const rows = Math.ceil(chunk.length / compColumns);
      const left = compPages * WIDTH + PADDING;
      const height = rows * 26 + 84;
      panel(left, y, compNoteWidth, height);
      text(
        `Comp Notes${start ? " (Continued)" : ""}`,
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
  }
  const width = compPages * WIDTH;
  const height = Math.ceil(y + PADDING);
  if (width > 16000 || height > 16000 || width * height > 64_000_000)
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
    const encoded = await encodeInWorker(canvas);
    if (encoded) return encoded;
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
  return errorMessage(error);
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
  downloadBlob({ blob: image, filename: `${filename}.png` });
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
