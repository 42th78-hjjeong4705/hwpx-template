"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  ChevronRight,
  Download,
  FileText,
  FolderOpen,
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

const initialSettings = {
  font: "본고딕",
  fontSize: "11",
  lineSpacing: "160",
  alignment: "왼쪽",
  indentation: "0",
};

type Settings = typeof initialSettings;

type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

declare global {
  interface Document {
    readonly modelContext?: ModelContext;
  }
}

const selectOptions = {
  font: ["본고딕", "맑은 고딕", "함초롬바탕", "나눔명조"],
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
  const [dragging, setDragging] = useState(false);
  const [settings, setSettings] = useState<Settings>(initialSettings);

  const updateSetting = (key: keyof Settings, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const acceptFile = (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".hwpx")) {
      setFileError("HWPX 파일만 선택할 수 있어요.");
      return;
    }
    setFileName(file.name);
    setFileSize(`${(file.size / 1024 / 1024).toFixed(2)} MB`);
    setFileError(null);
  };

  const resetAll = () => {
    setSettings(initialSettings);
    setFileName(null);
    setFileSize(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();
    const allowedValues = {
      font: selectOptions.font,
      fontSize: selectOptions.fontSize,
      lineSpacing: selectOptions.lineSpacing,
      alignment: ["왼쪽", "가운데", "오른쪽"],
      indentation: selectOptions.indentation,
    } as const;

    void Promise.resolve(
      context.registerTool(
        {
          name: "configure_document_format",
          title: "문서 서식 설정",
          description:
            "현재 화면의 글꼴, 글자 크기, 줄 간격, 문단 정렬, 들여쓰기 값을 설정합니다.",
          inputSchema: {
            type: "object",
            properties: {
              font: { type: "string", enum: allowedValues.font },
              fontSize: { type: "string", enum: allowedValues.fontSize },
              lineSpacing: { type: "string", enum: allowedValues.lineSpacing },
              alignment: { type: "string", enum: allowedValues.alignment },
              indentation: { type: "string", enum: allowedValues.indentation },
            },
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            if (!input || typeof input !== "object" || Array.isArray(input)) {
              throw new Error("서식 설정은 객체 형태여야 합니다.");
            }
            const next = input as Partial<Settings>;
            const invalid = Object.entries(next).find(([key, value]) => {
              const values = allowedValues[key as keyof Settings];
              return typeof value !== "string" || !values.includes(value as never);
            });
            if (invalid) throw new Error(`지원하지 않는 ${invalid[0]} 값입니다.`);
            setSettings((current) => ({ ...current, ...next }));
            return { status: "configured", settings: { ...settings, ...next } };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [settings]);

  const changedCount = Object.entries(settings).filter(
    ([key, value]) => value !== initialSettings[key as keyof Settings],
  ).length;

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
            {["파일 선택", "서식 설정", "변경 완료"].map((step, index) => (
              <li key={step} className="flex items-center gap-2">
                <span className={`grid size-7 place-items-center rounded-full ${index === 0 ? "bg-blue-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>
                  {index + 1}
                </span>
                <span className="hidden sm:inline">{step}</span>
                {index < 2 && <ChevronRight className="size-4 text-slate-300" aria-hidden="true" />}
              </li>
            ))}
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
              {fileName ? <Check className="size-7" /> : <UploadCloud className="size-7" />}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-extrabold tracking-tight">
                {fileName ?? "변경할 HWPX 파일을 올려주세요"}
              </h2>
              <p className={`mt-1 text-sm ${fileError ? "font-semibold text-red-600" : "text-slate-500"}`}>
                {fileError ?? (fileName ? `${fileSize} · 파일 선택 완료` : "파일을 이곳에 끌어 놓거나 직접 선택하세요. HWPX 형식만 지원합니다.")}
              </p>
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
                서식 설정
              </CardTitle>
              <CardDescription>문서 전체에 적용할 기본 서식을 선택하세요.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-1">
              <div className="grid gap-5 sm:grid-cols-2">
                <SettingSelect label="글꼴" value={settings.font} options={selectOptions.font} onValueChange={(value) => updateSetting("font", value)} />
                <SettingSelect label="글자 크기" value={settings.fontSize} options={selectOptions.fontSize} suffix="pt" onValueChange={(value) => updateSetting("fontSize", value)} />
                <SettingSelect label="줄 간격" value={settings.lineSpacing} options={selectOptions.lineSpacing} suffix="%" onValueChange={(value) => updateSetting("lineSpacing", value)} />
                <SettingSelect label="들여쓰기" value={settings.indentation} options={selectOptions.indentation} suffix="pt" onValueChange={(value) => updateSetting("indentation", value)} />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">문단 정렬</p>
                <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1.5">
                  {[
                    ["왼쪽", AlignLeft],
                    ["가운데", AlignCenter],
                    ["오른쪽", AlignRight],
                  ].map(([label, Icon]) => (
                    <button
                      key={label as string}
                      type="button"
                      onClick={() => updateSetting("alignment", label as string)}
                      className={`flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition ${settings.alignment === label ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
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
                <Button type="button" className="h-11 rounded-xl bg-blue-600 px-6 hover:bg-blue-700" disabled={!fileName}>
                  서식 적용하기
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <aside className="space-y-6">
            <Card className="rounded-3xl border-slate-200 bg-slate-950 text-white shadow-xl shadow-slate-300/40">
              <CardHeader>
                <CardTitle className="text-lg">현재 설정</CardTitle>
                <CardDescription className="text-slate-400">변경 전 선택 내용을 확인하세요.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  {[
                    ["글꼴", settings.font],
                    ["글자 크기", `${settings.fontSize}pt`],
                    ["줄 간격", `${settings.lineSpacing}%`],
                    ["문단 정렬", settings.alignment],
                    ["들여쓰기", `${settings.indentation}pt`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                      <dt className="text-slate-400">{label}</dt>
                      <dd className="font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
              <p className="text-sm font-bold text-blue-900">원본 파일은 그대로 유지됩니다</p>
              <p className="mt-1 text-sm leading-6 text-blue-700">완료 후 변경된 문서를 새 HWPX 파일로 내려받게 됩니다.</p>
            </div>
          </aside>
        </div>

        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_-35px_rgba(15,23,42,0.35)]">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">변경 완료</h2>
              <p className="mt-1 text-sm text-slate-500">서식을 적용하면 문서 미리보기와 변경 요약이 이곳에 표시됩니다.</p>
            </div>
            <Button type="button" variant="outline" className="rounded-xl" disabled>
              <Download className="size-4" />
              HWPX 다운로드
            </Button>
          </div>
          <div className="grid gap-6 bg-slate-50/70 p-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="grid min-h-80 place-items-center rounded-2xl border border-slate-200 bg-slate-100 p-6">
              <div className="aspect-[1/1.414] h-64 rounded-sm bg-white p-7 shadow-[0_8px_30px_rgba(15,23,42,0.12)]">
                <div className="h-2 w-1/3 rounded bg-blue-500" />
                <div className="mt-5 h-4 w-3/4 rounded bg-slate-800" />
                <div className="mt-2 h-2 w-1/2 rounded bg-slate-300" />
                <div className="mt-8 space-y-2">
                  {["100%", "92%", "96%", "83%", "90%", "72%"].map((width) => (
                    <div key={width} className="h-1.5 rounded bg-slate-200" style={{ width }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex min-h-80 flex-col justify-center rounded-2xl border border-slate-200 bg-white p-6">
              <div className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <FileText className="size-5" />
              </div>
              <h3 className="mt-5 text-lg font-extrabold">변경 내용 요약</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {changedCount > 0 ? `${changedCount}개 서식 항목을 기본값에서 변경했습니다.` : "아직 기본값에서 변경된 서식이 없습니다."}
              </p>
              <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                {fileName ? `${fileName} 문서에 선택한 설정을 적용할 준비가 되었습니다.` : "먼저 상단에서 HWPX 파일을 선택해 주세요."}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
