"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import {
  AlertCircle,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Check,
  Copy,
  Database,
  Download,
  FileText,
  FolderOpen,
  Globe2,
  Keyboard,
  LoaderCircle,
  LogIn,
  LogOut,
  Plus,
  RotateCcw,
  Save,
  Sigma,
  Sparkles,
  Trash2,
  UploadCloud,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShortcutDictionary } from "@/components/shortcut-dictionary";
import { StyleCommunity } from "@/components/style-community";
import {
  analyzeHwpx,
  formatHwpxByParagraphStyles,
  type HwpxAnalysis,
  type HwpxFormatSettings,
  type HwpxParagraphInfo,
  type HwpxTableBorderInfo,
  type ParagraphStyleAssignments,
  type ParagraphStylePreset,
} from "@/lib/hwpx-parser";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { extractStylesFromHwpx, initialStyles, readStoredStyles, type DocumentStyle, type StoredStylePreset, type StyleSettings } from "@/lib/style-presets";

type WorkflowStep = "upload" | "format" | "result";
type ActiveService = "converter" | "shortcuts" | "community";
type SavedEquation = { id: string; user_id: string; name: string; script: string; updated_at: string };

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
  lineSpacing: ["130", "150", "160", "180", "200"],
  indentation: ["0", "5", "10", "15", "20"],
};

