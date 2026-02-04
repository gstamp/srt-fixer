#!/usr/bin/env bun

type SubtitleBlock = {
  originalOrder: number;
  index?: number;
  startMs: number;
  endMs: number;
  timingLine: string;
  lines: string[]; // text lines
  assignedTag?: string;
  existingTag?: string;
  keepExisting?: boolean;
};

type ParseResult = {
  blocks: SubtitleBlock[];
  skippedBlocks: number;
};

type StyleDef = {
  Name?: string;
  Fontname?: string;
  Fontsize?: string;
  PrimaryColour?: string;
};

const POSITION_TAGS = ["\\an2", "\\an8", "\\an5", "\\an4", "\\an6"] as const;
const DEFAULT_TAG = "\\an2";

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const inputs: string[] = [];
  let output: string | undefined;
  let outDir: string | undefined;
  let suffix: string | undefined;
  let inPlace = false;
  let clean = false;
  let ignoreExisting = false;
  let omitDefault = true;
  let keepWhite = false;
  let help = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--clean") {
      clean = true;
      continue;
    }
    if (arg === "--ignore-existing") {
      ignoreExisting = true;
      continue;
    }
    if (arg === "--omit-default") {
      omitDefault = true;
      continue;
    }
    if (arg === "--keep-default") {
      omitDefault = false;
      continue;
    }
    if (arg === "--keep-white") {
      keepWhite = true;
      continue;
    }
    if (arg === "--in-place") {
      inPlace = true;
      continue;
    }
    if (arg === "--out-dir" && i + 1 < args.length) {
      outDir = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--suffix" && i + 1 < args.length) {
      suffix = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--in" && i + 1 < args.length) {
      inputs.push(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--out" && i + 1 < args.length) {
      output = args[i + 1];
      i += 1;
      continue;
    }
    inputs.push(arg);
  }

  return { inputs, output, outDir, suffix, inPlace, clean, ignoreExisting, omitDefault, keepWhite, help };
}

function usage() {
  return [
    "srt-fixer",
    "",
    "Usage:",
    "  srt-fixer --in input.srt [--out output.srt] [--clean] [--ignore-existing] [--keep-default] [--keep-white]",
    "  srt-fixer input.srt [output.srt] [--clean] [--ignore-existing] [--keep-default] [--keep-white]",
    "  srt-fixer [--in-place | --out-dir dir | --suffix .fixed] input1.srt [input2.srt ...]",
    "",
    "Options:",
    "  --clean            Remove existing {\\anX} tags before processing.",
    "  --ignore-existing  Keep existing leading {\\anX} tags and reserve their slots.",
    "  --omit-default     Do not add {\\an2} when it is the assigned tag (default).",
    "  --keep-default     Always add {\\an2} when it is the assigned tag.",
    "  --keep-white       Preserve #ffffff color tags when converting from ASS.",
    "  --in-place         Overwrite each input file in place.",
    "  --out-dir dir      Write outputs into the given directory (batch-friendly).",
    "  --suffix text      Write outputs next to inputs, inserting the suffix before .srt.",
    "  -h, --help         Show this help message.",
  ].join("\n");
}

function parseTimestampToMs(ts: string): number | null {
  const match = ts.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4]);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    Number.isNaN(seconds) ||
    Number.isNaN(millis)
  ) {
    return null;
  }
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

function parseTimingLine(line: string): { startMs: number; endMs: number; timingLine: string } | null {
  const parts = line.split(/\s*-->\s*/);
  if (parts.length !== 2) return null;
  const startMs = parseTimestampToMs(parts[0].trim());
  const endMs = parseTimestampToMs(parts[1].trim());
  if (startMs === null || endMs === null) return null;
  return { startMs, endMs, timingLine: `${parts[0].trim()} --> ${parts[1].trim()}` };
}

function extractLeadingTag(text: string): string | null {
  const match = text.match(/^\{(\\an[1-9])\}/);
  return match ? match[1] : null;
}

function stripAllTags(text: string): string {
  return text.replace(/\{\\an[1-9]\}/g, "");
}

