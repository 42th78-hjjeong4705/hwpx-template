import type { HwpxAnalysis, HwpxParagraphInfo } from "@/lib/hwpx-parser";

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
  if (!Array.isArray(value) || value.length < 1) return null;
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

const genericHwpxStyleNames = new Set(["바탕글", "normal", "body text"]);

function usefulStyleName(paragraph: HwpxParagraphInfo) {
  const name = paragraph.styleName?.trim();
  if (!name || genericHwpxStyleNames.has(name.toLowerCase())) return undefined;
  return name;
}

function styleSignature(settings: StyleSettings, sourceStyleName?: string) {
  return JSON.stringify([
    sourceStyleName?.toLowerCase() ?? "",
    settings.font.toLowerCase(),
    settings.fontSize,
    settings.lineSpacing,
    settings.alignment,
    settings.indentation,
    settings.bold,
  ]);
}

export function extractStylesFromHwpx(analysis: HwpxAnalysis): DocumentStyle[] {
  const meaningful = analysis.paragraphDetails.filter((paragraph) => paragraph.text.trim());
  const candidates = meaningful;
  const clusters = new Map<string, {
    firstIndex: number;
    paragraphs: HwpxParagraphInfo[];
    settings: StyleSettings;
    sourceStyleName?: string;
    characterCount: number;
  }>();

  candidates.forEach((paragraph, index) => {
    const fallback = paragraph.suggestedRole === "heading" ? initialStyles[0].settings : initialStyles[1].settings;
    const settings = extractedSettings([paragraph], fallback);
    const sourceStyleName = usefulStyleName(paragraph);
    const signature = styleSignature(settings, sourceStyleName);
    const existing = clusters.get(signature);
    if (existing) {
      existing.paragraphs.push(paragraph);
      existing.characterCount += Math.max(1, paragraph.text.replace(/\s/g, "").length);
      return;
    }
    clusters.set(signature, {
      firstIndex: index,
      paragraphs: [paragraph],
      settings,
      sourceStyleName,
      characterCount: Math.max(1, paragraph.text.replace(/\s/g, "").length),
    });
  });

  if (clusters.size === 0) return initialStyles.map((style) => ({ ...style, settings: { ...style.settings } }));

  const selectedClusters = [...clusters.values()]
    .sort((a, b) => b.characterCount - a.characterCount)
    .sort((a, b) => a.firstIndex - b.firstIndex);
  const bodyClusters = selectedClusters.filter((cluster) => (
    cluster.paragraphs.filter((paragraph) => paragraph.suggestedRole === "body").length / cluster.paragraphs.length >= 0.5
  ));
  const bodyCluster = (bodyClusters.length > 0 ? bodyClusters : selectedClusters).reduce((largest, cluster) => (
    cluster.characterCount > largest.characterCount ? cluster : largest
  ));
  let headingNamed = false;

  const extracted = selectedClusters.map((cluster, index): DocumentStyle => {
    const number = index + 1;
    const headingRatio = cluster.paragraphs.filter((paragraph) => paragraph.suggestedRole === "heading").length / cluster.paragraphs.length;
    let label = cluster.sourceStyleName;
    if (!label && !headingNamed && headingRatio >= 0.5) {
      label = "소제목";
      headingNamed = true;
    } else if (!label && cluster === bodyCluster) {
      label = "본문";
    }
    return {
      id: `style-${number}`,
      name: label ? `스타일 ${number} · ${label}` : `스타일 ${number}`,
      colorIndex: (number - 1) % 6,
      settings: cluster.settings,
    };
  });

  return extracted;
}