function SettingSelect({ label, value, options, suffix, onValueChange }: {
  label: string;
  value: string;
  options: string[];
  suffix?: string;
  onValueChange: (value: string) => void;
}) {
  const displayedOptions = options.includes(value) ? options : [value, ...options];
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-10 w-full rounded-xl border-slate-200 bg-white px-3 shadow-none"><SelectValue /></SelectTrigger>
        <SelectContent>
          {displayedOptions.map((option) => <SelectItem key={option} value={option}>{option}{suffix}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

const alignmentMap: Record<string, CSSProperties["textAlign"]> = {
  LEFT: "left",
  CENTER: "center",
  RIGHT: "right",
  JUSTIFY: "justify",
  DISTRIBUTE: "justify",
};

function tableBorderCss(border: HwpxTableBorderInfo | undefined) {
  if (!border || border.type.toUpperCase() === "NONE") return "1px solid #e2e8f0";
  const type = border.type.toUpperCase();
  const style = type.includes("DOUBLE")
    ? "double"
    : type.includes("DOT") && !type.includes("DASH")
      ? "dotted"
      : type.includes("DASH")
        ? "dashed"
        : "solid";
  const rawWidth = Number.parseFloat(border.width ?? "");
  const width = style === "double" ? 3 : Math.max(1, Number.isFinite(rawWidth) ? rawWidth * 3.78 : 1);
  return `${Number(width.toFixed(2))}px ${style} ${border.color || "#0f172a"}`;
}

function DocumentFlow({ analysis, renderParagraph }: {
  analysis: HwpxAnalysis;
  renderParagraph: (paragraph: HwpxParagraphInfo, index: number) => ReactNode;
}) {
  const paragraphsById = new Map(analysis.paragraphDetails.map((paragraph) => [paragraph.id, paragraph]));
  const paragraphIndexes = new Map(analysis.paragraphDetails.map((paragraph, index) => [paragraph.id, index]));
  const blocks = analysis.documentBlocks.length > 0
    ? analysis.documentBlocks
    : analysis.paragraphDetails.map((paragraph) => ({
      type: "paragraph" as const,
      id: paragraph.id,
      paragraphId: paragraph.id,
    }));

  return blocks.map((block) => {
    if (block.type === "paragraph") {
      const paragraph = paragraphsById.get(block.paragraphId);
      if (!paragraph) return null;
      return <div key={block.id}>{renderParagraph(paragraph, paragraphIndexes.get(paragraph.id) ?? 0)}</div>;
    }

    return (
      <div key={block.id} className="my-3 overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full border-collapse table-fixed" aria-label={`${block.rowCount}행 ${block.columnCount}열 표`}>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`${block.id}:row:${rowIndex}`}>
                {row.map((cell) => {
                  const cellStyle: CSSProperties = {
                    backgroundColor: cell.backgroundColor,
                    borderLeft: tableBorderCss(cell.borders.left),
                    borderRight: tableBorderCss(cell.borders.right),
                    borderTop: tableBorderCss(cell.borders.top),
                    borderBottom: tableBorderCss(cell.borders.bottom),
                    verticalAlign: "top",
                  };
                  return (
                    <td key={cell.id} colSpan={cell.columnSpan} rowSpan={cell.rowSpan} className="min-w-20 p-1.5" style={cellStyle}>
                      {cell.paragraphIds.length > 0
                        ? cell.paragraphIds.map((paragraphId) => {
                          const paragraph = paragraphsById.get(paragraphId);
                          if (!paragraph) return null;
                          return <div key={paragraphId}>{renderParagraph(paragraph, paragraphIndexes.get(paragraphId) ?? 0)}</div>;
                        })
                        : <div className="min-h-6" aria-label="빈 표 셀" />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  });
}

function ComparisonPreview({ title, badge, analysis, accent }: {
  title: string;
  badge: string;
  analysis: HwpxAnalysis;
  accent: "slate" | "blue";
}) {
  const accentClasses = accent === "blue"
    ? "border-blue-200 bg-blue-50 text-blue-700"
    : "border-slate-200 bg-slate-100 text-slate-600";

  return (
    <Card className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div><CardTitle className="text-lg">{title}</CardTitle><CardDescription>{analysis.styles.paragraphCount}문단 · {analysis.styles.characterCount.toLocaleString()}자</CardDescription></div>
          <span className={`rounded-full border px-3 py-1 text-xs font-extrabold ${accentClasses}`}>{badge}</span>
        </div>
      </CardHeader>
      <CardContent className="h-[32rem] overflow-y-auto bg-slate-100 p-4 sm:p-5">
        <div className="mx-auto min-h-full max-w-2xl space-y-1.5 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.1)] sm:p-8">
          <DocumentFlow analysis={analysis} renderParagraph={(paragraph, index) => {
            const format = paragraph.format;
            const size = Number.isFinite(format.fontSize) ? Math.max(9, Math.min(42, format.fontSize ?? 11)) : 11;
            const spacing = Number.isFinite(format.lineSpacing) ? Math.max(1, Math.min(3, (format.lineSpacing ?? 160) / 100)) : 1.6;
            const indent = Number.isFinite(format.indentation) ? Math.max(0, Math.min(80, format.indentation ?? 0)) : 0;
            const style: CSSProperties = {
              fontFamily: format.font || undefined,
              fontSize: `${size}px`,
              fontWeight: format.bold ? 700 : 400,
              lineHeight: spacing,
              textAlign: alignmentMap[format.alignment ?? ""] ?? "left",
              textIndent: `${indent}pt`,
            };
            return (
              <div className={`group relative rounded-lg transition hover:bg-blue-50/70 ${paragraph.inTable ? "px-2 py-1" : "px-3 py-2"}`}>
                <span className="absolute -left-1 top-2 text-[9px] font-bold text-slate-300 opacity-0 transition group-hover:opacity-100">{index + 1}</span>
                <p className="whitespace-pre-wrap text-slate-800" style={style}>{paragraph.text}</p>
              </div>
            );
          }} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function WorkflowPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const presetFileInputRef = useRef<HTMLInputElement>(null);
  const [activeService, setActiveService] = useState<ActiveService>("converter");
  const [step, setStep] = useState<WorkflowStep>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<HwpxAnalysis | null>(null);
  const [originalBuffer, setOriginalBuffer] = useState<ArrayBuffer | null>(null);
  const [convertedFile, setConvertedFile] = useState<{ bytes: Uint8Array<ArrayBuffer>; analysis: HwpxAnalysis; fileName: string } | null>(null);
  const [styles, setStyles] = useState<DocumentStyle[]>(initialStyles);
  const [activeStyleId, setActiveStyleId] = useState("style-1");
  const [stylePanelView, setStylePanelView] = useState<"settings" | "saved">("settings");
  const [paragraphAssignments, setParagraphAssignments] = useState<ParagraphStyleAssignments>({});
  const [selectedParagraphId, setSelectedParagraphId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [myPageOpen, setMyPageOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [storedPresets, setStoredPresets] = useState<StoredStylePreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  const [presetPublic, setPresetPublic] = useState(false);
  const [presetDraftStyles, setPresetDraftStyles] = useState<DocumentStyle[]>(initialStyles);
  const [presetDraftActiveId, setPresetDraftActiveId] = useState("style-1");
  const [presetCreationMode, setPresetCreationMode] = useState<"manual" | "upload">("manual");
  const [presetSourceFile, setPresetSourceFile] = useState<string | null>(null);
  const [presetFileBusy, setPresetFileBusy] = useState(false);
  const [presetFileError, setPresetFileError] = useState<string | null>(null);
  const [extractedPresetStyles, setExtractedPresetStyles] = useState<DocumentStyle[] | null>(null);
  const [presetsBusy, setPresetsBusy] = useState(false);
  const [presetMessage, setPresetMessage] = useState<string | null>(null);
  const [savedEquations, setSavedEquations] = useState<SavedEquation[]>([]);
  const [equationName, setEquationName] = useState("");
  const [equationScript, setEquationScript] = useState("");
  const [equationsBusy, setEquationsBusy] = useState(false);
  const [equationMessage, setEquationMessage] = useState<string | null>(null);

  const supabase = getSupabaseBrowserClient();

  const activeStyle = styles.find((style) => style.id === activeStyleId) ?? styles[0];
  const activePresetDraftStyle = presetDraftStyles.find((style) => style.id === presetDraftActiveId) ?? presetDraftStyles[0];
  const styleCounts = styles.reduce<Record<string, number>>((counts, style) => {
    counts[style.id] = Object.values(paragraphAssignments).filter((styleId) => styleId === style.id).length;
    return counts;
  }, {});

  const refreshStoredPresets = useCallback(async (userId?: string) => {
    if (!supabase || !userId) {
      setStoredPresets([]);
      return;
    }
    setPresetsBusy(true);
    const { data, error } = await supabase
      .from("style_presets")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    setPresetsBusy(false);
    if (error) {
      setPresetMessage(`스타일 목록을 불러오지 못했습니다: ${error.message}`);
      return;
    }
    setStoredPresets((data ?? []) as StoredStylePreset[]);
  }, [supabase]);

  const refreshSavedEquations = useCallback(async (userId?: string) => {
    if (!supabase || !userId) { setSavedEquations([]); return; }
    setEquationsBusy(true);
    const { data, error } = await supabase.from("saved_equations").select("*").eq("user_id", userId).order("updated_at", { ascending: false });
    setEquationsBusy(false);
    if (error) { setEquationMessage("수식 보관함을 사용하려면 새 데이터베이스 SQL을 먼저 실행해 주세요."); return; }
    setSavedEquations((data ?? []) as SavedEquation[]);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setCurrentUser(data.user);
      void refreshStoredPresets(data.user?.id);
      void refreshSavedEquations(data.user?.id);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setCurrentUser(session?.user ?? null);
      void refreshStoredPresets(session?.user.id);
      void refreshSavedEquations(session?.user.id);
    });
    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase, refreshSavedEquations, refreshStoredPresets]);

  const clearConvertedResult = () => { setConvertedFile(null); setApplyError(null); };

  const submitAuthentication = async () => {
    if (!supabase) {
      setAuthMessage("Supabase 환경변수가 아직 연결되지 않았습니다.");
      return;
    }
    if (!authEmail.trim() || authPassword.length < 6) {
      setAuthMessage("이메일과 6자 이상의 비밀번호를 입력해 주세요.");
      return;
    }
    setAuthBusy(true);
    setAuthMessage(null);
    if (authMode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });
      setAuthBusy(false);
      if (error) {
        setAuthMessage(`로그인하지 못했습니다: ${error.message}`);
        return;
      }
      setAuthPassword("");
      setAuthOpen(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: authEmail.trim(),
      password: authPassword,
      options: { emailRedirectTo: window.location.origin },
    });
    setAuthBusy(false);
    if (error) {
      setAuthMessage(`가입하지 못했습니다: ${error.message}`);
      return;
    }
    setAuthPassword("");
    if (data.session) {
      setAuthOpen(false);
    } else {
      setAuthMessage("가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요.");
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setStoredPresets([]);
    setSavedEquations([]);
    setPresetMessage(null);
    setEquationMessage(null);
    setMyPageOpen(false);
  };

  const saveMyStyleDraft = async (stylesToSave: DocumentStyle[] = presetDraftStyles) => {
    const name = presetName.trim();
    if (!supabase || !currentUser) {
      setAuthOpen(true);
      return;
    }
    if (!name) {
      setPresetMessage("저장할 스타일 묶음 이름을 입력해 주세요.");
      return;
    }
    setPresetsBusy(true);
    setPresetMessage(null);
    const { error } = await supabase.from("style_presets").upsert({
      user_id: currentUser.id,
      name,
      styles: stylesToSave,
      description: presetDescription.trim(),
      is_public: presetPublic,
      author_name: "익명 사용자",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,name" });
    setPresetsBusy(false);
    if (error) {
      setPresetMessage(`스타일을 저장하지 못했습니다: ${error.message}`);
      return;
    }
    setPresetName("");
    setPresetDescription("");
    setPresetPublic(false);
    setPresetDraftStyles(initialStyles);
    setPresetDraftActiveId("style-1");
    setPresetSourceFile(null);
    setExtractedPresetStyles(null);
    setPresetFileError(null);
    if (presetFileInputRef.current) presetFileInputRef.current.value = "";
    setPresetMessage(`‘${name}’ 스타일을 저장했습니다.`);
    await refreshStoredPresets(currentUser.id);
  };

  const loadStoredPreset = (preset: StoredStylePreset) => {
    const loadedStyles = readStoredStyles(preset.styles);
    if (!loadedStyles) {
      setPresetMessage("저장된 스타일 데이터 형식이 올바르지 않습니다.");
      return;
    }
    const availableStyleIds = new Set(loadedStyles.map((style) => style.id));
    const fallbackStyleId = loadedStyles[0].id;
    setStyles(loadedStyles);
    setActiveStyleId(fallbackStyleId);
    setParagraphAssignments((current) => Object.fromEntries(
      Object.entries(current).map(([paragraphId, styleId]) => [
        paragraphId,
        availableStyleIds.has(styleId) ? styleId : fallbackStyleId,
      ]),
    ));
    setPresetMessage(`‘${preset.name}’ 스타일을 불러왔습니다.`);
    clearConvertedResult();
  };

  const editStoredPreset = (preset: StoredStylePreset) => {
    const loadedStyles = readStoredStyles(preset.styles);
    if (!loadedStyles) { setPresetMessage("저장된 스타일 데이터 형식이 올바르지 않습니다."); return; }
    setPresetName(preset.name);
    setPresetDescription(preset.description ?? "");
    setPresetPublic(Boolean(preset.is_public));
    setPresetDraftStyles(loadedStyles);
    setPresetDraftActiveId(loadedStyles[0].id);
    setPresetCreationMode("manual");
    setPresetMessage(`‘${preset.name}’ 서식을 편집기에 불러왔습니다.`);
  };

  const updatePresetDraftStyle = (key: keyof StyleSettings, value: string | boolean) => {
    setPresetDraftStyles((current) => current.map((style) => style.id === presetDraftActiveId ? { ...style, settings: { ...style.settings, [key]: value } } : style));
  };

  const updatePresetDraftName = (name: string) => {
    setPresetDraftStyles((current) => current.map((style) => style.id === presetDraftActiveId ? { ...style, name } : style));
  };

  const addPresetDraftStyle = () => {
    const nextNumber = Math.max(0, ...presetDraftStyles.map((style) => Number(style.id.match(/\d+$/)?.[0] ?? 0))) + 1;
    const newStyle: DocumentStyle = { id: `style-${nextNumber}`, name: `스타일 ${nextNumber}`, colorIndex: (nextNumber - 1) % stylePalette.length, settings: { ...activePresetDraftStyle.settings } };
    setPresetDraftStyles((current) => [...current, newStyle]);
    setPresetDraftActiveId(newStyle.id);
  };

  const removePresetDraftStyle = (styleId: string) => {
    if (presetDraftStyles.length <= 2) return;
    const fallbackId = presetDraftStyles.find((style) => style.id !== styleId)?.id ?? "style-1";
    setPresetDraftStyles((current) => current.filter((style) => style.id !== styleId));
    if (presetDraftActiveId === styleId) setPresetDraftActiveId(fallbackId);
  };

  const acceptPresetFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".hwpx")) {
      setPresetFileError("HWPX 파일만 선택할 수 있어요.");
      setExtractedPresetStyles(null);
      return;
    }

    setPresetFileBusy(true);
    setPresetFileError(null);
    setPresetSourceFile(file.name);
    setExtractedPresetStyles(null);
    try {
      const fileAnalysis = await analyzeHwpx(await file.arrayBuffer());
      const extractedStyles = extractStylesFromHwpx(fileAnalysis);
      setExtractedPresetStyles(extractedStyles);
      setPresetName((current) => current.trim() || `${file.name.replace(/\.hwpx$/i, "")} 서식`);
      setPresetMessage("문서에서 소제목과 본문 서식을 추출했습니다. 내용을 확인한 뒤 저장해 주세요.");
    } catch (error) {
      setPresetFileError(error instanceof Error ? error.message : "서식 파일을 분석하는 중 오류가 발생했습니다.");
    } finally {
      setPresetFileBusy(false);
    }
  };

  const deleteStoredPreset = async (preset: StoredStylePreset) => {
    if (!supabase || !currentUser) return;
    setPresetsBusy(true);
    const { error } = await supabase
      .from("style_presets")
      .delete()
      .eq("id", preset.id)
      .eq("user_id", currentUser.id);
    setPresetsBusy(false);
    if (error) {
      setPresetMessage(`스타일을 삭제하지 못했습니다: ${error.message}`);
      return;
    }
    setPresetMessage(`‘${preset.name}’ 스타일을 삭제했습니다.`);
    await refreshStoredPresets(currentUser.id);
  };

  const togglePresetVisibility = async (preset: StoredStylePreset) => {
    if (!supabase || !currentUser) return;
    setPresetsBusy(true);
    setPresetMessage(null);
    const nextPublic = !preset.is_public;
    const { error } = await supabase.from("style_presets").update({ is_public: nextPublic, author_name: "익명 사용자", updated_at: new Date().toISOString() }).eq("id", preset.id).eq("user_id", currentUser.id);
    setPresetsBusy(false);
    if (error) { setPresetMessage("공개 설정을 바꾸려면 새 데이터베이스 SQL을 먼저 실행해 주세요."); return; }
    setPresetMessage(nextPublic ? `‘${preset.name}’을(를) 커뮤니티에 공개했습니다.` : `‘${preset.name}’을(를) 비공개로 전환했습니다.`);
    await refreshStoredPresets(currentUser.id);
  };

  const saveEquation = async () => {
    if (!supabase || !currentUser) { setAuthOpen(true); return; }
    const name = equationName.trim();
    const script = equationScript.trim();
    if (!name || !script) { setEquationMessage("수식 이름과 한글 수식 스크립트를 모두 입력해 주세요."); return; }
    setEquationsBusy(true);
    setEquationMessage(null);
    const { error } = await supabase.from("saved_equations").upsert({ user_id: currentUser.id, name, script, updated_at: new Date().toISOString() }, { onConflict: "user_id,name" });
    setEquationsBusy(false);
    if (error) { setEquationMessage("수식을 저장하려면 새 데이터베이스 SQL을 먼저 실행해 주세요."); return; }
    setEquationName(""); setEquationScript(""); setEquationMessage(`‘${name}’ 수식을 저장했습니다.`);
    await refreshSavedEquations(currentUser.id);
  };

  const deleteEquation = async (equation: SavedEquation) => {
    if (!supabase || !currentUser) return;
    setEquationsBusy(true);
    const { error } = await supabase.from("saved_equations").delete().eq("id", equation.id).eq("user_id", currentUser.id);
    setEquationsBusy(false);
    if (error) { setEquationMessage(`수식을 삭제하지 못했습니다: ${error.message}`); return; }
    setEquationMessage(`‘${equation.name}’ 수식을 삭제했습니다.`);
    await refreshSavedEquations(currentUser.id);
  };

  const copyEquation = async (equation: SavedEquation) => {
    try { await navigator.clipboard.writeText(equation.script); setEquationMessage(`‘${equation.name}’을(를) 복사했습니다. 한글 수식 편집기(Ctrl+N, M)에 붙여넣으세요.`); }
    catch { setEquationMessage("브라우저가 복사를 허용하지 않았습니다. 수식 내용을 직접 선택해 주세요."); }
  };

  const openMyPage = () => {
    if (!currentUser) { setAuthMode("signin"); setAuthMessage(null); setAuthOpen(true); return; }
    setMyPageOpen(true);
    void refreshStoredPresets(currentUser.id);
    void refreshSavedEquations(currentUser.id);
  };

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

  const assignParagraph = (paragraphId: string) => {
    setSelectedParagraphId(paragraphId);
    setParagraphAssignments((current) => current[paragraphId] === activeStyleId
      ? current
      : { ...current, [paragraphId]: activeStyleId });
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

  const removeStyle = (styleId: string) => {
    if (styles.length <= 2) return;
    const fallbackStyleId = styles.find((style) => style.id !== styleId)?.id ?? "style-1";
    setStyles((current) => current.filter((style) => style.id !== styleId));
    setParagraphAssignments((current) => Object.fromEntries(Object.entries(current).map(([paragraphId, assignedStyleId]) => [
      paragraphId,
      assignedStyleId === styleId ? fallbackStyleId : assignedStyleId,
    ])));
    if (activeStyleId === styleId) setActiveStyleId(fallbackStyleId);
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
      setSelectedParagraphId(null);
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
          fontSize: Math.min(80, Math.max(1, Number(style.settings.fontSize) || 1)),
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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_#dbeafe_0,_transparent_28%),linear-gradient(#f8fafc,#eef4fb)] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-2 lg:px-8">
          <button type="button" onClick={() => setActiveService("converter")} className="flex items-center gap-3 text-left">
            <div className="grid size-9 place-items-center rounded-xl bg-blue-600 text-white"><FileText className="size-5" /></div>
            <div><p className="text-base font-extrabold">한글 도우미</p><p className="hidden text-xs text-slate-500 sm:block">서식부터 단축키·수식까지</p></div>
          </button>
          <nav className="order-3 flex w-full items-center justify-center gap-1 rounded-2xl bg-slate-100 p-1 md:order-none md:w-auto" aria-label="주요 서비스">
            {([
              ["converter", "서식 변환", FileText],
              ["shortcuts", "단축키 사전", Keyboard],
              ["community", "서식 커뮤니티", Users],
            ] as const).map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setActiveService(id)} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold transition sm:text-sm md:flex-none ${activeService === id ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}><Icon className="size-4" />{label}</button>)}
          </nav>
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={openMyPage}>
            {currentUser ? <UserRound className="size-4" /> : <LogIn className="size-4" />}
            {currentUser ? "마이페이지" : "로그인"}
          </Button>
        </div>
      </header>

      <Dialog open={authOpen} onOpenChange={(open) => { setAuthOpen(open); if (!open) setAuthMessage(null); }}>
        <DialogContent className="rounded-3xl border-slate-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{authMode === "signin" ? "한글 도우미 로그인" : "한글 도우미 계정 만들기"}</DialogTitle>
            <DialogDescription>로그인하면 나의 서식과 수식을 계정에 저장할 수 있습니다. HWPX 문서는 업로드되지 않습니다.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submitAuthentication(); }}>
            <div className="space-y-2">
              <label htmlFor="auth-email" className="text-sm font-bold text-slate-700">이메일</label>
              <input id="auth-email" type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" placeholder="name@example.com" />
            </div>
            <div className="space-y-2">
              <label htmlFor="auth-password" className="text-sm font-bold text-slate-700">비밀번호</label>
              <input id="auth-password" type="password" minLength={6} autoComplete={authMode === "signin" ? "current-password" : "new-password"} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" placeholder="6자 이상 입력" />
            </div>
            {authMessage && <p className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold leading-6 text-blue-800">{authMessage}</p>}
            <Button type="submit" className="h-11 w-full rounded-xl bg-blue-600" disabled={authBusy}>{authBusy && <LoaderCircle className="size-4 animate-spin" />}{authMode === "signin" ? "로그인" : "계정 만들기"}</Button>
          </form>
          <button type="button" className="text-sm font-semibold text-blue-700" onClick={() => { setAuthMode((current) => current === "signin" ? "signup" : "signin"); setAuthMessage(null); }}>
            {authMode === "signin" ? "처음 사용하시나요? 계정 만들기" : "이미 계정이 있나요? 로그인"}
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={myPageOpen} onOpenChange={setMyPageOpen}>
        <DialogContent className="max-h-[90vh] overflow-hidden rounded-3xl border-slate-200 p-0 sm:max-w-4xl">
          <div className="border-b border-slate-100 px-6 pb-4 pt-6">
            <DialogHeader><DialogTitle className="flex items-center gap-2 text-xl"><UserRound className="size-5 text-blue-600" /> 마이페이지</DialogTitle><DialogDescription>{currentUser?.email} · 자주 쓰는 서식과 수식만 저장됩니다.</DialogDescription></DialogHeader>
          </div>
          <Tabs defaultValue="styles" className="min-h-0 gap-0">
            <TabsList className="mx-6 mt-1 grid h-11 w-auto grid-cols-2 rounded-xl bg-slate-100 p-1">
              <TabsTrigger value="styles" className="rounded-lg font-bold"><Database className="size-4" /> 나의 서식</TabsTrigger>
              <TabsTrigger value="equations" className="rounded-lg font-bold"><Sigma className="size-4" /> 나의 수식</TabsTrigger>
            </TabsList>
            <div className="max-h-[calc(90vh-12rem)] overflow-y-auto px-6 py-5">
              <TabsContent value="styles" className="space-y-5">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                  <div><h3 className="font-black text-blue-950">새 서식 만들기</h3><p className="mt-1 text-xs leading-5 text-blue-800">직접 설정하거나, 서식이 적용된 HWPX 문서에서 소제목과 본문 서식을 자동으로 가져올 수 있습니다.</p></div>
                  <div className="mt-4 grid grid-cols-2 rounded-xl bg-blue-100/70 p-1" role="tablist" aria-label="서식 생성 방식">
                    <button type="button" role="tab" aria-selected={presetCreationMode === "manual"} onClick={() => setPresetCreationMode("manual")} className={`h-10 rounded-lg text-sm font-black transition ${presetCreationMode === "manual" ? "bg-white text-blue-700 shadow-sm" : "text-blue-800/70"}`}>직접 만들기</button>
                    <button type="button" role="tab" aria-selected={presetCreationMode === "upload"} onClick={() => setPresetCreationMode("upload")} className={`h-10 rounded-lg text-sm font-black transition ${presetCreationMode === "upload" ? "bg-white text-blue-700 shadow-sm" : "text-blue-800/70"}`}>서식 파일 업로드하기</button>
                  </div>

                  {presetCreationMode === "manual" ? <>
                    <div className="mt-4 flex justify-end"><Button type="button" variant="outline" size="sm" className="rounded-xl bg-white" onClick={addPresetDraftStyle}><Plus className="size-4" /> 스타일 추가</Button></div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input value={presetName} onChange={(event) => setPresetName(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500" placeholder="서식 이름 (예: 과학 보고서)" />
                      <input value={presetDescription} onChange={(event) => setPresetDescription(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500" placeholder="간단한 설명 (선택)" />
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{presetDraftStyles.map((style, index) => <div key={style.id} className="group relative"><button type="button" onClick={() => setPresetDraftActiveId(style.id)} className={`w-full rounded-xl border p-3 pr-9 text-left ${presetDraftActiveId === style.id ? "border-blue-500 bg-white text-blue-800" : "border-blue-100 bg-white/70 text-slate-700"}`}><span className="block truncate text-sm font-black">{style.name}</span><span className="mt-1 block text-[11px] text-slate-500">{style.settings.font} · {style.settings.fontSize}pt</span></button>{index >= 2 && <button type="button" aria-label={`${style.name} 삭제`} onClick={() => removePresetDraftStyle(style.id)} className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-white/90 text-slate-400 opacity-0 shadow-sm ring-1 ring-slate-200 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100"><X className="size-3.5" /></button>}</div>)}</div>
                    {activePresetDraftStyle && <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-blue-100"><input value={activePresetDraftStyle.name} onChange={(event) => updatePresetDraftName(event.target.value)} aria-label="마이페이지 스타일 이름" className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-500" /><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><SettingSelect label="글꼴" value={activePresetDraftStyle.settings.font} options={selectOptions.font} onValueChange={(value) => updatePresetDraftStyle("font", value)} /><div className="space-y-2"><label className="text-sm font-semibold text-slate-700">글자 크기</label><div className="relative"><input type="number" min="1" max="80" step="0.5" value={activePresetDraftStyle.settings.fontSize} onChange={(event) => updatePresetDraftStyle("fontSize", event.target.value)} onBlur={(event) => updatePresetDraftStyle("fontSize", String(Math.min(80, Math.max(1, Number(event.target.value) || 1))))} className="h-10 w-full rounded-xl border border-slate-200 px-3 pr-8 text-sm outline-none focus:border-blue-500" /><span className="absolute right-3 top-2.5 text-xs text-slate-400">pt</span></div></div><SettingSelect label="줄 간격" value={activePresetDraftStyle.settings.lineSpacing} options={selectOptions.lineSpacing} suffix="%" onValueChange={(value) => updatePresetDraftStyle("lineSpacing", value)} /><SettingSelect label="들여쓰기" value={activePresetDraftStyle.settings.indentation} options={selectOptions.indentation} suffix="pt" onValueChange={(value) => updatePresetDraftStyle("indentation", value)} /></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">{[false, true].map((bold) => <button key={String(bold)} type="button" onClick={() => updatePresetDraftStyle("bold", bold)} className={`h-9 rounded-lg text-xs font-bold ${activePresetDraftStyle.settings.bold === bold ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{bold ? "굵게" : "보통"}</button>)}</div><div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">{[["왼쪽", AlignLeft], ["가운데", AlignCenter], ["오른쪽", AlignRight], ["양쪽", AlignJustify]].map(([label, Icon]) => <button key={label as string} type="button" title={label as string} onClick={() => updatePresetDraftStyle("alignment", label as string)} className={`grid h-9 place-items-center rounded-lg ${activePresetDraftStyle.settings.alignment === label ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}><Icon className="size-4" /></button>)}</div></div></div>}
                  </> : <>
                    <input ref={presetFileInputRef} type="file" accept=".hwpx,application/octet-stream" className="sr-only" aria-label="서식을 추출할 HWPX 파일 선택" onChange={(event) => void acceptPresetFile(event.target.files?.[0])} />
                    <button type="button" disabled={presetFileBusy} onClick={() => presetFileInputRef.current?.click()} className="mt-4 flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-blue-200 bg-white/80 px-5 py-7 text-center transition hover:border-blue-400 hover:bg-white disabled:cursor-wait">
                      {presetFileBusy ? <LoaderCircle className="size-8 animate-spin text-blue-600" /> : <UploadCloud className="size-8 text-blue-600" />}
                      <span className="mt-2 text-sm font-black text-blue-950">{presetFileBusy ? "문서 서식을 분석하고 있어요" : presetSourceFile ?? "서식이 적용된 HWPX 파일 선택"}</span>
                      <span className="mt-1 text-xs leading-5 text-slate-500">표 안의 문장은 제외하고 소제목과 본문에서 대표 서식을 추출합니다.</span>
                    </button>
                    {presetFileError && <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold leading-6 text-red-700"><AlertCircle className="mt-1 size-4 shrink-0" />{presetFileError}</p>}
                    {extractedPresetStyles && <>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">{extractedPresetStyles.map((style) => <div key={style.id} className="rounded-2xl border border-blue-100 bg-white p-4"><div className="flex items-center justify-between gap-2"><span className="font-black text-slate-900">{style.name.replace(/^스타일 \d+ · /, "")}</span><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${stylePalette[style.colorIndex].badge}`}>자동 추출</span></div><p className="mt-3 text-sm font-bold text-slate-800">{style.settings.font} · {style.settings.fontSize}pt · {style.settings.bold ? "굵게" : "보통"}</p><p className="mt-1 text-xs leading-5 text-slate-500">줄 간격 {style.settings.lineSpacing}% · 들여쓰기 {style.settings.indentation}pt · {style.settings.alignment} 정렬</p></div>)}</div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <input value={presetName} onChange={(event) => setPresetName(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500" placeholder="서식 이름" />
                        <input value={presetDescription} onChange={(event) => setPresetDescription(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500" placeholder="간단한 설명 (선택)" />
                      </div>
                    </>}
                  </>}
                  {(presetCreationMode === "manual" || extractedPresetStyles) && <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={presetPublic} onChange={(event) => setPresetPublic(event.target.checked)} className="size-4 accent-blue-600" /> 커뮤니티에 익명으로 공개</label>
                    <Button type="button" className="rounded-xl bg-blue-600" disabled={presetsBusy || presetFileBusy} onClick={() => void saveMyStyleDraft(presetCreationMode === "upload" ? extractedPresetStyles ?? presetDraftStyles : presetDraftStyles)}>{presetsBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} {presetCreationMode === "upload" ? "추출한 서식 저장" : "나의 서식에 저장"}</Button>
                  </div>}
                </div>
                {presetMessage && <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold leading-6 text-slate-700">{presetMessage}</p>}
                <div className="space-y-3">
                  <div className="flex items-center justify-between"><h3 className="font-black">저장한 서식</h3><span className="text-xs font-bold text-slate-400">{storedPresets.length}개</span></div>
                  {presetsBusy && storedPresets.length === 0 ? <p className="flex items-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" /> 불러오는 중</p> : storedPresets.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">저장한 서식이 없습니다.</p> : storedPresets.map((preset) => {
                    const parsed = readStoredStyles(preset.styles) ?? [];
                    return <div key={preset.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><span className="block truncate font-black text-slate-900">{preset.name}</span><span className="mt-1 block text-xs text-slate-500">{parsed.map((style) => `${style.name} ${style.settings.fontSize}pt`).join(" · ") || "스타일 정보"}</span></div><div className="flex shrink-0 flex-wrap gap-2"><Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => editStoredPreset(preset)}>편집</Button><Button type="button" variant="outline" size="sm" className={`rounded-xl ${preset.is_public ? "border-emerald-200 text-emerald-700" : ""}`} disabled={presetsBusy} onClick={() => void togglePresetVisibility(preset)}><Globe2 className="size-4" /> {preset.is_public ? "공개 중" : "비공개"}</Button><Button type="button" variant="ghost" size="icon" className="size-9 rounded-xl text-red-500" disabled={presetsBusy} onClick={() => void deleteStoredPreset(preset)} aria-label={`${preset.name} 삭제`}><Trash2 className="size-4" /></Button></div></div></div>;
                  })}
                </div>
              </TabsContent>
              <TabsContent value="equations" className="space-y-5">
                <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4"><h3 className="font-black text-violet-950">자주 쓰는 한글 수식 저장</h3><p className="mt-1 text-xs leading-5 text-violet-800">한글 수식 편집기에서 사용하는 스크립트를 저장합니다. 복사 후 한글에서 Ctrl+N, M을 눌러 붙여넣으세요.</p><div className="mt-4 grid gap-3 sm:grid-cols-[0.8fr_1.8fr_auto]"><input value={equationName} onChange={(event) => setEquationName(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-violet-500" placeholder="수식 이름" /><input value={equationScript} onChange={(event) => setEquationScript(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm outline-none focus:border-violet-500" placeholder="예: {-b +- sqrt{b^2-4ac}} over {2a}" /><Button type="button" className="rounded-xl bg-violet-600" disabled={equationsBusy} onClick={() => void saveEquation()}><Save className="size-4" /> 저장</Button></div></div>
                {equationMessage && <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold leading-6 text-slate-700">{equationMessage}</p>}
                <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-black">저장한 수식</h3><span className="text-xs font-bold text-slate-400">{savedEquations.length}개</span></div>{equationsBusy && savedEquations.length === 0 ? <p className="flex items-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" /> 불러오는 중</p> : savedEquations.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">저장한 수식이 없습니다.</p> : savedEquations.map((equation) => <div key={equation.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4"><div className="min-w-0 flex-1"><p className="font-black">{equation.name}</p><code className="mt-1 block overflow-x-auto whitespace-nowrap text-xs text-slate-500">{equation.script}</code></div><Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => void copyEquation(equation)}><Copy className="size-4" /> 복사</Button><Button type="button" variant="ghost" size="icon" className="size-9 rounded-xl text-red-500" onClick={() => void deleteEquation(equation)} aria-label={`${equation.name} 삭제`}><Trash2 className="size-4" /></Button></div>)}</div>
              </TabsContent>
            </div>
          </Tabs>
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4"><p className="text-xs text-slate-400">계정별로 안전하게 분리되어 저장됩니다.</p><Button type="button" variant="ghost" size="sm" className="rounded-xl text-slate-600" onClick={() => void signOut()}><LogOut className="size-4" /> 로그아웃</Button></div>
        </DialogContent>
      </Dialog>

      {activeService === "converter" && step === "upload" && (
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

      {activeService === "converter" && step === "format" && analysis && (
        <div className="mx-auto max-w-7xl px-5 py-7 lg:px-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-sm font-bold text-blue-600">2 / 3 · 스타일 지정</p><h1 className="mt-1 text-2xl font-black">서식을 고른 뒤 문단을 연속해서 클릭하세요</h1><p className="mt-1 text-sm text-slate-500">먼저 적용할 서식을 선택하고, 아래 문서에서 해당 서식으로 바꿀 문단을 모두 클릭하면 됩니다.</p></div>
            <div className="flex gap-2"><Button type="button" variant="outline" className="rounded-xl" onClick={resetAll}><ArrowLeft className="size-4" /> 다른 파일</Button><Button type="button" variant="outline" className="rounded-xl" onClick={resetAutomaticAssignments}><RotateCcw className="size-4" /> 자동 분류 복원</Button></div>
          </div>

          <div className="grid min-h-[42rem] gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-4">
              <Card className="rounded-3xl border-blue-100 bg-white shadow-sm">
                <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">적용할 서식 선택</CardTitle><CardDescription className="mt-1">{activeStyle ? `${activeStyle.name} 지정 모드 · 아래에서 문단을 여러 개 클릭하세요.` : "적용할 서식을 선택하세요."}</CardDescription></div><span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{styleCounts[activeStyleId] ?? 0}개 지정</span></div></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {styles.map((style) => {
                    const color = stylePalette[style.colorIndex % stylePalette.length];
                    const active = activeStyleId === style.id;
                    return <button key={style.id} type="button" aria-pressed={active} onClick={() => setActiveStyleId(style.id)} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${active ? `${color.badge} ring-2 ring-current` : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}><span className={`size-2.5 rounded-full ${color.dot}`} />{style.name}<span className="text-xs opacity-70">{styleCounts[style.id] ?? 0}</span></button>;
                  })}
                </CardContent>
              </Card>

              <Card className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><CardTitle className="text-lg">문서 미리보기</CardTitle><CardDescription>{fileName} · {fileSize}</CardDescription></div>
                  <div className="flex gap-2 text-xs font-bold"><span className="rounded-full bg-slate-100 px-3 py-1.5">{analysis.styles.sectionCount}구역</span><span className="rounded-full bg-slate-100 px-3 py-1.5">{analysis.styles.paragraphCount}문단</span><span className="rounded-full bg-slate-100 px-3 py-1.5">{analysis.styles.characterCount.toLocaleString()}자</span></div>
                </div>
              </CardHeader>
              <CardContent className="max-h-[calc(100vh-16rem)] min-h-[36rem] overflow-y-auto bg-slate-100 p-5">
                <div className="mx-auto max-w-3xl space-y-2 rounded-sm bg-white p-6 shadow-[0_8px_35px_rgba(15,23,42,0.12)] sm:p-10">
                  <DocumentFlow analysis={analysis} renderParagraph={(paragraph, index) => {
                    const styleId = paragraphAssignments[paragraph.id] ?? "style-2";
                    const paragraphStyle = styles.find((style) => style.id === styleId) ?? styles[0];
                    const color = stylePalette[paragraphStyle.colorIndex % stylePalette.length];
                    const selected = selectedParagraphId === paragraph.id;
                    const textAlign = paragraphStyle.settings.alignment === "가운데" ? "center" : paragraphStyle.settings.alignment === "오른쪽" ? "right" : paragraphStyle.settings.alignment === "양쪽" ? "justify" : "left";
                    return (
                      <button type="button" onClick={() => assignParagraph(paragraph.id)} aria-label={`${paragraph.text.slice(0, 50)} 문단에 ${activeStyle?.name ?? "선택한 서식"} 적용`} className={`group relative w-full rounded-lg border-l-4 text-left ring-1 transition ${paragraph.inTable ? "px-2 py-2" : "px-4 py-3"} ${color.border} ${selected ? `${color.selected} ring-2` : "bg-white ring-transparent hover:bg-slate-50 hover:ring-slate-200"}`}>
                        <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold opacity-80 ${color.badge}`}>{paragraphStyle.name}</span>
                        <span className="mr-2 text-[10px] font-bold text-slate-300">{index + 1}</span>
                        <span className="whitespace-pre-wrap pr-20 text-slate-800" style={{ fontFamily: paragraphStyle.settings.font, fontSize: `${Math.max(11, Math.min(48, Number(paragraphStyle.settings.fontSize) || 11))}px`, fontWeight: paragraphStyle.settings.bold ? 700 : 400, textAlign }}>{paragraph.text}</span>
                      </button>
                    );
                  }} />
                </div>
              </CardContent>
              </Card>
            </div>

            <div className="space-y-4 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-1">
              <Card className="rounded-3xl border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between gap-3"><div><CardTitle className="text-lg">스타일 관리</CardTitle><CardDescription>오른쪽에서 스타일을 만들고 수정하세요.</CardDescription></div>{stylePanelView === "settings" && <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={addStyle}><Plus className="size-4" /> 추가</Button>}</div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                    <button type="button" onClick={() => setStylePanelView("settings")} className={`h-9 rounded-lg text-xs font-extrabold transition ${stylePanelView === "settings" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>서식 설정</button>
                    <button type="button" onClick={() => setStylePanelView("saved")} className={`h-9 rounded-lg text-xs font-extrabold transition ${stylePanelView === "saved" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>내 서식 불러오기</button>
                  </div>
                  {stylePanelView === "settings" ? <>
                    <div className="grid grid-cols-2 gap-2">
                      {styles.map((style, index) => {
                        const color = stylePalette[style.colorIndex % stylePalette.length];
                        return <div key={style.id} className="group relative"><button type="button" onClick={() => setActiveStyleId(style.id)} className={`w-full rounded-xl border p-3 pr-9 text-left transition ${activeStyleId === style.id ? `${color.badge} border-current` : "border-slate-200 hover:bg-slate-50"}`}><span className="flex items-center gap-2 truncate text-xs font-extrabold"><span className={`size-2 shrink-0 rounded-full ${color.dot}`} />{style.name}</span><span className="mt-1 block text-[11px] text-slate-500">{styleCounts[style.id] ?? 0}개 문단</span></button>{index >= 2 && <button type="button" onClick={() => removeStyle(style.id)} aria-label={`${style.name} 삭제`} className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-white/90 text-slate-400 opacity-0 shadow-sm ring-1 ring-slate-200 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100"><X className="size-3.5" /></button>}</div>;
                      })}
                    </div>
                    {activeStyle && (
                      <div className="space-y-4 border-t border-slate-100 pt-4">
                        <input value={activeStyle.name} onChange={(event) => updateStyleName(event.target.value)} aria-label="스타일 이름" className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-500" />
                        <div className="grid grid-cols-2 gap-3">
                          <SettingSelect label="글꼴" value={activeStyle.settings.font} options={selectOptions.font} onValueChange={(value) => updateStyleSettings("font", value)} />
                          <div className="space-y-2"><label htmlFor="document-font-size" className="text-sm font-semibold text-slate-700">글자 크기</label><div className="relative"><input id="document-font-size" type="number" min="1" max="80" step="0.5" value={activeStyle.settings.fontSize} onChange={(event) => updateStyleSettings("fontSize", event.target.value)} onBlur={(event) => updateStyleSettings("fontSize", String(Math.min(80, Math.max(1, Number(event.target.value) || 1))))} className="h-10 w-full rounded-xl border border-slate-200 px-3 pr-8 text-sm outline-none focus:border-blue-500" /><span className="absolute right-3 top-2.5 text-xs text-slate-400">pt</span></div></div>
                          <SettingSelect label="줄 간격" value={activeStyle.settings.lineSpacing} options={selectOptions.lineSpacing} suffix="%" onValueChange={(value) => updateStyleSettings("lineSpacing", value)} />
                          <SettingSelect label="들여쓰기" value={activeStyle.settings.indentation} options={selectOptions.indentation} suffix="pt" onValueChange={(value) => updateStyleSettings("indentation", value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">{[false, true].map((bold) => <button key={String(bold)} type="button" onClick={() => updateStyleSettings("bold", bold)} className={`h-9 rounded-lg text-xs font-bold ${activeStyle.settings.bold === bold ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{bold ? "굵게" : "보통"}</button>)}</div>
                        <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">{[["왼쪽", AlignLeft], ["가운데", AlignCenter], ["오른쪽", AlignRight], ["양쪽", AlignJustify]].map(([label, Icon]) => <button key={label as string} type="button" title={label as string} onClick={() => updateStyleSettings("alignment", label as string)} className={`grid h-9 place-items-center rounded-lg ${activeStyle.settings.alignment === label ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}><Icon className="size-4" /></button>)}</div>
                      </div>
                    )}
                  </> : <div className="space-y-3">{!currentUser ? <div className="rounded-2xl bg-blue-50 p-4 text-center"><p className="text-sm font-semibold leading-6 text-blue-900">로그인하면 저장한 서식을 바로 불러올 수 있습니다.</p><Button type="button" size="sm" className="mt-3 rounded-xl bg-blue-600" onClick={() => { setAuthMode("signin"); setAuthOpen(true); }}><LogIn className="size-4" /> 로그인</Button></div> : presetsBusy && storedPresets.length === 0 ? <p className="flex items-center gap-2 py-5 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" /> 내 서식을 불러오는 중</p> : storedPresets.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">저장한 서식이 없습니다. 마이페이지에서 만들어 보세요.</p> : storedPresets.map((preset) => <button key={preset.id} type="button" onClick={() => { loadStoredPreset(preset); setStylePanelView("settings"); }} className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"><span className="block truncate text-sm font-black">{preset.name}</span><span className="mt-1 block text-xs text-slate-500">클릭해서 현재 문서에 적용</span></button>)}</div>}
                </CardContent>
              </Card>
              {applyError && <div className="flex gap-2 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700"><AlertCircle className="size-4 shrink-0" />{applyError}</div>}
              <Button type="button" size="lg" className="h-12 w-full rounded-2xl bg-blue-600 text-base" disabled={applying} onClick={applyFormatting}>{applying ? <LoaderCircle className="size-5 animate-spin" /> : <Sparkles className="size-5" />}{applying ? "문단별 스타일 적용 중" : "스타일 적용하고 결과 보기"}</Button>
            </div>
          </div>
        </div>
      )}

      {activeService === "converter" && step === "result" && convertedFile && analysis && (
        <div className="mx-auto min-h-[calc(100vh-4rem)] max-w-7xl px-5 py-8 lg:px-8">
          <section>
            <div className="flex flex-col gap-5 rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><Check className="size-6" /></div>
                <div><p className="text-sm font-bold text-emerald-600">3 / 3 · 변환 완료</p><h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">원본과 변환 결과를 비교해 보세요</h1><p className="mt-2 text-sm text-slate-500">문단 서식과 표의 행·열·병합 셀을 반영한 미리보기입니다. 이미지는 한글에서 최종 확인해 주세요.</p></div>
              </div>
              <Button type="button" size="lg" className="h-12 shrink-0 rounded-xl bg-blue-600 px-6" onClick={downloadConvertedFile}><Download className="size-5" /> HWPX 다운로드</Button>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <ComparisonPreview title="기존 문서" badge="변환 전" analysis={analysis} accent="slate" />
              <ComparisonPreview title="변환한 문서" badge="변환 후" analysis={convertedFile.analysis} accent="blue" />
            </div>

            <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-500"><span className="rounded-full bg-slate-100 px-3 py-1.5">{convertedFile.analysis.styles.paragraphCount}개 문단</span><span className="rounded-full bg-slate-100 px-3 py-1.5">{styles.length}개 스타일</span><span className="rounded-full bg-slate-100 px-3 py-1.5">{convertedFile.analysis.styles.characterCount.toLocaleString()}자</span><span className="self-center pl-1 font-semibold text-slate-400">{convertedFile.fileName}</span></div>
              <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="rounded-xl" onClick={() => setStep("format")}><ArrowLeft className="size-4" /> 스타일 다시 수정</Button><Button type="button" variant="ghost" className="rounded-xl" onClick={resetAll}><RotateCcw className="size-4" /> 새 문서 변환</Button></div>
            </div>
          </section>
        </div>
      )}
      {activeService === "shortcuts" && <ShortcutDictionary />}
      {activeService === "community" && <StyleCommunity currentUser={currentUser} onLoginRequired={() => { setAuthMode("signin"); setAuthOpen(true); }} onImported={() => void refreshStoredPresets(currentUser?.id)} />}
    </main>
  );
}