function parseAssTimestampToMs(ts: string): number | null {
  const match = ts.match(/^(\d+):(\d{2}):(\d{2})\.(\d{1,2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const centis = Number(match[4]);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    Number.isNaN(seconds) ||
    Number.isNaN(centis)
  ) {
    return null;
  }
  const millis = centis * (match[4].length === 1 ? 100 : 10);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

function msToSrtTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const millis = ms % 1000;
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0",
  )},${String(millis).padStart(3, "0")}`;
}

function assColorToHex(color: string | undefined): string | undefined {
  if (!color) return undefined;
  const normalized = color.trim().replace(/^&?H/i, "").replace(/&$/, "");
  if (!normalized) return undefined;
  const hex = normalized.padStart(6, "0");
  const bb = hex.slice(-6, -4);
  const gg = hex.slice(-4, -2);
  const rr = hex.slice(-2);
  if (!/^[0-9a-fA-F]{2}$/.test(rr)) return undefined;
  if (!/^[0-9a-fA-F]{2}$/.test(gg)) return undefined;
  if (!/^[0-9a-fA-F]{2}$/.test(bb)) return undefined;
  return `#${rr}${gg}${bb}`.toLowerCase();
}

function detectAssFormat(filename: string | undefined, content: string): boolean {
  if (filename && filename.toLowerCase().endsWith(".ass")) return true;
  return /\[Script Info\]/i.test(content) && /^Dialogue:/m.test(content);
}

function splitAssFields(line: string, fieldCount: number): string[] {
  const parts = line.split(",");
  if (parts.length <= fieldCount) return parts.map((part) => part.trim());
  const head = parts.slice(0, fieldCount - 1).map((part) => part.trim());
  const tail = parts.slice(fieldCount - 1).join(",").trim();
  return [...head, tail];
}

function parseAssStyleFormat(line: string): string[] {
  return line
    .slice("Format:".length)
    .split(",")
    .map((part) => part.trim());
}

function parseAssStyles(lines: string[]): Map<string, StyleDef> {
  const styles = new Map<string, StyleDef>();
  let format: string[] | null = null;
  for (const line of lines) {
    if (/^Format:/i.test(line)) {
      format = parseAssStyleFormat(line);
      continue;
    }
    if (!/^Style:/i.test(line) || !format) continue;
    const raw = line.slice("Style:".length).trim();
    const fields = splitAssFields(raw, format.length);
    const style: StyleDef = {};
    for (let i = 0; i < format.length; i += 1) {
      style[format[i] as keyof StyleDef] = fields[i];
    }
    if (style.Name) {
      styles.set(style.Name, style);
    }
  }
  return styles;
}

function parseAssDialogueFormat(line: string): string[] {
  return line
    .slice("Format:".length)
    .split(",")
    .map((part) => part.trim());
}

function parseAssOverrides(text: string) {
  let align: string | undefined;
  let fontName: string | undefined;
  let fontSize: string | undefined;
  let color: string | undefined;

  const cleaned = text.replace(/\{([^}]*)\}/g, (_match, tags) => {
    const tokenMatches = tags.match(/\\[A-Za-z]+[^\\}]*/g) ?? [];
    tokenMatches.forEach((token) => {
      const an = token.match(/\\an([1-9])/);
      if (an) align = `\\an${an[1]}`;
      const fn = token.match(/\\fn([^\\}]+)/);
      if (fn) fontName = fn[1].trim();
      const fs = token.match(/\\fs(\d+)/);
      if (fs) fontSize = fs[1];
      const c1 = token.match(/\\1c(&?H[0-9A-Fa-f]+&?)/);
      if (c1) color = assColorToHex(c1[1]) ?? color;
      const c = token.match(/\\c(&?H[0-9A-Fa-f]+&?)/);
      if (c) color = assColorToHex(c[1]) ?? color;
    });
    return "";
  });

  return {
    align,
    fontName,
    fontSize,
    color,
    cleaned,
  };
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapWithFonts(text: string, fontName?: string, fontSize?: string, color?: string): string {
  if (!fontName && !fontSize && !color) return text;
  const attrs: string[] = [];
  if (fontName) attrs.push(`face="${escapeHtmlAttr(fontName)}"`);
  if (fontSize) attrs.push(`size="${escapeHtmlAttr(fontSize)}"`);
  if (color) attrs.push(`color="${escapeHtmlAttr(color)}"`);
  return `<font ${attrs.join(" ")}>${text}</font>`;
}

type AssParseOptions = {
  omitWhiteColor: boolean;
};

