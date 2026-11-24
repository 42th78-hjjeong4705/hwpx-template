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
  format: {
    font?: string;
    fontSize?: number;
    lineSpacing?: number;
    alignment?: string;
    indentation?: number;
    bold: boolean;
  };
};

export type HwpxTableBorderInfo = {
  type: string;
  width?: string;
  color?: string;
};

export type HwpxTableCellInfo = {
  id: string;
  column: number;
  row: number;
  columnSpan: number;
  rowSpan: number;
  paragraphIds: string[];
  imageIds: string[];
  backgroundColor?: string;
  borders: {
    left?: HwpxTableBorderInfo;
    right?: HwpxTableBorderInfo;
    top?: HwpxTableBorderInfo;
    bottom?: HwpxTableBorderInfo;
  };
};

export type HwpxImageInfo = {
  id: string;
  dataUrl: string;
  width?: number;
  height?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  crop?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  placement: {
    anchorParagraphId?: string;
    inTable: boolean;
    treatAsCharacter: boolean;
    textWrap: string;
    zOrder: number;
    horizontalRelativeTo: string;
    verticalRelativeTo: string;
    horizontalAlign: string;
    verticalAlign: string;
    horizontalOffset: number;
    verticalOffset: number;
    pageWidth?: number;
    pageHeight?: number;
    contentWidth?: number;
    contentHeight?: number;
    marginLeft?: number;
    marginTop?: number;
    definitelyHidden: boolean;
  };
};

export type HwpxDocumentBlock =
  | { type: "paragraph"; id: string; paragraphId: string }
  | { type: "image"; id: string; imageId: string }
  | {
    type: "table";
    id: string;
    rowCount: number;
    columnCount: number;
    rows: HwpxTableCellInfo[][];
  };

export type HwpxAnalysis = {
  text: string;
  paragraphs: string[];
  paragraphDetails: HwpxParagraphInfo[];
  documentBlocks: HwpxDocumentBlock[];
  images: HwpxImageInfo[];
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

export type ParagraphStyleAssignments = Record<string, string>;

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

type TableBorderFill = {
  backgroundColor?: string;
  borders: HwpxTableCellInfo["borders"];
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

function closestAncestor(element: Element | null, localName: string) {
  let current = element;
  while (current) {
    if (current.localName === localName) return current;
    current = current.parentElement;
  }
  return null;
}

const supportedHwpxNamespaces = new Set([
  "hc",
  "hh",
  "hp",
  "hs",
  "http://www.hancom.co.kr/hwpml/2011/core",
  "http://www.hancom.co.kr/hwpml/2011/head",
  "http://www.hancom.co.kr/hwpml/2011/paragraph",
  "http://www.hancom.co.kr/hwpml/2011/section",
]);

function selectedCompatibilityBranch(switchElement: Element) {
  const branches = Array.from(switchElement.children).filter(
    (child) => child.localName === "case" || child.localName === "default",
  );
  const supportedCase = branches.find((branch) => {
    if (branch.localName !== "case") return false;
    const requirement = branch.getAttribute("required-namespace")
      ?? branch.getAttribute("requiredNamespace")
      ?? "";
    const namespaces = requirement.split(/[\s,]+/).filter(Boolean);
    return namespaces.length === 0
      || namespaces.every((namespace) => supportedHwpxNamespaces.has(namespace));
  });
  return supportedCase ?? branches.find((branch) => branch.localName === "default");
}

function isInSelectedCompatibilityBranch(element: Element) {
  let current: Element | null = element;
  while (current?.parentElement) {
    const parent: Element = current.parentElement;
    if (
      parent.localName === "switch"
      && (current.localName === "case" || current.localName === "default")
      && selectedCompatibilityBranch(parent) !== current
    ) {
      return false;
    }
    current = parent;
  }
  return true;
}

function hiddenTrackedElements(
  root: Document,
  hiddenDeleteChangeIds: Set<string>,
  localName: string,
) {
  const hidden = new Set<Element>();
  const activeRanges = new Set<string>();

  const visit = (element: Element) => {
    const rangeId = element.getAttribute("Id") ?? element.getAttribute("id") ?? "";
    const changeId = element.getAttribute("TcId") ?? element.getAttribute("tcId") ?? "";
    const rangeKey = `${changeId}:${rangeId}`;

    if (element.localName === "deleteEnd" && rangeId) {
      activeRanges.delete(rangeKey);
    }
    if (
      element.localName === "deleteBegin"
      && rangeId
      && hiddenDeleteChangeIds.has(changeId)
    ) {
      activeRanges.add(rangeKey);
    }
    if (element.localName === localName && activeRanges.size > 0) {
      hidden.add(element);
    }

    Array.from(element.children).forEach(visit);
  };

  if (root.documentElement) visit(root.documentElement);
  return hidden;
}

function visibleTextNodes(root: Document, hiddenDeleteChangeIds: Set<string>) {
  const visible = new Set<Text>();
  const activeRanges = new Set<string>();

  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      if (activeRanges.size === 0) visible.add(node as Text);
      return;
    }
    if (node.nodeType !== 1) return;

    const element = node as Element;
    if (
      element.localName === "hiddenComment"
      || !isInSelectedCompatibilityBranch(element)
    ) {
      return;
    }

    const rangeId = element.getAttribute("Id") ?? element.getAttribute("id") ?? "";
    const changeId = element.getAttribute("TcId") ?? element.getAttribute("tcId") ?? "";
    const rangeKey = `${changeId}:${rangeId}`;

    if (element.localName === "deleteEnd" && rangeId) {
      activeRanges.delete(rangeKey);
    }
    if (
      element.localName === "deleteBegin"
      && rangeId
      && hiddenDeleteChangeIds.has(changeId)
    ) {
      activeRanges.add(rangeKey);
    }

    Array.from(element.childNodes).forEach(visit);
  };

  if (root.documentElement) visit(root.documentElement);
  return visible;
}

