import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

export type CountedValue = {
  label: string;
  count: number;
};

export type HwpxStyleSummary = {
  fonts: CountedValue[];
  fontSizes: CountedValue[];
  alignments: CountedValue[];
  lineSpacings: CountedValue[];
  indentations: CountedValue[];
  boldCharacters: number;
  paragraphCount: number;
  characterCount: number;
  sectionCount: number;
};

export type ParagraphRole = "heading" | "body";

export type HwpxParagraphInfo = {
  id: string;
  text: string;
  sectionFile: string;
  paragraphIndex: number;
  suggestedRole: ParagraphRole;
  styleName?: string;
  inTable: boolean;
};

export type HwpxAnalysis = {
  text: string;
  paragraphs: string[];
  paragraphDetails: HwpxParagraphInfo[];
  styles: HwpxStyleSummary;
};

export type HwpxFormatSettings = {
  font: string;
  fontSize: number;
  lineSpacing: number;
  alignment: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFY";
  indentation: number;
};

export type ParagraphStylePreset = HwpxFormatSettings & {
  bold: boolean;
};

export type ParagraphStyleAssignments = Record<string, ParagraphRole>;

type CharacterStyle = {
  fontName?: string;
  fontSize?: string;
  fontSizePt?: number;
  bold: boolean;
};

type ParagraphStyle = {
  alignment?: string;
  lineSpacing?: string;
  indentation?: string;
};

const decoder = (value: Uint8Array) => strFromU8(value);

function parseXml(value: Uint8Array, fileName: string) {
  const document = new DOMParser().parseFromString(decoder(value), "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`${fileName} XML을 해석하지 못했습니다.`);
  }
  return document;
}

function serializeXml(document: Document, originalXml: string) {
  const serialized = new XMLSerializer().serializeToString(document);
  const declaration = originalXml.match(/^\s*(<\?xml[^?]*\?>)/)?.[1];
  const withDeclaration = declaration && !serialized.startsWith("<?xml")
    ? `${declaration}\n${serialized}`
    : serialized;
  return strToU8(withDeclaration);
}

function elements(root: Document | Element, localName: string) {
  return Array.from(root.getElementsByTagNameNS("*", localName));
}

function closestAncestor(element: Element, localName: string) {
  let current: Element | null = element;
  while (current) {
    if (current.localName === localName) return current;
    current = current.parentElement;
  }
  return null;
}

function addCount(map: Map<string, number>, label: string | undefined, amount = 1) {
  if (!label || amount <= 0) return;
  map.set(label, (map.get(label) ?? 0) + amount);
}

function sortedCounts(map: Map<string, number>) {
  return Array.from(map, ([label, count]) => ({ label, count })).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"),
  );
}

function directParagraphText(paragraph: Element) {
  return elements(paragraph, "t")
    .filter((textNode) => closestAncestor(textNode, "p") === paragraph)
    .map((textNode) => textNode.textContent ?? "")
    .join("")
    .replace(/\u0000/g, "");
}

function directRunText(run: Element) {
  return elements(run, "t")
    .filter((textNode) => closestAncestor(textNode, "run") === run)
    .map((textNode) => textNode.textContent ?? "")
    .join("")
    .replace(/\u0000/g, "");
}