function parseAss(content: string, options: AssParseOptions): ParseResult {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const blocks: SubtitleBlock[] = [];
  let skippedBlocks = 0;

  let section = "";
  let styleLines: string[] = [];
  let eventLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      section = trimmed.toLowerCase();
      continue;
    }
    if (section === "[v4+ styles]") {
      styleLines.push(trimmed);
    } else if (section === "[events]") {
      eventLines.push(trimmed);
    }
  }

  const styles = parseAssStyles(styleLines);
  let eventFormat: string[] | null = null;
  let order = 0;

  for (const line of eventLines) {
    if (/^Format:/i.test(line)) {
      eventFormat = parseAssDialogueFormat(line);
      continue;
    }
    if (!/^Dialogue:/i.test(line) || !eventFormat) continue;
    const raw = line.slice("Dialogue:".length).trim();
    const fields = splitAssFields(raw, eventFormat.length);
    const values: Record<string, string> = {};
    for (let i = 0; i < eventFormat.length; i += 1) {
      values[eventFormat[i]] = fields[i] ?? "";
    }

    const startMs = parseAssTimestampToMs(values.Start ?? "");
    const endMs = parseAssTimestampToMs(values.End ?? "");
    if (startMs === null || endMs === null) {
      skippedBlocks += 1;
      continue;
    }

    const style = styles.get(values.Style ?? "") ?? {};
    const override = parseAssOverrides(values.Text ?? "");
    const fontName = override.fontName ?? style.Fontname;
    const fontSize = override.fontSize ?? style.Fontsize;
    const colorFromOverride = override.color !== undefined;
    let color = override.color ?? assColorToHex(style.PrimaryColour);
    if (!colorFromOverride && options.omitWhiteColor && color?.toLowerCase() === "#ffffff") {
      color = undefined;
    }
    const align = override.align;

    let text = override.cleaned.replace(/\\N/g, "\n").replace(/\\n/g, "\n");
    text = wrapWithFonts(text, fontName, fontSize, color);
    if (align) {
      text = `{${align}}` + text;
    }

    const lineBlocks = text.split("\n");
    if (lineBlocks.length === 0 || lineBlocks.every((value) => value.trim().length === 0)) {
      skippedBlocks += 1;
      continue;
    }

    blocks.push({
      originalOrder: order,
      startMs,
      endMs,
      timingLine: `${msToSrtTimestamp(startMs)} --> ${msToSrtTimestamp(endMs)}`,
      lines: lineBlocks,
    });
    order += 1;
  }

  return { blocks, skippedBlocks };
}

function parseSrt(content: string): ParseResult {
  const normalized = content.replace(/\r\n/g, "\n");
  const rawBlocks = normalized.split(/\n{2,}/);
  const blocks: SubtitleBlock[] = [];
  let skippedBlocks = 0;

  rawBlocks.forEach((rawBlock, originalOrder) => {
    const trimmed = rawBlock.trim();
    if (!trimmed) {
      skippedBlocks += 1;
      return;
    }
    const lines = trimmed.split("\n");
    if (lines.length === 0) {
      skippedBlocks += 1;
      return;
    }

    let timingLineIndex = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].includes("-->")) {
        timingLineIndex = i;
        break;
      }
    }
    if (timingLineIndex === -1) {
      skippedBlocks += 1;
      return;
    }

    const timingLineRaw = lines[timingLineIndex].trim();
    const timing = parseTimingLine(timingLineRaw);
    if (!timing) {
      skippedBlocks += 1;
      return;
    }

    const possibleIndex = timingLineIndex > 0 ? lines[timingLineIndex - 1].trim() : "";
    const index = /^\d+$/.test(possibleIndex) ? Number(possibleIndex) : undefined;
    const textLines = lines.slice(timingLineIndex + 1);

    if (textLines.length === 0 || textLines.every((line) => line.trim().length === 0)) {
      skippedBlocks += 1;
      return;
    }

    blocks.push({
      originalOrder,
      index,
      startMs: timing.startMs,
      endMs: timing.endMs,
      timingLine: timing.timingLine,
      lines: textLines,
    });
  });

  return { blocks, skippedBlocks };
}

type AssignOptions = {
  clean: boolean;
  ignoreExisting: boolean;
  omitDefault: boolean;
};

