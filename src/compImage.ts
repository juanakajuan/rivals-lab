import { COMP_MAPS } from "./compMaps";
import { type Comp } from "./comps";
import { draftEffects, draftSlots, type DraftActionKind } from "./draft";
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
  ban: "#e28a78",
  save: "#5e6ad2",
};

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
  const teams = TEAMS.filter((team) =>
    comp.teams[team].some((slot) => slot.heroId || slot.notes.trim()),
  );
  const cards = draftCards(comp).filter((card) => card.heroId);
  const map = COMP_MAPS.find((entry) => entry.id === comp.mapId);
  if (
    !comp.name.trim() &&
    !map &&
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
  if (map) {
    const image = new Image();
    image.src = map.previewImagePath;
    try {
      await image.decode();
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0)
        throw new Error("Invalid map image dimensions.");
    } catch {
      throw new Error(`${map.name} preview could not load. Try again.`);
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
  if (map)
    y +=
      text(
        `Map: ${map.name} · ${map.mode}`,
        PADDING,
        y,
        WIDTH - PADDING * 2,
        18,
        COLORS.muted,
        true,
      ) + 10;
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
  const effects = draftEffects(comp.draft);
  const teamTop = y;
  const teamPanels: { readonly x: number; readonly before: number }[] = [];
  let teamHeight = 0;
  teams.forEach((team, teamIndex) => {
    const x = PADDING + teamIndex * (teamWidth + GAP);
    teamPanels.push({ x, before: commands.length });
    text(
      `${teamLabel(team)}  ·  ${comp.teams[team].filter((slot) => slot.heroId).length} / 6`,
      x,
      teamTop + 18,
      teamWidth,
      22,
      COLORS[team],
      true,
    );
    const slots = comp.teams[team]
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.heroId || slot.notes.trim());
    const columns =
      teams.length === 1
        ? Math.min(slots.length, 6)
        : Math.min(slots.length, 3);
    const cardWidth = (teamWidth - 40 - GAP * (columns - 1)) / columns;
    let rowTop = teamTop + 62;
    for (let row = 0; row < Math.ceil(slots.length / columns); row++) {
      let rowHeight = 140;
      const rowPanels: { readonly x: number; readonly before: number }[] = [];
      slots
        .slice(row * columns, (row + 1) * columns)
        .forEach(({ slot, index }, column) => {
          const left = x + 20 + column * (cardWidth + GAP);
          rowPanels.push({ x: left, before: commands.length });
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
          if (slot.heroId && effects.banned[team].has(slot.heroId))
            bottom += text(
              "Banned for this team",
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
          rowHeight = Math.max(rowHeight, bottom - rowTop + 14);
        });
      for (const card of rowPanels.reverse())
        panel(card.x, rowTop, cardWidth, rowHeight, true, card.before);
      rowTop += rowHeight + 12;
    }
    teamHeight = Math.max(teamHeight, rowTop - teamTop + 12);
  });
  for (const team of teamPanels.reverse())
    panel(team.x, teamTop, teamWidth, teamHeight, false, team.before);
  if (teams.length) y += teamHeight + GAP;

  if (cards.length && comp.draft) {
    const draftTop = y;
    const draftHeader = `${comp.draft.format.toUpperCase()} DRAFT`;
    // Draw this panel before its content once its measured height is known.
    const panelIndex = commands.length;
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
        comp.draft.format === "mrc"
          ? "Bans and saves apply to both teams."
          : "Ban for the opponent. Save for your team.",
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
    panel(
      PADDING,
      draftTop,
      WIDTH - PADDING * 2,
      y - draftTop,
      false,
      panelIndex,
    );
    y += GAP;
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
      // Use the local encoder below with the original rendered pixels.
    } finally {
      image?.close();
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
