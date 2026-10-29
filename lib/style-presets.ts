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
