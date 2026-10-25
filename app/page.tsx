"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Check,
  ChevronRight,
  Download,
  FileText,
  FolderOpen,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  analyzeHwpx,
  formatHwpxByParagraphStyles,
  type HwpxAnalysis,
  type HwpxFormatSettings,
  type ParagraphRole,
  type ParagraphStyleAssignments,
  type ParagraphStylePreset,
} from "@/lib/hwpx-parser";

const initialStyleSettings = {
  heading: {
    font: "본고딕",
    fontSize: "14",
    lineSpacing: "160",
    alignment: "왼쪽",
    indentation: "0",
    bold: true,
  },
  body: {
    font: "함초롬바탕",
    fontSize: "11",
    lineSpacing: "160",
    alignment: "양쪽",
    indentation: "0",
    bold: false,
  },
};

type StyleSettings = (typeof initialStyleSettings)[ParagraphRole];

const selectOptions = {
  font: ["본고딕", "맑은 고딕", "함초롬돋움", "함초롬바탕", "나눔명조"],
  fontSize: ["9", "10", "11", "12", "14", "16"],
  lineSpacing: ["130", "150", "160", "180", "200"],
  indentation: ["0", "5", "10", "15", "20"],
};

function SettingSelect({
  label,
  value,
  options,
  suffix,
  onValueChange,
}: {
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
        <SelectTrigger className="h-11 w-full rounded-xl border-slate-200 bg-white px-4 shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
              {suffix}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<HwpxAnalysis | null>(null);
  const [originalBuffer, setOriginalBuffer] = useState<ArrayBuffer | null>(null);
  const [convertedFile, setConvertedFile] = useState<{
    bytes: Uint8Array<ArrayBuffer>;
    analysis: HwpxAnalysis;
    fileName: string;
  } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [styleSettings, setStyleSettings] = useState(initialStyleSettings);
  const [activeStyle, setActiveStyle] = useState<ParagraphRole>("heading");
  const [paragraphAssignments, setParagraphAssignments] = useState<ParagraphStyleAssignments>({});

  const updateStyle = (key: keyof StyleSettings, value: string | boolean) => {
    setStyleSettings((current) => ({
      ...current,
      [activeStyle]: { ...current[activeStyle], [key]: value },
    }));
    setConvertedFile(null);
    setApplyError(null);
  };

  const acceptFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".hwpx")) {
      setFileError("HWPX 파일만 선택할 수 있어요.");
      setAnalysis(null);
      setOriginalBuffer(null);
      setConvertedFile(null);
      setParagraphAssignments({});
      return;
    }
    setFileName(file.name);
    setFileSize(`${(file.size / 1024 / 1024).toFixed(2)} MB`);
    setFileError(null);
    setAnalysis(null);
    setOriginalBuffer(null);
    setConvertedFile(null);
    setParagraphAssignments({});
    setApplyError(null);
    setAnalyzing(true);
    try {
      const buffer = await file.arrayBuffer();
      setOriginalBuffer(buffer);
      const result = await analyzeHwpx(buffer);
      setAnalysis(result);
      setParagraphAssignments(
        Object.fromEntries(result.paragraphDetails.map((paragraph) => [paragraph.id, paragraph.suggestedRole])),
      );
    } catch (error) {
      setFileError(
        error instanceof Error ? error.message : "HWPX 문서를 분석하는 중 오류가 발생했습니다.",
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const resetAll = () => {
    setStyleSettings(initialStyleSettings);
    setActiveStyle("heading");
    setParagraphAssignments({});
    setFileName(null);
    setFileSize(null);
    setFileError(null);
    setAnalysis(null);
    setOriginalBuffer(null);
    setConvertedFile(null);
    setAnalyzing(false);
    setApplying(false);
    setApplyError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const applyFormatting = async () => {
    if (!originalBuffer || !analysis || !fileName) return;
    setApplying(true);
    setApplyError(null);
    try {
      const alignmentMap: Record<string, HwpxFormatSettings["alignment"]> = {
        왼쪽: "LEFT",
        가운데: "CENTER",
        오른쪽: "RIGHT",
        양쪽: "JUSTIFY",
      };
      const presets = Object.fromEntries(
        (["heading", "body"] as const).map((role) => {
          const style = styleSettings[role];
          const preset: ParagraphStylePreset = {
            font: style.font,
            fontSize: Number(style.fontSize),
            lineSpacing: Number(style.lineSpacing),
            alignment: alignmentMap[style.alignment],
            indentation: Number(style.indentation),
            bold: style.bold,
          };
          return [role, preset];
        }),
      ) as Record<ParagraphRole, ParagraphStylePreset>;
      const bytes = formatHwpxByParagraphStyles(originalBuffer, presets, paragraphAssignments);
      const convertedBuffer = bytes.slice().buffer;
      const convertedAnalysis = await analyzeHwpx(convertedBuffer);
      setConvertedFile({
        bytes,
        analysis: convertedAnalysis,
        fileName: `${fileName.replace(/\.hwpx$/i, "")}_서식변경.hwpx`,
      });
    } catch (error) {
      setApplyError(
        error instanceof Error ? error.message : "서식을 변경하는 중 오류가 발생했습니다.",
      );
    } finally {
      setApplying(false);
    }
  };

  const updateParagraphRole = (id: string, role: ParagraphRole) => {
    setParagraphAssignments((current) => ({ ...current, [id]: role }));
    setConvertedFile(null);
    setApplyError(null);
  };

  const downloadConvertedFile = () => {
    if (!convertedFile) return;
    const url = URL.createObjectURL(
      new Blob([convertedFile.bytes], { type: "application/hwp+zip" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = convertedFile.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const alignmentLabels: Record<string, string> = {
    LEFT: "왼쪽",
    CENTER: "가운데",
    RIGHT: "오른쪽",
    JUSTIFY: "양쪽",
    DISTRIBUTE: "배분",
  };

  const analysisStatus = analyzing
    ? "문서 내부 XML을 분석하고 있어요."
    : analysis
      ? `XML 분석 완료 · ${analysis.styles.paragraphCount.toLocaleString()}개 문단 · ${analysis.styles.characterCount.toLocaleString()}자`
      : fileName
        ? `${fileSize} · 파일 선택 완료`
        : "파일을 이곳에 끌어 놓거나 직접 선택하세요. HWPX 형식만 지원합니다.";

  const activeAnalysis = convertedFile?.analysis ?? analysis;
  const activeSettings = styleSettings[activeStyle];
  const classificationCounts = Object.values(paragraphAssignments).reduce(
    (counts, role) => ({ ...counts, [role]: counts[role] + 1 }),
    { heading: 0, body: 0 } as Record<ParagraphRole, number>,
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_#dbeafe_0,_transparent_28%),linear-gradient(#f8fafc,#eef4fb)] text-slate-950">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-200">
              <FileText className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-base font-extrabold tracking-[-0.02em]">HWPX 서식 변환</p>
              <p className="text-xs text-slate-500">문서 내용은 그대로, 서식만 간편하게</p>
            </div>
          </div>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            기본 화면
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8 lg:py-10">
        <section className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="mb-2 text-sm font-bold text-blue-600">DOCUMENT FORMAT STUDIO</p>
            <h1 className="text-3xl font-black tracking-[-0.045em] text-slate-950 sm:text-4xl">
              HWPX 문서의 서식을 한 번에 정리하세요
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
              파일을 선택하고 원하는 서식을 지정하면 변경 내용을 미리 확인할 수 있습니다.
            </p>
          </div>
          <ol className="flex items-center gap-2 text-sm font-semibold text-slate-500" aria-label="작업 단계">
            {["파일 선택", "XML 분석", "서식 설정", "변경 완료"].map((step, index) => {
              const active = index === 0
                || (index === 1 && (analyzing || Boolean(analysis)))
                || (index === 2 && Boolean(analysis))
                || (index === 3 && Boolean(convertedFile));
              return (
                <li key={step} className="flex items-center gap-2">
                  <span className={`grid size-7 place-items-center rounded-full ${active ? "bg-blue-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>
                    {index + 1}
                  </span>
                  <span className="hidden sm:inline">{step}</span>
                  {index < 3 && <ChevronRight className="size-4 text-slate-300" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </section>

        <section
          className={`mb-6 rounded-3xl border-2 border-dashed bg-white p-6 transition sm:p-8 ${dragging ? "border-blue-500 bg-blue-50/70" : "border-blue-200"}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            acceptFile(event.dataTransfer.files[0]);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".hwpx,application/octet-stream"
            className="sr-only"
            aria-label="HWPX 파일 선택"
            onChange={(event) => acceptFile(event.target.files?.[0])}
          />
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
            <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              {analyzing ? (
                <LoaderCircle className="size-7 animate-spin" />
              ) : analysis ? (
                <Check className="size-7" />
              ) : fileError ? (
                <AlertCircle className="size-7 text-red-500" />
              ) : (
                <UploadCloud className="size-7" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-extrabold tracking-tight">
                {fileName ?? "변경할 HWPX 파일을 올려주세요"}
              </h2>
              <p className={`mt-1 text-sm ${fileError ? "font-semibold text-red-600" : "text-slate-500"}`}>
                {fileError ?? analysisStatus}
              </p>
              <p className="mt-2 text-xs text-slate-400">분석은 현재 브라우저 안에서만 진행되며 파일은 서버로 전송되지 않습니다.</p>
            </div>
            <Button
              type="button"
              size="lg"
              className="h-11 rounded-xl bg-blue-600 px-5 hover:bg-blue-700"
              onClick={() => fileInputRef.current?.click()}
            >
              <FolderOpen className="size-4" />
              파일 선택
            </Button>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.55fr_0.8fr]">
          <Card className="rounded-3xl border-slate-200 bg-white shadow-[0_18px_50px_-35px_rgba(15,23,42,0.35)]">
            <CardHeader className="border-b border-slate-100 pb-5">
              <CardTitle className="flex items-center gap-2 text-xl font-extrabold">
                <Sparkles className="size-5 text-blue-600" />
                스타일 설정
              </CardTitle>
              <CardDescription>소제목과 본문 스타일만 정하면 문단에 자동으로 적용됩니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-1">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
                {([
                  ["heading", "스타일 1 · 소제목", classificationCounts.heading],
                  ["body", "스타일 2 · 본문", classificationCounts.body],
                ] as const).map(([role, label, count]) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setActiveStyle(role)}
                    className={`rounded-xl px-3 py-3 text-left transition ${activeStyle === role ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    <span className="block text-sm font-extrabold">{label}</span>
                    <span className="mt-0.5 block text-xs">{analysis ? `${count}개 문단` : "파일 분석 후 자동 분류"}</span>
                  </button>
                ))}
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <SettingSelect label="글꼴" value={activeSettings.font} options={selectOptions.font} onValueChange={(value) => updateStyle("font", value)} />
                <SettingSelect label="글자 크기" value={activeSettings.fontSize} options={selectOptions.fontSize} suffix="pt" onValueChange={(value) => updateStyle("fontSize", value)} />
                <SettingSelect label="줄 간격" value={activeSettings.lineSpacing} options={selectOptions.lineSpacing} suffix="%" onValueChange={(value) => updateStyle("lineSpacing", value)} />
                <SettingSelect label="들여쓰기" value={activeSettings.indentation} options={selectOptions.indentation} suffix="pt" onValueChange={(value) => updateStyle("indentation", value)} />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">글자 굵기</p>
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
                  {[false, true].map((bold) => (
                    <button
                      key={String(bold)}
                      type="button"
                      onClick={() => updateStyle("bold", bold)}
                      className={`h-10 rounded-xl text-sm transition ${activeSettings.bold === bold ? "bg-white font-extrabold text-blue-700 shadow-sm" : "font-semibold text-slate-500"}`}
                    >
                      {bold ? "굵게 적용" : "보통 굵기"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">문단 정렬</p>
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5 sm:grid-cols-4">
                  {[
                    ["왼쪽", AlignLeft],
                    ["가운데", AlignCenter],
                    ["오른쪽", AlignRight],
                    ["양쪽", AlignJustify],
                  ].map(([label, Icon]) => (
                    <button
                      key={label as string}
                      type="button"
                      onClick={() => updateStyle("alignment", label as string)}
                      className={`flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition ${activeSettings.alignment === label ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      <Icon className="size-4" />
                      {label as string}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-between">
                <Button type="button" variant="ghost" className="rounded-xl text-slate-500" onClick={resetAll}>
                  <RotateCcw className="size-4" />
                  초기화
                </Button>
                <Button
                  type="button"
                  className="h-11 rounded-xl bg-blue-600 px-6 hover:bg-blue-700"
                  disabled={!analysis || !originalBuffer || applying}
                  onClick={applyFormatting}
                >
                  {applying ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : convertedFile ? (
                    <Check className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                  {applying ? "스타일 적용 중" : convertedFile ? "적용 완료" : "두 스타일 자동 적용"}
                </Button>
              </div>
              {applyError && (
                <div className="flex items-start gap-2 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  {applyError}
                </div>
              )}
              {convertedFile && (
                <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                  <Check className="mt-0.5 size-4 shrink-0" />
                  서식 변경이 완료되었습니다. 아래 다운로드 버튼으로 새 파일을 저장할 수 있습니다.
                </div>
              )}
            </CardContent>
          </Card>

          <aside className="space-y-6">
            <Card className="rounded-3xl border-slate-200 bg-slate-950 text-white shadow-xl shadow-slate-300/40">
              <CardHeader>
                <CardTitle className="text-lg">자동 분류 요약</CardTitle>
                <CardDescription className="text-slate-400">파일을 읽으면 문단 역할을 자동으로 나눕니다.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {([
                  ["heading", "스타일 1 · 소제목", "bg-blue-500"],
                  ["body", "스타일 2 · 본문", "bg-emerald-500"],
                ] as const).map(([role, label, color]) => {
                  const style = styleSettings[role];
                  return (
                    <div key={role} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`size-2 rounded-full ${color}`} />
                          <p className="text-sm font-extrabold">{label}</p>
                        </div>
                        <span className="text-xs font-bold text-slate-400">{classificationCounts[role]}개</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        {style.font} · {style.fontSize}pt · {style.bold ? "굵게" : "보통"}<br />
                        {style.alignment} · 줄 간격 {style.lineSpacing}% · 들여쓰기 {style.indentation}pt
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
              <p className="text-sm font-bold text-blue-900">원본 파일은 그대로 유지됩니다</p>
              <p className="mt-1 text-sm leading-6 text-blue-700">한 문단이 하나 또는 여러 글자 구간으로 구성돼도 문단 전체에 선택한 스타일을 적용합니다.</p>
            </div>
          </aside>
        </div>

        {analysis && (
          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_-35px_rgba(15,23,42,0.35)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-extrabold tracking-tight">문단 역할 자동 분류</h2>
                <p className="mt-1 text-sm text-slate-500">바로 적용해도 되고, 잘못 분류된 문단만 선택적으로 수정할 수 있습니다.</p>
              </div>
              <div className="flex gap-2 text-xs font-bold">
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">소제목 {classificationCounts.heading}개</span>
                <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">본문 {classificationCounts.body}개</span>
              </div>
            </div>
            <details className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70">
              <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-slate-700">분류 결과 확인 및 수정 <span className="font-normal text-slate-400">(선택 사항)</span></summary>
              <div className="max-h-96 space-y-2 overflow-y-auto border-t border-slate-200 p-3">
                {analysis.paragraphDetails.map((paragraph, index) => {
                  const role = paragraphAssignments[paragraph.id] ?? paragraph.suggestedRole;
                  return (
                    <div key={paragraph.id} className="flex flex-col gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-700"><span className="mr-2 text-slate-400">{index + 1}</span>{paragraph.text}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {paragraph.styleName ? `원본 스타일: ${paragraph.styleName}` : "원본 스타일 이름 없음"}
                          {paragraph.inTable && " · 표 안 문단"}
                        </p>
                      </div>
                      <div className="grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                        {([
                          ["heading", "소제목"],
                          ["body", "본문"],
                        ] as const).map(([candidate, label]) => (
                          <button
                            key={candidate}
                            type="button"
                            onClick={() => updateParagraphRole(paragraph.id, candidate)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${role === candidate ? (candidate === "heading" ? "bg-blue-600 text-white" : "bg-emerald-600 text-white") : "text-slate-500"}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          </section>
        )}

        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_-35px_rgba(15,23,42,0.35)]">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">
                {convertedFile ? "서식 변경 결과" : "문서 분석 결과"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {convertedFile
                  ? "변경된 HWPX를 다시 분석해 실제 적용 결과를 확인했습니다."
                  : analysis
                    ? "HWPX 내부 XML에서 추출한 본문과 주요 서식입니다."
                    : "파일을 선택하면 추출한 본문과 주요 서식이 이곳에 표시됩니다."}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={!convertedFile}
              onClick={downloadConvertedFile}
            >
              <Download className="size-4" />
              HWPX 다운로드
            </Button>
          </div>
          {activeAnalysis ? (
            <div className="grid gap-6 bg-slate-50/70 p-6 lg:grid-cols-[1.25fr_0.75fr]">
              <article className="min-h-96 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-extrabold text-slate-900">추출된 문서 내용</h3>
                    <p className="mt-1 text-xs text-slate-500">표 안의 내용도 문서 순서대로 포함됩니다.</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                    {activeAnalysis.styles.paragraphCount.toLocaleString()}개 문단
                  </span>
                </div>
                <div className="max-h-[34rem] overflow-y-auto whitespace-pre-wrap pr-3 text-sm leading-7 text-slate-700">
                  {activeAnalysis.text}
                </div>
              </article>

              <aside className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="font-extrabold text-slate-900">문서 정보</h3>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    {[
                      ["구역", activeAnalysis.styles.sectionCount.toLocaleString()],
                      ["문단", activeAnalysis.styles.paragraphCount.toLocaleString()],
                      ["글자", activeAnalysis.styles.characterCount.toLocaleString()],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-slate-50 px-2 py-3">
                        <dd className="text-lg font-black text-slate-900">{value}</dd>
                        <dt className="mt-1 text-xs text-slate-500">{label}</dt>
                      </div>
                    ))}
                  </dl>
                </div>

                {[
                  ["주요 글꼴", activeAnalysis.styles.fonts.slice(0, 4)],
                  ["글자 크기", activeAnalysis.styles.fontSizes.slice(0, 4)],
                  ["문단 정렬", activeAnalysis.styles.alignments.slice(0, 4).map((item) => ({ ...item, label: alignmentLabels[item.label] ?? item.label }))],
                  ["줄 간격", activeAnalysis.styles.lineSpacings.slice(0, 4)],
                  ["들여쓰기", activeAnalysis.styles.indentations.slice(0, 4)],
                ].map(([title, items]) => (
                  <div key={title as string} className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="text-sm font-extrabold text-slate-900">{title as string}</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(items as { label: string; count: number }[]).length > 0 ? (
                        (items as { label: string; count: number }[]).map((item) => (
                          <span key={item.label} className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">
                            {item.label} <span className="text-blue-500">· {item.count.toLocaleString()}</span>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400">감지된 정보 없음</span>
                      )}
                    </div>
                  </div>
                ))}

                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-800">
                  굵게 서식이 적용된 글자 <strong>{activeAnalysis.styles.boldCharacters.toLocaleString()}자</strong>를 감지했습니다.
                  {convertedFile && " 소제목과 본문 스타일을 문단 전체에 적용했습니다."}
                </div>
              </aside>
            </div>
          ) : (
            <div className="grid min-h-80 place-items-center bg-slate-50/70 p-6 text-center">
              <div>
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                  {analyzing ? <LoaderCircle className="size-5 animate-spin" /> : <FileText className="size-5" />}
                </div>
                <h3 className="mt-4 text-lg font-extrabold">{analyzing ? "XML 분석 중" : "분석할 문서가 없습니다"}</h3>
                <p className="mt-2 text-sm text-slate-500">
                  {analyzing ? "문서 크기에 따라 잠시 시간이 걸릴 수 있습니다." : "상단에서 HWPX 파일을 선택해 주세요."}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