function sectionOrder(fileName: string) {
  return Number(fileName.match(/section(\d+)\.xml$/i)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

function classifyParagraph({
  text,
  styleName,
  averageFontSize,
  dominantFontSize,
  boldRatio,
  inTable,
}: {
  text: string;
  styleName?: string;
  averageFontSize?: number;
  dominantFontSize?: number;
  boldRatio: number;
  inTable: boolean;
}): ParagraphRole {
  const normalizedStyleName = styleName?.toLowerCase() ?? "";
  if (/본문|바탕글|body|normal/.test(normalizedStyleName)) return "body";
  if (/소제목|제목|개요|heading|title/.test(normalizedStyleName)) return "heading";

  let score = 0;
  const trimmed = text.trim();
  if (trimmed.length <= 45) score += 1;
  if (trimmed.length <= 22) score += 1;
  if (/^(?:\d+(?:\.\d+)*[.)]?|[가-힣][.)]|[Ⅰ-Ⅻ]+[.)]?|[①-⑳])\s*/.test(trimmed)) score += 2;
  if (!/[.!?。！？]$/.test(trimmed)) score += 1;
  if (boldRatio >= 0.6) score += 2;
  if (
    averageFontSize !== undefined
    && dominantFontSize !== undefined
    && averageFontSize >= dominantFontSize + 0.5
  ) {
    score += 2;
  }
  if (trimmed.length >= 80) score -= 3;
  if (inTable) score -= 2;
  return score >= 3 ? "heading" : "body";
}