function textFromVisibleNodes(element: Element, visibleNodes: Set<Text>) {
  let text = "";
  const collect = (node: Node) => {
    if (node.nodeType === 3) {
      if (visibleNodes.has(node as Text)) text += node.nodeValue ?? "";
      return;
    }
    Array.from(node.childNodes).forEach(collect);
  };
  collect(element);
  return text;
}

function isInsideHiddenDocumentRegion(element: Element) {
  return Boolean(closestAncestor(element.parentElement, "hiddenComment"));
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

function numericAttribute(element: Element | undefined, name: string, fallback = 0) {
  const attribute = element?.getAttribute(name);
  if (attribute === null || attribute === undefined || attribute.trim() === "") return fallback;
  const value = Number(attribute);
  return Number.isFinite(value) ? value : fallback;
}

function signedHwpUnit(value: number) {
  return value > 0x7fffffff ? value - 0x100000000 : value;
}

function alignedOffset(offset: number, objectSize: number, referenceSize: number | undefined, align: string) {
  if (!referenceSize || referenceSize <= 0) return offset;
  switch (align.toUpperCase()) {
    case "CENTER":
      return (referenceSize - objectSize) / 2 + offset;
    case "RIGHT":
    case "BOTTOM":
    case "OUTSIDE":
      return referenceSize - objectSize - offset;
    default:
      return offset;
  }
}

function isPageRelative(value: string) {
  const normalized = value.toUpperCase();
  return normalized === "PAGE" || normalized === "PAPER";
}

function directParagraphText(paragraph: Element, visibleNodes: Set<Text>) {
  return elements(paragraph, "t")
    .filter((textNode) => closestAncestor(textNode, "p") === paragraph)
    .map((textNode) => textFromVisibleNodes(textNode, visibleNodes))
    .join("")
    .replace(/\u0000/g, "");
}

function directRunText(run: Element, visibleNodes: Set<Text>) {
  return elements(run, "t")
    .filter((textNode) => closestAncestor(textNode, "run") === run)
    .map((textNode) => textFromVisibleNodes(textNode, visibleNodes))
    .join("")
    .replace(/\u0000/g, "");
}

function sectionOrder(fileName: string) {
  return Number(fileName.match(/section(\d+)\.xml$/i)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function tableBorderInfo(border: Element | undefined): HwpxTableBorderInfo | undefined {
  if (!border) return undefined;
  return {
    type: border.getAttribute("type") ?? "NONE",
    width: border.getAttribute("width") ?? undefined,
    color: border.getAttribute("color") ?? undefined,
  };
}

export function classifyParagraphRole({
  text,
  averageFontSize,
  majorityFontSize,
  boldRatio,
  inTable = false,
}: {
  text: string;
  averageFontSize?: number;
  majorityFontSize?: number;
  boldRatio: number;
  inTable?: boolean;
}): ParagraphRole {
  const trimmed = text.trim();
  if (inTable || trimmed.length > 40) return "body";
  const startsWithHeadingMarker = /^(?:(?:\d+(?:\.\d+)*|[IVXLCDM]+|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]+)\.|[\(\[\{（]\s*(?:\d+|[IVXLCDM]+|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]+)\s*[\)\]\}）]|(?:\d+|[IVXLCDM]+)[\)）]|[■□●○◆◇▶▷▣※•·▪▫▲△▼▽★☆])\s*/iu.test(trimmed);
  const endsWithSentenceEnding = /[다요함됨][.!?。！？]?$/.test(trimmed);
  const checks = [
    averageFontSize !== undefined && majorityFontSize !== undefined && averageFontSize > majorityFontSize,
    boldRatio >= 0.5,
    startsWithHeadingMarker,
    trimmed.length <= 40,
    !endsWithSentenceEnding,
  ];
  const score = checks.filter(Boolean).length;
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
  const hiddenDeleteChangeIds = new Set(
    elements(header, "trackChange")
      .filter((change) => (
        change.getAttribute("type")?.toUpperCase() === "DELETE"
        && ["1", "true"].includes((change.getAttribute("hide") ?? "").toLowerCase())
      ))
      .map((change) => change.getAttribute("id"))
      .filter((id): id is string => Boolean(id)),
  );
  const manifestFile = archive["Contents/content.hpf"];
  const imageSources = new Map<string, { dataUrl: string }>();
  if (manifestFile) {
    const manifest = parseXml(manifestFile, "Contents/content.hpf");
    elements(manifest, "item").forEach((item) => {
      const id = item.getAttribute("id");
      const path = item.getAttribute("href")?.replace(/^\.\//, "");
      const mimeType = item.getAttribute("media-type") ?? "application/octet-stream";
      const bytes = path ? archive[path] : undefined;
      if (id && bytes && mimeType.startsWith("image/")) {
        imageSources.set(id, { dataUrl: bytesToDataUrl(bytes, mimeType) });
      }
    });
  }
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

  const tableBorderFills = new Map<string, TableBorderFill>();
  elements(header, "borderFill").forEach((borderFill) => {
    const id = borderFill.getAttribute("id");
    if (!id) return;
    const fillBrush = elements(borderFill, "winBrush")[0]
      ?? elements(borderFill, "solidBrush")[0];
    const faceColor = fillBrush?.getAttribute("faceColor")
      ?? fillBrush?.getAttribute("color")
      ?? undefined;
    tableBorderFills.set(id, {
      backgroundColor: faceColor && faceColor.toUpperCase() !== "NONE" ? faceColor : undefined,
      borders: {
        left: tableBorderInfo(elements(borderFill, "leftBorder")[0]),
        right: tableBorderInfo(elements(borderFill, "rightBorder")[0]),
        top: tableBorderInfo(elements(borderFill, "topBorder")[0]),
        bottom: tableBorderInfo(elements(borderFill, "bottomBorder")[0]),
      },
    });
  });

  const paragraphs: string[] = [];
  const documentBlocks: HwpxDocumentBlock[] = [];
  const images: HwpxImageInfo[] = [];
  const imageIds = new Set<string>();
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
    const visibleNodes = visibleTextNodes(section, hiddenDeleteChangeIds);
    const paragraphNodes = elements(section, "p");
    const paragraphIdByElement = new Map<Element, string>();
    const picturesInHiddenDeletions = hiddenTrackedElements(
      section,
      hiddenDeleteChangeIds,
      "pic",
    );
    const pictureNodes = elements(section, "pic").filter((picture) => (
      !picturesInHiddenDeletions.has(picture)
      && !isInsideHiddenDocumentRegion(picture)
      && isInSelectedCompatibilityBranch(picture)
    ));
    const imageIdByPicture = new Map<Element, string>();
    const imageByPicture = new Map<Element, HwpxImageInfo>();
    const pageProperties = elements(section, "pagePr")[0];
    const pageMargin = pageProperties ? elements(pageProperties, "margin")[0] : undefined;
    const pageWidth = numericAttribute(pageProperties, "width", 0) || undefined;
    const pageHeight = numericAttribute(pageProperties, "height", 0) || undefined;
    const marginLeft = numericAttribute(pageMargin, "left", 0);
    const marginRight = numericAttribute(pageMargin, "right", 0);
    const marginTop = numericAttribute(pageMargin, "top", 0);
    const marginBottom = numericAttribute(pageMargin, "bottom", 0);
    const contentWidth = pageWidth ? Math.max(0, pageWidth - marginLeft - marginRight) : undefined;
    const contentHeight = pageHeight ? Math.max(0, pageHeight - marginTop - marginBottom) : undefined;

    pictureNodes.forEach((picture, pictureIndex) => {
      const imageElement = elements(picture, "img")[0];
      const binaryReference = imageElement?.getAttribute("binaryItemIDRef");
      const source = binaryReference ? imageSources.get(binaryReference) : undefined;
      if (!source) return;
      const size = elements(picture, "curSz")[0] ?? elements(picture, "sz")[0];
      const originalSize = elements(picture, "orgSz")[0];
      const clip = elements(picture, "imgClip")[0];
      const position = elements(picture, "pos")[0];
      const width = numericAttribute(size, "width", 0);
      const height = numericAttribute(size, "height", 0);
      const sourceWidth = numericAttribute(originalSize, "width", width);
      const sourceHeight = numericAttribute(originalSize, "height", height);
      const cropLeft = numericAttribute(clip, "left", 0);
      const cropRight = numericAttribute(clip, "right", sourceWidth);
      const cropTop = numericAttribute(clip, "top", 0);
      const cropBottom = numericAttribute(clip, "bottom", sourceHeight);
      const horizontalRelativeTo = position?.getAttribute("horzRelTo") ?? "PARA";
      const verticalRelativeTo = position?.getAttribute("vertRelTo") ?? "PARA";
      const horizontalAlign = position?.getAttribute("horzAlign") ?? "LEFT";
      const verticalAlign = position?.getAttribute("vertAlign") ?? "TOP";
      const horizontalOffset = signedHwpUnit(numericAttribute(position, "horzOffset", 0));
      const verticalOffset = signedHwpUnit(numericAttribute(position, "vertOffset", 0));
      const horizontalReferenceSize = isPageRelative(horizontalRelativeTo) ? pageWidth : contentWidth;
      const verticalReferenceSize = isPageRelative(verticalRelativeTo) ? pageHeight : contentHeight;
      const resolvedHorizontalOffset = alignedOffset(
        horizontalOffset,
        width,
        horizontalReferenceSize,
        horizontalAlign,
      );
      const resolvedVerticalOffset = alignedOffset(
        verticalOffset,
        height,
        verticalReferenceSize,
        verticalAlign,
      );
      const explicitlyHidden = ["0", "false"].includes((picture.getAttribute("visible") ?? "").toLowerCase());
      const invalidSize = width <= 0 || height <= 0;
      const emptyCrop = cropRight <= cropLeft || cropBottom <= cropTop;
      const outsideHorizontalPage = isPageRelative(horizontalRelativeTo) && Boolean(pageWidth)
        && (resolvedHorizontalOffset + width <= 0 || resolvedHorizontalOffset >= (pageWidth ?? 0));
      const outsideVerticalPage = isPageRelative(verticalRelativeTo) && Boolean(pageHeight)
        && (resolvedVerticalOffset + height <= 0 || resolvedVerticalOffset >= (pageHeight ?? 0));
      const imageId = `${fileName}:image:${pictureIndex}`;
      imageIdByPicture.set(picture, imageId);
      if (!imageIds.has(imageId)) {
        imageIds.add(imageId);
        const image: HwpxImageInfo = {
          id: imageId,
          dataUrl: source.dataUrl,
          width: width > 0 ? width : undefined,
          height: height > 0 ? height : undefined,
          sourceWidth: sourceWidth > 0 ? sourceWidth : undefined,
          sourceHeight: sourceHeight > 0 ? sourceHeight : undefined,
          crop: {
            left: cropLeft,
            right: cropRight,
            top: cropTop,
            bottom: cropBottom,
          },
          placement: {
            inTable: Boolean(closestAncestor(picture, "tbl")),
            treatAsCharacter: picture.getAttribute("treatAsChar") === "1",
            textWrap: picture.getAttribute("textWrap") ?? "TOP_AND_BOTTOM",
            zOrder: numericAttribute(picture, "zOrder", 0),
            horizontalRelativeTo,
            verticalRelativeTo,
            horizontalAlign,
            verticalAlign,
            horizontalOffset: resolvedHorizontalOffset,
            verticalOffset: resolvedVerticalOffset,
            pageWidth,
            pageHeight,
            contentWidth,
            contentHeight,
            marginLeft,
            marginTop,
            definitelyHidden: explicitlyHidden || invalidSize || emptyCrop || outsideHorizontalPage || outsideVerticalPage,
          },
        };
        images.push(image);
        imageByPicture.set(picture, image);
      }
    });

    paragraphNodes.forEach((paragraph, paragraphIndex) => {
      const text = directParagraphText(paragraph, visibleNodes).trimEnd();
      if (!text.trim()) return;
      const paragraphId = `${fileName}:${paragraphIndex}`;
      paragraphIdByElement.set(paragraph, paragraphId);
      paragraphs.push(text);

      const paragraphStyle = paragraphStyles.get(paragraph.getAttribute("paraPrIDRef") ?? "");
      addCount(alignmentCounts, paragraphStyle?.alignment);
      addCount(lineSpacingCounts, paragraphStyle?.lineSpacing);
      addCount(indentationCounts, paragraphStyle?.indentation);

      let styledCharacterCount = 0;
      let boldCharacterCount = 0;
      let weightedFontSize = 0;
      let fontSizeCharacterCount = 0;
      const paragraphFontCounts = new Map<string, number>();

      elements(paragraph, "run")
        .filter((run) => closestAncestor(run, "p") === paragraph)
        .forEach((run) => {
          const length = directRunText(run, visibleNodes).replace(/\s/g, "").length;
          if (length === 0) return;
          const style = characterStyles.get(run.getAttribute("charPrIDRef") ?? "");
          addCount(fontCounts, style?.fontName, length);
          addCount(paragraphFontCounts, style?.fontName, length);
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
        id: paragraphId,
        text,
        sectionFile: fileName,
        paragraphIndex,
        styleName: styleNames.get(paragraph.getAttribute("styleIDRef") ?? ""),
        inTable: Boolean(closestAncestor(paragraph, "tc") || closestAncestor(paragraph, "tbl")),
        averageFontSize: fontSizeCharacterCount > 0
          ? weightedFontSize / fontSizeCharacterCount
          : undefined,
        boldRatio: styledCharacterCount > 0 ? boldCharacterCount / styledCharacterCount : 0,
        format: {
          font: sortedCounts(paragraphFontCounts)[0]?.label,
          fontSize: fontSizeCharacterCount > 0 ? weightedFontSize / fontSizeCharacterCount : undefined,
          lineSpacing: Number.parseFloat(paragraphStyle?.lineSpacing ?? ""),
          alignment: paragraphStyle?.alignment,
          indentation: Number.parseFloat(paragraphStyle?.indentation ?? ""),
          bold: styledCharacterCount > 0 && boldCharacterCount / styledCharacterCount >= 0.5,
        },
      });
    });

    pictureNodes.forEach((picture) => {
      const image = imageByPicture.get(picture);
      const anchorParagraph = closestAncestor(picture, "p");
      if (image && anchorParagraph) {
        image.placement.anchorParagraphId = paragraphIdByElement.get(anchorParagraph);
      }
    });

    const handledTables = new Set<Element>();
    const addTableBlock = (table: Element, tableIndex: number) => {
      if (handledTables.has(table)) return;
      handledTables.add(table);
      const tableBorderFill = tableBorderFills.get(table.getAttribute("borderFillIDRef") ?? "");
      const rowNodes = elements(table, "tr")
        .filter((row) => closestAncestor(row, "tbl") === table);
      const rows = rowNodes.map((row, rowIndex) => elements(row, "tc")
        .filter((cell) => closestAncestor(cell, "tr") === row && closestAncestor(cell, "tbl") === table)
        .map((cell, cellIndex) => {
          const cellAddress = elements(cell, "cellAddr")[0];
          const cellSpan = elements(cell, "cellSpan")[0];
          const cellBorderFill = tableBorderFills.get(cell.getAttribute("borderFillIDRef") ?? "")
            ?? tableBorderFill;
          const paragraphIds = paragraphNodes
            .filter((paragraph) => (
              closestAncestor(paragraph, "tc") === cell
              && closestAncestor(paragraph, "tbl") === table
            ))
            .map((paragraph) => paragraphIdByElement.get(paragraph))
            .filter((id): id is string => Boolean(id));
          const cellImageIds = pictureNodes
            .filter((picture) => closestAncestor(picture, "tc") === cell && closestAncestor(picture, "tbl") === table)
            .map((picture) => imageIdByPicture.get(picture))
            .filter((id): id is string => Boolean(id));

          return {
            id: `${fileName}:table:${tableIndex}:cell:${rowIndex}:${cellIndex}`,
            column: Number(cellAddress?.getAttribute("colAddr") ?? cellIndex),
            row: Number(cellAddress?.getAttribute("rowAddr") ?? rowIndex),
            columnSpan: Math.max(1, Number(cellSpan?.getAttribute("colSpan") ?? 1)),
            rowSpan: Math.max(1, Number(cellSpan?.getAttribute("rowSpan") ?? 1)),
            paragraphIds,
            imageIds: cellImageIds,
            backgroundColor: cellBorderFill?.backgroundColor,
            borders: cellBorderFill?.borders ?? {},
          } satisfies HwpxTableCellInfo;
        }));

      documentBlocks.push({
        type: "table",
        id: `${fileName}:table:${tableIndex}`,
        rowCount: Math.max(rowNodes.length, Number(table.getAttribute("rowCnt") ?? 0)),
        columnCount: Math.max(1, Number(table.getAttribute("colCnt") ?? 1)),
        rows,
      });
    };

    const tableNodes = elements(section, "tbl");
    paragraphNodes
      .filter((paragraph) => !closestAncestor(paragraph, "tbl"))
      .forEach((paragraph) => {
        const paragraphId = paragraphIdByElement.get(paragraph);
        if (paragraphId) {
          documentBlocks.push({ type: "paragraph", id: paragraphId, paragraphId });
        }

        elements(paragraph, "tbl")
          .filter((table) => closestAncestor(table.parentElement, "tbl") === null)
          .forEach((table) => addTableBlock(table, tableNodes.indexOf(table)));

        pictureNodes
          .filter((picture) => closestAncestor(picture, "p") === paragraph && !closestAncestor(picture, "tbl"))
          .forEach((picture, pictureIndex) => {
            const imageId = imageIdByPicture.get(picture);
            if (imageId) documentBlocks.push({ type: "image", id: `${imageId}:block:${pictureIndex}`, imageId });
          });
      });

    tableNodes
      .filter((table) => closestAncestor(table.parentElement, "tbl") === null)
      .forEach((table, tableIndex) => addTableBlock(table, tableIndex));
  });

  const extractedText = paragraphs.join("\n");
  const previewText = archive["Preview/PrvText.txt"]
    ? decoder(archive["Preview/PrvText.txt"]).trim()
    : "";
  const text = extractedText || previewText;

  if (!text) {
    throw new Error("문서에서 표시할 텍스트를 찾지 못했습니다.");
  }

  const sortedFontSizes = sortedCounts(fontSizeCounts);
  const countedFontSizeCharacters = sortedFontSizes.reduce((total, item) => total + item.count, 0);
  const majorityFontSizeEntry = sortedFontSizes[0];
  const majorityFontSize = majorityFontSizeEntry && majorityFontSizeEntry.count / Math.max(1, countedFontSizeCharacters) >= 0.5
    ? Number.parseFloat(majorityFontSizeEntry.label)
    : undefined;
  const paragraphDetails: HwpxParagraphInfo[] = pendingParagraphDetails.map((paragraph) => ({
    id: paragraph.id,
    text: paragraph.text,
    sectionFile: paragraph.sectionFile,
    paragraphIndex: paragraph.paragraphIndex,
    styleName: paragraph.styleName,
    inTable: paragraph.inTable,
    format: paragraph.format,
    suggestedRole: classifyParagraphRole({
      text: paragraph.text,
      averageFontSize: paragraph.averageFontSize,
      majorityFontSize: Number.isFinite(majorityFontSize) ? majorityFontSize : undefined,
      boldRatio: paragraph.boldRatio,
      inTable: paragraph.inTable,
    }),
  }));

  return {
    text,
    paragraphs,
    paragraphDetails,
    documentBlocks,
    images,
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
  presets: Record<string, ParagraphStylePreset>,
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
  const fontIdsByPreset = new Map<string, Map<string, string>>();

  Object.keys(presets).forEach((role) => {
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

  const characterPropertyFor = (sourceId: string, role: string) => {
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

  const paragraphPropertyFor = (sourceId: string, role: string) => {
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
      if (!role || !presets[role]) return;
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
