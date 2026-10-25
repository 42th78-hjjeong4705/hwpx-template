"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  FileText,
  FolderOpen,
  LoaderCircle,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  analyzeHwpx,
  formatHwpxByParagraphStyles,
  type HwpxAnalysis,
  type HwpxFormatSettings,
  type ParagraphStyleAssignments,
  type ParagraphStylePreset,
} from "@/lib/hwpx-parser";

type WorkflowStep = "upload" | "format" | "result";

type StyleSettings = {
  font: string;
  fontSize: string;
  lineSpacing: string;
  alignment: string;
  indentation: string;
  bold: boolean;
};

type DocumentStyle = {
  id: string;
  name: string;
  colorIndex: number;
  settings: StyleSettings;
};

const initialStyles: DocumentStyle[] = [
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

const stylePalette = [
  { dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700", border: "border-blue-500", selected: "bg-blue-50/80 ring-blue-300" },
  { dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700", border: "border-emerald-500", selected: "bg-emerald-50/80 ring-emerald-300" },
  { dot: "bg-violet-500", badge: "bg-violet-50 text-violet-700", border: "border-violet-500", selected: "bg-violet-50/80 ring-violet-300" },
  { dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700", border: "border-amber-500", selected: "bg-amber-50/80 ring-amber-300" },
  { dot: "bg-rose-500", badge: "bg-rose-50 text-rose-700", border: "border-rose-500", selected: "bg-rose-50/80 ring-rose-300" },
  { dot: "bg-cyan-500", badge: "bg-cyan-50 text-cyan-700", border: "border-cyan-500", selected: "bg-cyan-50/80 ring-cyan-300" },
];

const selectOptions = {
  font: ["본고딕", "맑은 고딕", "함초롬돋움", "함초롬바탕", "나눔명조"],
  fontSize: ["9", "10", "11", "12", "14", "16", "18", "20"],
  lineSpacing: ["130", "150", "160", "180", "200"],
  indentation: ["0", "5", "10", "15", "20"],
};

const alignmentLabels: Record<string, string> = {
  LEFT: "왼쪽",
  CENTER: "가운데",
  RIGHT: "오른쪽",
  JUSTIFY: "양쪽",
  DISTRIBUTE: "배분",
};

function SettingSelect({ label, value, options, suffix, onValueChange }: {
  label: string;
  value: string;
  options: string[];
  suffix?: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-10 w-full rounded-xl border-slate-200 bg-white px-3 shadow-none"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option} value={option}>{option}{suffix}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function WorkflowPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WorkflowStep>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<HwpxAnalysis | null>(null);
  const [originalBuffer, setOriginalBuffer] = useState<ArrayBuffer | null>(null);
  const [convertedFile, setConvertedFile] = useState<{ bytes: Uint8Array<ArrayBuffer>; analysis: HwpxAnalysis; fileName: string } | null>(null);
  const [styles, setStyles] = useState<DocumentStyle[]>(initialStyles);
  const [activeStyleId, setActiveStyleId] = useState("style-1");
  const [paragraphAssignments, setParagraphAssignments] = useState<ParagraphStyleAssignments>({});
  const [selectedParagraphId, setSelectedParagraphId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const activeStyle = styles.find((style) => style.id === activeStyleId) ?? styles[0];
  const selectedParagraph = analysis?.paragraphDetails.find((paragraph) => paragraph.id === selectedParagraphId);
  const selectedParagraphStyleId = selectedParagraphId ? paragraphAssignments[selectedParagraphId] : undefined;
  const styleCounts = styles.reduce<Record<string, number>>((counts, style) => {
    counts[style.id] = Object.values(paragraphAssignments).filter((styleId) => styleId === style.id).length;
    return counts;
  }, {});

  const clearConvertedResult = () => { setConvertedFile(null); setApplyError(null); };

  const updateStyleSettings = (key: keyof StyleSettings, value: string | boolean) => {
    setStyles((current) => current.map((style) => style.id === activeStyleId
      ? { ...style, settings: { ...style.settings, [key]: value } }
      : style));
    clearConvertedResult();
  };

  const updateStyleName = (name: string) => {
    setStyles((current) => current.map((style) => style.id === activeStyleId ? { ...style, name } : style));
    clearConvertedResult();
  };

  const assignSelectedParagraph = (styleId: string) => {
    if (!selectedParagraphId) return;
    setParagraphAssignments((current) => ({ ...current, [selectedParagraphId]: styleId }));
    setActiveStyleId(styleId);
    clearConvertedResult();
  };

  const addStyle = () => {
    const nextNumber = Math.max(0, ...styles.map((style) => Number(style.id.match(/\d+$/)?.[0] ?? 0))) + 1;
    const newStyle: DocumentStyle = {
      id: `style-${nextNumber}`,
      name: `스타일 ${nextNumber}`,
      colorIndex: (nextNumber - 1) % stylePalette.length,
      settings: { ...activeStyle.settings },
    };
    setStyles((current) => [...current, newStyle]);
    setActiveStyleId(newStyle.id);
    clearConvertedResult();
  };

  const removeActiveStyle = () => {
    if (styles.length <= 2 || !activeStyle) return;
    const fallbackStyleId = styles.find((style) => style.id !== activeStyle.id)?.id ?? "style-1";
    setStyles((current) => current.filter((style) => style.id !== activeStyle.id));
    setParagraphAssignments((current) => Object.fromEntries(Object.entries(current).map(([paragraphId, styleId]) => [
      paragraphId,
      styleId === activeStyle.id ? fallbackStyleId : styleId,
    ])));
    setActiveStyleId(fallbackStyleId);
    clearConvertedResult();
  };

  const resetAutomaticAssignments = () => {
    if (!analysis) return;
    setParagraphAssignments(Object.fromEntries(analysis.paragraphDetails.map((paragraph) => [
      paragraph.id,
      paragraph.suggestedRole === "heading" ? "style-1" : "style-2",
    ])));
    clearConvertedResult();
  };

  const acceptFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".hwpx")) { setFileError("HWPX 파일만 선택할 수 있어요."); return; }
    setFileName(file.name);
    setFileSize(`${(file.size / 1024 / 1024).toFixed(2)} MB`);
    setFileError(null);
    setAnalysis(null);
    setOriginalBuffer(null);
    setConvertedFile(null);
    setStyles(initialStyles);
    setActiveStyleId("style-1");
    setParagraphAssignments({});
    setSelectedParagraphId(null);
    setAnalyzing(true);
    try {
      const buffer = await file.arrayBuffer();
      const result = await analyzeHwpx(buffer);
      setOriginalBuffer(buffer);
      setAnalysis(result);
      setParagraphAssignments(Object.fromEntries(result.paragraphDetails.map((paragraph) => [
        paragraph.id,
        paragraph.suggestedRole === "heading" ? "style-1" : "style-2",
      ])));
      setSelectedParagraphId(result.paragraphDetails[0]?.id ?? null);
      setStep("format");
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "HWPX 문서를 분석하는 중 오류가 발생했습니다.");
    } finally { setAnalyzing(false); }
  };

  const applyFormatting = async () => {
    if (!originalBuffer || !analysis || !fileName) return;
    setApplying(true);
    setApplyError(null);
    try {
      const alignmentMap: Record<string, HwpxFormatSettings["alignment"]> = { 왼쪽: "LEFT", 가운데: "CENTER", 오른쪽: "RIGHT", 양쪽: "JUSTIFY" };
      const presets = Object.fromEntries(styles.map((style) => {
        const preset: ParagraphStylePreset = {
          font: style.settings.font,
          fontSize: Number(style.settings.fontSize),
          lineSpacing: Number(style.settings.lineSpacing),
          alignment: alignmentMap[style.settings.alignment],
          indentation: Number(style.settings.indentation),
          bold: style.settings.bold,
        };
        return [style.id, preset];
      }));
      const bytes = formatHwpxByParagraphStyles(originalBuffer, presets, paragraphAssignments);
      const result = await analyzeHwpx(bytes.slice().buffer);
      setConvertedFile({ bytes, analysis: result, fileName: `${fileName.replace(/\.hwpx$/i, "")}_서식변경.hwpx` });
      setStep("result");
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "서식을 변경하는 중 오류가 발생했습니다.");
    } finally { setApplying(false); }
  };

  const downloadConvertedFile = () => {
    if (!convertedFile) return;
    const url = URL.createObjectURL(new Blob([convertedFile.bytes], { type: "application/hwp+zip" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = convertedFile.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const resetAll = () => {
    setStep("upload"); setFileName(null); setFileSize(null); setFileError(null); setAnalysis(null);
    setOriginalBuffer(null); setConvertedFile(null); setStyles(initialStyles); setActiveStyleId("style-1");
    setParagraphAssignments({}); setSelectedParagraphId(null); setApplyError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const stepIndex = step === "upload" ? 0 : step === "format" ? 1 : 2;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_#dbeafe_0,_transparent_28%),linear-gradient(#f8fafc,#eef4fb)] text-slate-950">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-blue-600 text-white"><FileText className="size-5" /></div>
            <div><p className="text-base font-extrabold">HWPX 서식 변환</p><p className="text-xs text-slate-500">문단을 보면서 스타일로 간편하게</p></div>
          </div>
          <ol className="flex items-center gap-2 text-xs font-bold text-slate-500" aria-label="작업 단계">
            {["파일 선택", "스타일 지정", "다운로드"].map((label, index) => (
              <li key={label} className="flex items-center gap-2">
                <span className={`grid size-7 place-items-center rounded-full ${index <= stepIndex ? "bg-blue-600 text-white" : "bg-white ring-1 ring-slate-200"}`}>{index + 1}</span>
                <span className="hidden sm:inline">{label}</span>{index < 2 && <ChevronRight className="size-3 text-slate-300" />}
              </li>
            ))}
          </ol>
        </div>
      </header>

      {step === "upload" && (
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-4xl place-items-center px-5 py-12">
          <section className="w-full text-center">
            <p className="text-sm font-bold text-blue-600">1 / 3 · 파일 선택</p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.045em] sm:text-4xl">서식을 바꿀 문서를 선택하세요</h1>
            <p className="mx-auto mt-3 max-w-2xl leading-7 text-slate-600">다음 화면에서 실제 문단 내용을 보며 스타일을 직접 지정할 수 있습니다.</p>
            <div
              className={`mt-8 rounded-3xl border-2 border-dashed bg-white p-10 transition ${dragging ? "border-blue-500 bg-blue-50" : "border-blue-200"}`}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
              onDrop={(event) => { event.preventDefault(); setDragging(false); void acceptFile(event.dataTransfer.files[0]); }}
            >
              <input ref={fileInputRef} type="file" accept=".hwpx,application/octet-stream" className="sr-only" aria-label="HWPX 파일 선택" onChange={(event) => void acceptFile(event.target.files?.[0])} />
              <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">{analyzing ? <LoaderCircle className="size-7 animate-spin" /> : <UploadCloud className="size-7" />}</div>
              <h2 className="mt-5 text-xl font-extrabold">{analyzing ? "문서 XML 분석 중" : "HWPX 파일을 끌어 놓으세요"}</h2>
              <p className={`mt-2 text-sm ${fileError ? "font-semibold text-red-600" : "text-slate-500"}`}>{fileError ?? "파일은 브라우저 안에서만 처리되며 서버로 전송되지 않습니다."}</p>
              <Button type="button" size="lg" className="mt-6 rounded-xl bg-blue-600 px-6" disabled={analyzing} onClick={() => fileInputRef.current?.click()}><FolderOpen className="size-4" /> 파일 선택</Button>
            </div>
          </section>
        </div>
      )}

      {step === "format" && analysis && (
        <div className="mx-auto max-w-7xl px-5 py-7 lg:px-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-sm font-bold text-blue-600">2 / 3 · 스타일 지정</p><h1 className="mt-1 text-2xl font-black">문단을 클릭하고 스타일을 지정하세요</h1><p className="mt-1 text-sm text-slate-500">자동 분류가 적용돼 있습니다. 틀린 문단만 바로잡으면 됩니다.</p></div>
            <div className="flex gap-2"><Button type="button" variant="outline" className="rounded-xl" onClick={resetAll}><ArrowLeft className="size-4" /> 다른 파일</Button><Button type="button" variant="outline" className="rounded-xl" onClick={resetAutomaticAssignments}><RotateCcw className="size-4" /> 자동 분류 복원</Button></div>
          </div>

          <div className="grid min-h-[42rem] gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <Card className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><CardTitle className="text-lg">문서 미리보기</CardTitle><CardDescription>{fileName} · {fileSize}</CardDescription></div>
                  <div className="flex gap-2 text-xs font-bold"><span className="rounded-full bg-slate-100 px-3 py-1.5">{analysis.styles.sectionCount}구역</span><span className="rounded-full bg-slate-100 px-3 py-1.5">{analysis.styles.paragraphCount}문단</span><span className="rounded-full bg-slate-100 px-3 py-1.5">{analysis.styles.characterCount.toLocaleString()}자</span></div>
                </div>
              </CardHeader>
              <CardContent className="max-h-[calc(100vh-16rem)] min-h-[36rem] overflow-y-auto bg-slate-100 p-5">
                <div className="mx-auto max-w-3xl space-y-2 rounded-sm bg-white p-6 shadow-[0_8px_35px_rgba(15,23,42,0.12)] sm:p-10">
                  {analysis.paragraphDetails.map((paragraph, index) => {
                    const styleId = paragraphAssignments[paragraph.id] ?? "style-2";
                    const paragraphStyle = styles.find((style) => style.id === styleId) ?? styles[0];
                    const color = stylePalette[paragraphStyle.colorIndex % stylePalette.length];
                    const selected = selectedParagraphId === paragraph.id;
                    const textAlign = paragraphStyle.settings.alignment === "가운데" ? "center" : paragraphStyle.settings.alignment === "오른쪽" ? "right" : paragraphStyle.settings.alignment === "양쪽" ? "justify" : "left";
                    return (
                      <button key={paragraph.id} type="button" onClick={() => setSelectedParagraphId(paragraph.id)} className={`group relative w-full rounded-xl border-l-4 px-4 py-3 text-left ring-1 transition ${color.border} ${selected ? `${color.selected} ring-2` : "bg-white ring-transparent hover:bg-slate-50 hover:ring-slate-200"}`}>
                        <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold opacity-80 ${color.badge}`}>{paragraphStyle.name}</span>
                        <span className="mr-2 text-[10px] font-bold text-slate-300">{index + 1}</span>
                        <span className="whitespace-pre-wrap pr-20 text-slate-800" style={{ fontFamily: paragraphStyle.settings.font, fontSize: `${Math.max(12, Math.min(18, Number(paragraphStyle.settings.fontSize)))}px`, fontWeight: paragraphStyle.settings.bold ? 700 : 400, textAlign }}>{paragraph.text}</span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-1">
              <Card className="rounded-3xl border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-4"><CardTitle className="text-lg">선택 문단에 스타일 지정</CardTitle><CardDescription>{selectedParagraph ? selectedParagraph.text.slice(0, 58) : "왼쪽에서 문단을 선택하세요."}</CardDescription></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {styles.map((style) => {
                    const color = stylePalette[style.colorIndex % stylePalette.length];
                    const assigned = selectedParagraphStyleId === style.id;
                    return <button key={style.id} type="button" disabled={!selectedParagraph} onClick={() => assignSelectedParagraph(style.id)} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${assigned ? `${color.badge} ring-2 ring-current` : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}><span className={`size-2 rounded-full ${color.dot}`} />{style.name}</button>;
                  })}
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between gap-3"><div><CardTitle className="text-lg">스타일 관리</CardTitle><CardDescription>스타일을 편집하거나 새로 추가하세요.</CardDescription></div><Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={addStyle}><Plus className="size-4" /> 추가</Button></div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    {styles.map((style) => {
                      const color = stylePalette[style.colorIndex % stylePalette.length];
                      return <button key={style.id} type="button" onClick={() => setActiveStyleId(style.id)} className={`rounded-xl border p-3 text-left transition ${activeStyleId === style.id ? `${color.badge} border-current` : "border-slate-200 hover:bg-slate-50"}`}><span className="flex items-center gap-2 text-xs font-extrabold"><span className={`size-2 rounded-full ${color.dot}`} />{style.name}</span><span className="mt-1 block text-[11px] text-slate-500">{styleCounts[style.id] ?? 0}개 문단</span></button>;
                    })}
                  </div>
                  {activeStyle && (
                    <div className="space-y-4 border-t border-slate-100 pt-4">
                      <div className="flex gap-2"><input value={activeStyle.name} onChange={(event) => updateStyleName(event.target.value)} aria-label="스타일 이름" className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-500" />{styles.length > 2 && <Button type="button" variant="outline" size="icon" className="rounded-xl text-red-600" onClick={removeActiveStyle} aria-label="현재 스타일 삭제"><Trash2 className="size-4" /></Button>}</div>
                      <div className="grid grid-cols-2 gap-3">
                        <SettingSelect label="글꼴" value={activeStyle.settings.font} options={selectOptions.font} onValueChange={(value) => updateStyleSettings("font", value)} />
                        <SettingSelect label="글자 크기" value={activeStyle.settings.fontSize} options={selectOptions.fontSize} suffix="pt" onValueChange={(value) => updateStyleSettings("fontSize", value)} />
                        <SettingSelect label="줄 간격" value={activeStyle.settings.lineSpacing} options={selectOptions.lineSpacing} suffix="%" onValueChange={(value) => updateStyleSettings("lineSpacing", value)} />
                        <SettingSelect label="들여쓰기" value={activeStyle.settings.indentation} options={selectOptions.indentation} suffix="pt" onValueChange={(value) => updateStyleSettings("indentation", value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">{[false, true].map((bold) => <button key={String(bold)} type="button" onClick={() => updateStyleSettings("bold", bold)} className={`h-9 rounded-lg text-xs font-bold ${activeStyle.settings.bold === bold ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{bold ? "굵게" : "보통"}</button>)}</div>
                      <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">{[["왼쪽", AlignLeft], ["가운데", AlignCenter], ["오른쪽", AlignRight], ["양쪽", AlignJustify]].map(([label, Icon]) => <button key={label as string} type="button" title={label as string} onClick={() => updateStyleSettings("alignment", label as string)} className={`grid h-9 place-items-center rounded-lg ${activeStyle.settings.alignment === label ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}><Icon className="size-4" /></button>)}</div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">원본 문서 분석</CardTitle>
                  <CardDescription>XML에서 읽은 서식 정보입니다. 자동 분류의 참고 자료로 사용됩니다.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    ["주요 글꼴", analysis.styles.fonts.slice(0, 3)],
                    ["글자 크기", analysis.styles.fontSizes.slice(0, 3)],
                    ["문단 정렬", analysis.styles.alignments.slice(0, 3).map((item) => ({ ...item, label: alignmentLabels[item.label] ?? item.label }))],
                    ["줄 간격", analysis.styles.lineSpacings.slice(0, 3)],
                    ["들여쓰기", analysis.styles.indentations.slice(0, 3)],
                  ].map(([title, items]) => (
                    <div key={title as string} className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs font-extrabold text-slate-700">{title as string}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(items as Array<{ label: string; count: number }>).length > 0
                          ? (items as Array<{ label: string; count: number }>).map((item) => (
                              <span key={item.label} className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                                {item.label} · {item.count}
                              </span>
                            ))
                          : <span className="text-[11px] text-slate-400">감지된 정보 없음</span>}
                      </div>
                    </div>
                  ))}
                  <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">
                    굵게 서식이 적용된 글자 {analysis.styles.boldCharacters.toLocaleString()}자를 감지했습니다.
                  </p>
                </CardContent>
              </Card>
              {applyError && <div className="flex gap-2 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700"><AlertCircle className="size-4 shrink-0" />{applyError}</div>}
              <Button type="button" size="lg" className="h-12 w-full rounded-2xl bg-blue-600 text-base" disabled={applying} onClick={applyFormatting}>{applying ? <LoaderCircle className="size-5 animate-spin" /> : <Sparkles className="size-5" />}{applying ? "문단별 스타일 적용 중" : "스타일 적용하고 결과 보기"}</Button>
            </div>
          </div>
        </div>
      )}

      {step === "result" && convertedFile && (
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-4xl place-items-center px-5 py-12">
          <section className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-[0_24px_70px_-40px_rgba(15,23,42,0.4)] sm:p-12">
            <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><Check className="size-8" /></div>
            <p className="mt-6 text-sm font-bold text-emerald-600">3 / 3 · 변환 완료</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">문단별 스타일 적용이 끝났습니다</h1>
            <p className="mt-3 text-slate-500">{convertedFile.fileName}</p>
            <div className="mx-auto mt-7 grid max-w-xl grid-cols-3 gap-3"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-2xl font-black">{convertedFile.analysis.styles.paragraphCount}</p><p className="mt-1 text-xs text-slate-500">적용 문단</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-2xl font-black">{styles.length}</p><p className="mt-1 text-xs text-slate-500">사용 스타일</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-2xl font-black">{convertedFile.analysis.styles.characterCount.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">문서 글자</p></div></div>
            <Button type="button" size="lg" className="mt-8 h-12 rounded-xl bg-blue-600 px-8" onClick={downloadConvertedFile}><Download className="size-5" /> HWPX 다운로드</Button>
            <div className="mt-5 flex flex-wrap justify-center gap-2"><Button type="button" variant="ghost" className="rounded-xl" onClick={() => setStep("format")}><ArrowLeft className="size-4" /> 스타일 다시 수정</Button><Button type="button" variant="ghost" className="rounded-xl" onClick={resetAll}><RotateCcw className="size-4" /> 새 문서 변환</Button></div>
          </section>
        </div>
      )}
    </main>
  );
}