function assignSlots(blocks: SubtitleBlock[], options: AssignOptions) {
  const working = [...blocks].sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs;
    return a.endMs - b.endMs;
  });

  const active: { endMs: number; tag: string }[] = [];

  for (const block of working) {
    for (let i = active.length - 1; i >= 0; i -= 1) {
      if (block.startMs >= active[i].endMs) {
        active.splice(i, 1);
      }
    }

    const firstLine = block.lines[0] ?? "";
    const existingTag = extractLeadingTag(firstLine);
    block.existingTag = existingTag ?? undefined;

    if (options.clean) {
      block.lines = block.lines.map(stripAllTags);
    }

    if (!options.clean && options.ignoreExisting && existingTag) {
      block.assignedTag = existingTag;
      block.keepExisting = true;
      active.push({ endMs: block.endMs, tag: existingTag });
      continue;
    }

    const used = new Set(active.map((entry) => entry.tag));
    let chosenTag: string | undefined;
    for (const tag of POSITION_TAGS) {
      if (!used.has(tag)) {
        chosenTag = tag;
        break;
      }
    }
    if (!chosenTag) {
      chosenTag = POSITION_TAGS[POSITION_TAGS.length - 1];
    }

    block.assignedTag = chosenTag;
    active.push({ endMs: block.endMs, tag: chosenTag });
  }

  for (const block of blocks) {
    const tag = block.assignedTag ?? DEFAULT_TAG;
    if (block.keepExisting) {
      continue;
    }
    if (block.lines.length === 0) {
      continue;
    }
    const firstLine = block.lines[0];
    if (options.omitDefault && tag === DEFAULT_TAG) {
      block.lines[0] = firstLine.replace(/^\{\\an[1-9]\}/, "");
      continue;
    }
    if (firstLine.startsWith("{")) {
      block.lines[0] = `{${tag}}` + firstLine.replace(/^\{\\an[1-9]\}/, "");
    } else {
      block.lines[0] = `{${tag}}` + firstLine;
    }
  }
}

function serializeSrt(blocks: SubtitleBlock[]): string {
  const ordered = [...blocks].sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs;
    if (a.endMs !== b.endMs) return a.endMs - b.endMs;
    return a.originalOrder - b.originalOrder;
  });
  return ordered
    .map((block, idx) => {
      const index = block.index ?? idx + 1;
      return [String(index), block.timingLine, ...block.lines].join("\n");
    })
    .join("\n\n");
}

function splitDirAndFile(path: string): { dir: string; file: string } {
  const normalized = path.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  if (slash === -1) return { dir: ".", file: normalized };
  return { dir: normalized.slice(0, slash), file: normalized.slice(slash + 1) };
}

function replaceExtWithSrt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return `${filename}.srt`;
  return `${filename.slice(0, dot)}.srt`;
}

function applySuffix(filename: string, suffix: string | undefined): string {
  if (!suffix) return filename;
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return `${filename}${suffix}`;
  return `${filename.slice(0, dot)}${suffix}${filename.slice(dot)}`;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.inputs.length === 0) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const usesBatchFlags = args.inPlace || Boolean(args.outDir) || Boolean(args.suffix);
  if (args.output && (args.inputs.length !== 1 || usesBatchFlags)) {
    console.error("`--out` can only be used with a single input and no batch flags.");
    process.exit(1);
  }
  if (!usesBatchFlags && !args.output && args.inputs.length > 2) {
    console.error("Multiple inputs require --in-place, --out-dir, or --suffix.");
    process.exit(1);
  }
  if (!usesBatchFlags && !args.output && args.inputs.length === 2) {
    args.output = args.inputs[1];
    args.inputs = [args.inputs[0]];
  }

  let failures = 0;
  let totalSkipped = 0;

  for (const inputPath of args.inputs) {
    try {
      const inputText = await Bun.file(inputPath).text();
      const isAss = detectAssFormat(inputPath, inputText);
      const { blocks, skippedBlocks } = isAss
        ? parseAss(inputText, { omitWhiteColor: !args.keepWhite })
        : parseSrt(inputText);

      if (blocks.length === 0) {
        console.error(isAss ? "No valid ASS dialogue blocks found." : "No valid subtitle blocks found.");
        process.exit(1);
      }

      assignSlots(blocks, {
        clean: args.clean,
        ignoreExisting: args.ignoreExisting,
        omitDefault: args.omitDefault,
      });

      const output = serializeSrt(blocks);

      if (args.inPlace) {
        await Bun.write(inputPath, output + "\n");
      } else if (args.outDir) {
        const { file } = splitDirAndFile(inputPath);
        const filename = replaceExtWithSrt(file);
        const target = `${args.outDir.replace(/\/$/, "")}/${filename}`;
        await Bun.write(target, output + "\n");
      } else if (args.suffix) {
        const { dir, file } = splitDirAndFile(inputPath);
        const filename = applySuffix(replaceExtWithSrt(file), args.suffix);
        const target = `${dir}/${filename}`;
        await Bun.write(target, output + "\n");
      } else if (args.output) {
        await Bun.write(args.output, output + "\n");
      } else {
        console.log(output);
      }

      totalSkipped += skippedBlocks;
    } catch (error) {
      failures += 1;
      console.error(
        error instanceof Error ? `${inputPath}: ${error.message}` : `${inputPath}: ${String(error)}`,
      );
    }
  }

  if (totalSkipped > 0) {
    console.error(`Skipped ${totalSkipped} empty or malformed block(s).`);
  }
  if (failures > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
