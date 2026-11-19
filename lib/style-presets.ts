import type { HwpxAnalysis, HwpxParagraphInfo, ParagraphRole } from "@/lib/hwpx-parser";

export type StyleSettings = {
  font: string;
  fontSize: string;
  lineSpacing: string;
  alignment: string;
  indentation: string;
  bold: boolean;
};

export type DocumentStyle = {
  id: string;
  name: string;
  colorIndex: number;
  settings: StyleSettings;
};

export type StoredStylePreset = {
  id: string;
  user_id: string;
  name: string;
  styles: unknown;
  description?: string;
  is_public?: boolean;
  author_name?: string;
  created_at?: string;
  updated_at: string;
};

export const initialStyles: DocumentStyle[] = [
  {
    id: "style-1",
    name: "스타일 1 · 소제목",
    colorIndex: 0,
    settings: { font: "본고딕", fontSize: "14", lineSpacing: "160", alignment: "왼쪽", indentation: "0", bold: true },
  },
  {
    id: "style-2",
    name: "스타일 2 · 본문",
    colorIndex: 1,
    settings: { font: "함초롬바탕", fontSize: "11", lineSpacing: "160", alignment: "양쪽", indentation: "0", bold: false },
  },
];

export function readStoredStyles(value: unknown): DocumentStyle[] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const valid = value.every((style) => {
    if (!style || typeof style !== "object") return false;
    const candidate = style as Partial<DocumentStyle>;
    const settings = candidate.settings as Partial<StyleSettings> | undefined;
    return typeof candidate.id === "string"
      && typeof candidate.name === "string"
      && typeof candidate.colorIndex === "number"
      && Boolean(settings)
      && typeof settings?.font === "string"
      && typeof settings.fontSize === "string"
      && typeof settings.lineSpacing === "string"
      && typeof settings.alignment === "string"
      && typeof settings.indentation === "string"
      && typeof settings.bold === "boolean";
  });
  return valid ? value as DocumentStyle[] : null;
}

function dominantValue<T extends string | number | boolean>(
  paragraphs: HwpxParagraphInfo[],
  read: (paragraph: HwpxParagraphInfo) => T | undefined,
): T | undefined {
  const weights = new Map<T, number>();
  paragraphs.forEach((paragraph) => {
    const value = read(paragraph);
    if (value === undefined || value === "" || (typeof value === "number" && !Number.isFinite(value))) return;
    const weight = Math.max(1, paragraph.text.replace(/\s/g, "").length);
    weights.set(value, (weights.get(value) ?? 0) + weight);
  });
  return [...weights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function roleParagraphs(analysis: HwpxAnalysis, role: ParagraphRole) {
  const meaningful = analysis.paragraphDetails.filter((paragraph) => paragraph.text.trim());
  const outsideTables = meaningful.filter((paragraph) => !paragraph.inTable);
  const matching = outsideTables.filter((paragraph) => paragraph.suggestedRole === role);
  if (matching.length > 0) return matching;

  const matchingWithTables = meaningful.filter((paragraph) => paragraph.suggestedRole === role);
  if (matchingWithTables.length > 0) return matchingWithTables;

  if (role === "heading" && outsideTables.length > 0) {
    return [outsideTables.reduce((best, paragraph) => {
      const score = (paragraph.format.fontSize ?? 0) + (paragraph.format.bold ? 3 : 0);
      const bestScore = (best.format.fontSize ?? 0) + (best.format.bold ? 3 : 0);
      return score > bestScore ? paragraph : best;
    })];
  }

  return outsideTables.length > 0 ? outsideTables : meaningful;
}

function extractedSettings(paragraphs: HwpxParagraphInfo[], fallback: StyleSettings): StyleSettings {
  const fontSize = dominantValue(paragraphs, (paragraph) => paragraph.format.fontSize);
  const lineSpacing = dominantValue(paragraphs, (paragraph) => paragraph.format.lineSpacing);
  const indentation = dominantValue(paragraphs, (paragraph) => paragraph.format.indentation);
  const alignment = dominantValue(paragraphs, (paragraph) => paragraph.format.alignment)?.toUpperCase();
  const alignmentLabels: Record<string, string> = {
    LEFT: "왼쪽",
    CENTER: "가운데",
    RIGHT: "오른쪽",
    JUSTIFY: "양쪽",
    DISTRIBUTE: "양쪽",
  };
  const formatNumber = (value: number | undefined, fallbackValue: string, halfStep = false) => {
    if (value === undefined) return fallbackValue;
    const rounded = halfStep ? Math.round(value * 2) / 2 : Math.round(value * 100) / 100;
    return String(rounded);
  };

  return {
    font: dominantValue(paragraphs, (paragraph) => paragraph.format.font) ?? fallback.font,
    fontSize: formatNumber(fontSize === undefined ? undefined : Math.min(80, Math.max(1, fontSize)), fallback.fontSize, true),
    lineSpacing: formatNumber(lineSpacing, fallback.lineSpacing),
    alignment: alignment ? alignmentLabels[alignment] ?? fallback.alignment : fallback.alignment,
    indentation: formatNumber(indentation, fallback.indentation),
    bold: dominantValue(paragraphs, (paragraph) => paragraph.format.bold) ?? fallback.bold,
  };
}

export function extractStylesFromHwpx(analysis: HwpxAnalysis): DocumentStyle[] {
  const headingFallback = initialStyles[0].settings;
  const bodyFallback = initialStyles[1].settings;
  return [
    {
      id: "style-1",
      name: "스타일 1 · 소제목",
      colorIndex: 0,
      settings: extractedSettings(roleParagraphs(analysis, "heading"), headingFallback),
    },
    {
      id: "style-2",
      name: "스타일 2 · 본문",
      colorIndex: 1,
      settings: extractedSettings(roleParagraphs(analysis, "body"), bodyFallback),
    },
  ];
}