export async function analyzeHwpx(buffer: ArrayBuffer): Promise<HwpxAnalysis> {
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new Error("파일 압축을 열 수 없습니다. 올바른 HWPX 파일인지 확인해 주세요.");
  }

  const headerFile = archive["Contents/header.xml"];
  const sectionFiles = Object.keys(archive)
    .filter((name) => /^Contents\/section\d+\.xml$/i.test(name))
    .sort((a, b) => sectionOrder(a) - sectionOrder(b));

  if (!headerFile || sectionFiles.length === 0) {
    throw new Error("HWPX 문서 구조를 찾지 못했습니다. header.xml과 section XML이 필요합니다.");
  }

  const header = parseXml(headerFile, "Contents/header.xml");
  const hangulFontFace = elements(header, "fontface").find(
    (fontFace) => fontFace.getAttribute("lang")?.toUpperCase() === "HANGUL",
  );
  const fontMap = new Map<string, string>();
  if (hangulFontFace) {
    elements(hangulFontFace, "font")
      .filter((font) => font.parentElement === hangulFontFace)
      .forEach((font) => {
        const id = font.getAttribute("id");
        const face = font.getAttribute("face");
        if (id && face) fontMap.set(id, face);
      });
  }

  const characterStyles = new Map<string, CharacterStyle>();
  elements(header, "charPr").forEach((characterProperty) => {
    const id = characterProperty.getAttribute("id");
    if (!id) return;
    const fontReference = elements(characterProperty, "fontRef")[0];
    const rawHeight = Number(characterProperty.getAttribute("height"));
    characterStyles.set(id, {
      fontName: fontMap.get(fontReference?.getAttribute("hangul") ?? ""),
      fontSize: Number.isFinite(rawHeight)
        ? `${Number((rawHeight / 100).toFixed(2))}pt`
        : undefined,
      fontSizePt: Number.isFinite(rawHeight) ? rawHeight / 100 : undefined,
      bold: elements(characterProperty, "bold").length > 0,
    });
  });

  const styleNames = new Map<string, string>();
  elements(header, "style").forEach((style) => {
    const id = style.getAttribute("id");
    const name = style.getAttribute("name") ?? style.getAttribute("engName");
    if (id && name) styleNames.set(id, name);
  });

  const paragraphStyles = new Map<string, ParagraphStyle>();
  elements(header, "paraPr").forEach((paragraphProperty) => {
    const id = paragraphProperty.getAttribute("id");
    if (!id) return;
    const alignment = elements(paragraphProperty, "align")[0]?.getAttribute("horizontal") ?? undefined;
    const lineSpacingNode = elements(paragraphProperty, "lineSpacing")[0];
    const lineSpacingValue = lineSpacingNode?.getAttribute("value") ?? undefined;
    const lineSpacingType = lineSpacingNode?.getAttribute("type") ?? undefined;
    const rawIndentation = Number(elements(paragraphProperty, "intent")[0]?.getAttribute("value"));
    paragraphStyles.set(id, {
      alignment,
      lineSpacing: lineSpacingValue
        ? `${lineSpacingValue}${lineSpacingType === "PERCENT" ? "%" : ""}`
        : undefined,
      indentation: Number.isFinite(rawIndentation)
        ? `${Number((rawIndentation / 100).toFixed(2))}pt`
        : undefined,
    });
  });

  const paragraphs: string[] = [];
  const pendingParagraphDetails: Array<
    Omit<HwpxParagraphInfo, "suggestedRole"> & {
      averageFontSize?: number;
      boldRatio: number;
    }
  > = [];
  const fontCounts = new Map<string, number>();
  const fontSizeCounts = new Map<string, number>();
  const alignmentCounts = new Map<string, number>();
  const lineSpacingCounts = new Map<string, number>();
  const indentationCounts = new Map<string, number>();
  let boldCharacters = 0;

  sectionFiles.forEach((fileName) => {
    const section = parseXml(archive[fileName], fileName);
    elements(section, "p").forEach((paragraph, paragraphIndex) => {
      const text = directParagraphText(paragraph).trimEnd();
      if (!text.trim()) return;
      paragraphs.push(text);

      const paragraphStyle = paragraphStyles.get(paragraph.getAttribute("paraPrIDRef") ?? "");
      addCount(alignmentCounts, paragraphStyle?.alignment);
      addCount(lineSpacingCounts, paragraphStyle?.lineSpacing);
      addCount(indentationCounts, paragraphStyle?.indentation);

      let styledCharacterCount = 0;
      let boldCharacterCount = 0;
      let weightedFontSize = 0;
      let fontSizeCharacterCount = 0;

      elements(paragraph, "run")
        .filter((run) => closestAncestor(run, "p") === paragraph)
        .forEach((run) => {
          const length = directRunText(run).replace(/\s/g, "").length;
          if (length === 0) return;
          const style = characterStyles.get(run.getAttribute("charPrIDRef") ?? "");
          addCount(fontCounts, style?.fontName, length);
          addCount(fontSizeCounts, style?.fontSize, length);
          styledCharacterCount += length;
          if (style?.fontSizePt !== undefined) {
            weightedFontSize += style.fontSizePt * length;
            fontSizeCharacterCount += length;
          }
          if (style?.bold) {
            boldCharacters += length;
            boldCharacterCount += length;
          }
        });

      pendingParagraphDetails.push({
        id: `${fileName}:${paragraphIndex}`,
        text,
        sectionFile: fileName,
        paragraphIndex,
        styleName: styleNames.get(paragraph.getAttribute("styleIDRef") ?? ""),
        inTable: Boolean(closestAncestor(paragraph, "tc") || closestAncestor(paragraph, "tbl")),
        averageFontSize: fontSizeCharacterCount > 0
          ? weightedFontSize / fontSizeCharacterCount
          : undefined,
        boldRatio: styledCharacterCount > 0 ? boldCharacterCount / styledCharacterCount : 0,
      });
    });
  });

  const extractedText = paragraphs.join("\n");
  const previewText = archive["Preview/PrvText.txt"]
    ? decoder(archive["Preview/PrvText.txt"]).trim()
    : "";
  const text = extractedText || previewText;

  if (!text) {
    throw new Error("문서에서 표시할 텍스트를 찾지 못했습니다.");
  }

  const dominantFontSize = Number.parseFloat(sortedCounts(fontSizeCounts)[0]?.label ?? "");
  const paragraphDetails: HwpxParagraphInfo[] = pendingParagraphDetails.map((paragraph) => ({
    id: paragraph.id,
    text: paragraph.text,
    sectionFile: paragraph.sectionFile,
    paragraphIndex: paragraph.paragraphIndex,
    styleName: paragraph.styleName,
    inTable: paragraph.inTable,
    suggestedRole: classifyParagraph({
      text: paragraph.text,
      styleName: paragraph.styleName,
      averageFontSize: paragraph.averageFontSize,
      dominantFontSize: Number.isFinite(dominantFontSize) ? dominantFontSize : undefined,
      boldRatio: paragraph.boldRatio,
      inTable: paragraph.inTable,
    }),
  }));

  return {
    text,
    paragraphs,
    paragraphDetails,
    styles: {
      fonts: sortedCounts(fontCounts),
      fontSizes: sortedCounts(fontSizeCounts),
      alignments: sortedCounts(alignmentCounts),
      lineSpacings: sortedCounts(lineSpacingCounts),
      indentations: sortedCounts(indentationCounts),
      boldCharacters,
      paragraphCount: paragraphs.length,
      characterCount: text.replace(/\s/g, "").length,
      sectionCount: sectionFiles.length,
    },
  };
}

export function formatHwpx(buffer: ArrayBuffer, settings: HwpxFormatSettings) {
  if (!settings.font.trim()) throw new Error("적용할 글꼴을 선택해 주세요.");
  if (!Number.isFinite(settings.fontSize) || settings.fontSize <= 0) {
    throw new Error("글자 크기는 0보다 커야 합니다.");
  }
  if (!Number.isFinite(settings.lineSpacing) || settings.lineSpacing <= 0) {
    throw new Error("줄 간격은 0보다 커야 합니다.");
  }
  if (!Number.isFinite(settings.indentation) || settings.indentation < 0) {
    throw new Error("들여쓰기는 0 이상이어야 합니다.");
  }

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new Error("파일 압축을 열 수 없습니다. 올바른 HWPX 파일인지 확인해 주세요.");
  }

  const headerFileName = "Contents/header.xml";
  const headerFile = archive[headerFileName];
  if (!headerFile) {
    throw new Error("HWPX 문서에서 Contents/header.xml을 찾지 못했습니다.");
  }

  const originalHeader = decoder(headerFile);
  const header = parseXml(headerFile, headerFileName);

  elements(header, "font").forEach((font) => {
    font.setAttribute("face", settings.font);
    font.setAttribute("isEmbedded", "0");
  });

  const fontHeight = String(Math.round(settings.fontSize * 100));
  elements(header, "charPr").forEach((characterProperty) => {
    characterProperty.setAttribute("height", fontHeight);
  });

  const indentation = String(Math.round(settings.indentation * 100));
  elements(header, "paraPr").forEach((paragraphProperty) => {
    elements(paragraphProperty, "align")[0]?.setAttribute("horizontal", settings.alignment);

    const lineSpacing = elements(paragraphProperty, "lineSpacing")[0];
    if (lineSpacing) {
      lineSpacing.setAttribute("type", "PERCENT");
      lineSpacing.setAttribute("value", String(Math.round(settings.lineSpacing)));
    }

    elements(paragraphProperty, "intent")[0]?.setAttribute("value", indentation);
  });

  archive[headerFileName] = serializeXml(header, originalHeader);

  const packaged: Zippable = {};
  if (archive.mimetype) {
    packaged.mimetype = [archive.mimetype, { level: 0 }];
  }
  Object.entries(archive).forEach(([fileName, contents]) => {
    if (fileName !== "mimetype") packaged[fileName] = contents;
  });

  return zipSync(packaged, { level: 6 });
}

function setBoldProperty(document: Document, characterProperty: Element, bold: boolean) {
  elements(characterProperty, "bold").forEach((element) => element.remove());
  if (!bold) return;

  const prefix = characterProperty.prefix ? `${characterProperty.prefix}:bold` : "bold";
  const boldElement = document.createElementNS(characterProperty.namespaceURI, prefix);
  const childOrder = [
    "fontRef",
    "ratio",
    "spacing",
    "relSz",
    "offset",
    "italic",
    "bold",
    "underline",
    "strikeout",
    "outline",
    "shadow",
    "emboss",
    "engrave",
    "supscript",
    "subscript",
  ];
  const boldOrder = childOrder.indexOf("bold");
  const insertionPoint = Array.from(characterProperty.children).find((child) => {
    const childIndex = childOrder.indexOf(child.localName);
    return childIndex > boldOrder;
  });
  characterProperty.insertBefore(boldElement, insertionPoint ?? null);
}

export function formatHwpxByParagraphStyles(
  buffer: ArrayBuffer,
  presets: Record<ParagraphRole, ParagraphStylePreset>,
  assignments: ParagraphStyleAssignments,
) {
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new Error("파일 압축을 열 수 없습니다. 올바른 HWPX 파일인지 확인해 주세요.");
  }

  const headerFileName = "Contents/header.xml";
  const headerFile = archive[headerFileName];
  const sectionFiles = Object.keys(archive)
    .filter((name) => /^Contents\/section\d+\.xml$/i.test(name))
    .sort((a, b) => sectionOrder(a) - sectionOrder(b));
  if (!headerFile || sectionFiles.length === 0) {
    throw new Error("HWPX 문서의 서식 또는 문단 XML을 찾지 못했습니다.");
  }

  const originalHeader = decoder(headerFile);
  const header = parseXml(headerFile, headerFileName);
  const characterPropertiesContainer = elements(header, "charProperties")[0];
  const paragraphPropertiesContainer = elements(header, "paraProperties")[0];
  if (!characterPropertiesContainer || !paragraphPropertiesContainer) {
    throw new Error("HWPX 문서의 글자 또는 문단 서식 목록을 찾지 못했습니다.");
  }

  const characterProperties = new Map(
    elements(characterPropertiesContainer, "charPr")
      .filter((element) => element.parentElement === characterPropertiesContainer)
      .map((element) => [element.getAttribute("id") ?? "", element]),
  );
  const paragraphProperties = new Map(
    elements(paragraphPropertiesContainer, "paraPr")
      .filter((element) => element.parentElement === paragraphPropertiesContainer)
      .map((element) => [element.getAttribute("id") ?? "", element]),
  );
  let nextCharacterPropertyId = Math.max(
    -1,
    ...Array.from(characterProperties.keys(), (id) => Number(id)).filter(Number.isFinite),
  ) + 1;
  let nextParagraphPropertyId = Math.max(
    -1,
    ...Array.from(paragraphProperties.keys(), (id) => Number(id)).filter(Number.isFinite),
  ) + 1;

  const fontReferenceAttributes: Record<string, string> = {
    HANGUL: "hangul",
    LATIN: "latin",
    HANJA: "hanja",
    JAPANESE: "japanese",
    OTHER: "other",
    SYMBOL: "symbol",
    USER: "user",
  };
  const fontIdsByPreset = new Map<ParagraphRole, Map<string, string>>();

  (["heading", "body"] as const).forEach((role) => {
    const fontIds = new Map<string, string>();
    elements(header, "fontface").forEach((fontFace) => {
      const language = fontFace.getAttribute("lang")?.toUpperCase();
      const referenceAttribute = language ? fontReferenceAttributes[language] : undefined;
      if (!referenceAttribute) return;
      const fonts = elements(fontFace, "font").filter((font) => font.parentElement === fontFace);
      let selectedFont = fonts.find((font) => font.getAttribute("face") === presets[role].font);
      if (!selectedFont && fonts[0]) {
        selectedFont = fonts[0].cloneNode(true) as Element;
        const nextFontId = Math.max(
          -1,
          ...fonts.map((font) => Number(font.getAttribute("id"))).filter(Number.isFinite),
        ) + 1;
        selectedFont.setAttribute("id", String(nextFontId));
        selectedFont.setAttribute("face", presets[role].font);
        selectedFont.setAttribute("isEmbedded", "0");
        fontFace.appendChild(selectedFont);
        fontFace.setAttribute("fontCnt", String(fonts.length + 1));
      }
      const selectedFontId = selectedFont?.getAttribute("id");
      if (selectedFontId) fontIds.set(referenceAttribute, selectedFontId);
    });
    fontIdsByPreset.set(role, fontIds);
  });

  const characterPropertyCache = new Map<string, string>();
  const paragraphPropertyCache = new Map<string, string>();

  const characterPropertyFor = (sourceId: string, role: ParagraphRole) => {
    const cacheKey = `${role}:${sourceId}`;
    const cached = characterPropertyCache.get(cacheKey);
    if (cached) return cached;
    const source = characterProperties.get(sourceId) ?? characterProperties.values().next().value;
    if (!source) throw new Error("복제할 글자 서식을 찾지 못했습니다.");
    const clone = source.cloneNode(true) as Element;
    const nextId = String(nextCharacterPropertyId++);
    clone.setAttribute("id", nextId);
    clone.setAttribute("height", String(Math.round(presets[role].fontSize * 100)));
    const fontReference = elements(clone, "fontRef")[0];
    fontIdsByPreset.get(role)?.forEach((fontId, attribute) => {
      fontReference?.setAttribute(attribute, fontId);
    });
    setBoldProperty(header, clone, presets[role].bold);
    characterPropertiesContainer.appendChild(clone);
    characterProperties.set(nextId, clone);
    characterPropertyCache.set(cacheKey, nextId);
    return nextId;
  };

  const paragraphPropertyFor = (sourceId: string, role: ParagraphRole) => {
    const cacheKey = `${role}:${sourceId}`;
    const cached = paragraphPropertyCache.get(cacheKey);
    if (cached) return cached;
    const source = paragraphProperties.get(sourceId) ?? paragraphProperties.values().next().value;
    if (!source) throw new Error("복제할 문단 서식을 찾지 못했습니다.");
    const clone = source.cloneNode(true) as Element;
    const nextId = String(nextParagraphPropertyId++);
    clone.setAttribute("id", nextId);
    elements(clone, "align")[0]?.setAttribute("horizontal", presets[role].alignment);
    const lineSpacing = elements(clone, "lineSpacing")[0];
    lineSpacing?.setAttribute("type", "PERCENT");
    lineSpacing?.setAttribute("value", String(Math.round(presets[role].lineSpacing)));
    elements(clone, "intent")[0]?.setAttribute(
      "value",
      String(Math.round(presets[role].indentation * 100)),
    );
    paragraphPropertiesContainer.appendChild(clone);
    paragraphProperties.set(nextId, clone);
    paragraphPropertyCache.set(cacheKey, nextId);
    return nextId;
  };

  sectionFiles.forEach((fileName) => {
    const originalSection = decoder(archive[fileName]);
    const section = parseXml(archive[fileName], fileName);
    elements(section, "p").forEach((paragraph, paragraphIndex) => {
      const role = assignments[`${fileName}:${paragraphIndex}`];
      if (!role) return;
      paragraph.setAttribute(
        "paraPrIDRef",
        paragraphPropertyFor(paragraph.getAttribute("paraPrIDRef") ?? "", role),
      );
      elements(paragraph, "run")
        .filter((run) => closestAncestor(run, "p") === paragraph)
        .forEach((run) => {
          run.setAttribute(
            "charPrIDRef",
            characterPropertyFor(run.getAttribute("charPrIDRef") ?? "", role),
          );
        });
    });
    archive[fileName] = serializeXml(section, originalSection);
  });

  characterPropertiesContainer.setAttribute(
    "itemCnt",
    String(
      elements(characterPropertiesContainer, "charPr")
        .filter((element) => element.parentElement === characterPropertiesContainer).length,
    ),
  );
  paragraphPropertiesContainer.setAttribute(
    "itemCnt",
    String(
      elements(paragraphPropertiesContainer, "paraPr")
        .filter((element) => element.parentElement === paragraphPropertiesContainer).length,
    ),
  );
  archive[headerFileName] = serializeXml(header, originalHeader);

  const packaged: Zippable = {};
  if (archive.mimetype) packaged.mimetype = [archive.mimetype, { level: 0 }];
  Object.entries(archive).forEach(([fileName, contents]) => {
    if (fileName !== "mimetype") packaged[fileName] = contents;
  });
  return zipSync(packaged, { level: 6 });
}
