"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Download, Globe2, LoaderCircle, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { readStoredStyles, type StoredStylePreset } from "@/lib/style-presets";

type Props = {
  currentUser: User | null;
  onLoginRequired: () => void;
  onImported: () => void;
};

export function StyleCommunity({ currentUser, onLoginRequired, onImported }: Props) {
  const supabase = getSupabaseBrowserClient();
  const [presets, setPresets] = useState<StoredStylePreset[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadCommunity = useCallback(async () => {
    if (!supabase) { setBusy(false); setMessage("Supabase 연결이 필요합니다."); return; }
    setBusy(true);
    const { data, error } = await supabase.from("style_presets").select("*").eq("is_public", true).order("updated_at", { ascending: false });
    setBusy(false);
    if (error) { setMessage("커뮤니티 데이터베이스 설정이 아직 필요합니다. 마이페이지 안내에 따라 SQL을 한 번 실행해 주세요."); return; }
    setPresets((data ?? []) as StoredStylePreset[]);
  }, [supabase]);

  useEffect(() => {
    // 외부 데이터 원본과 커뮤니티 목록을 동기화합니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCommunity();
  }, [loadCommunity]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return presets;
    return presets.filter((preset) => `${preset.name} ${preset.description ?? ""} ${preset.author_name ?? ""}`.toLowerCase().includes(needle));
  }, [presets, query]);

  const importPreset = async (preset: StoredStylePreset) => {
    if (!currentUser) { onLoginRequired(); return; }
    if (!supabase) return;
    const parsed = readStoredStyles(preset.styles);
    if (!parsed) { setMessage("이 서식의 데이터 형식을 읽을 수 없습니다."); return; }
    setImportingId(preset.id);
    setMessage(null);
    const copyName = `${preset.name} · 가져옴`;
    const { error } = await supabase.from("style_presets").upsert({ user_id: currentUser.id, name: copyName, styles: parsed, is_public: false, description: preset.description ?? "", author_name: "익명 사용자", updated_at: new Date().toISOString() }, { onConflict: "user_id,name" });
    setImportingId(null);
    if (error) { setMessage(`내 서식으로 가져오지 못했습니다: ${error.message}`); return; }
    setMessage(`‘${preset.name}’을(를) 내 서식에 추가했습니다.`);
    onImported();
  };

  return (
    <section className="mx-auto min-h-[calc(100vh-4rem)] max-w-7xl px-5 py-10 lg:px-8">
      <div className="flex flex-col gap-6 rounded-[2rem] bg-gradient-to-br from-blue-700 to-indigo-700 p-7 text-white sm:p-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl"><div className="flex items-center gap-2 text-sm font-extrabold text-blue-100"><Users className="size-5" /> 서식 커뮤니티</div><h1 className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">좋은 보고서 서식을 함께 나눠요</h1><p className="mt-3 leading-7 text-blue-100">소제목과 본문에 어울리는 글꼴, 크기, 들여쓰기 등을 미리 구성한 서식을 찾아 내 보관함에 담을 수 있습니다.</p></div>
        <label className="flex h-12 w-full items-center gap-3 rounded-2xl bg-white px-4 text-slate-900 lg:max-w-sm"><Search className="size-5 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 outline-none" placeholder="서식 이름이나 설명 검색" /></label>
      </div>
      {message && <p className="mt-5 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold leading-6 text-blue-800">{message}</p>}
      {busy ? <div className="grid min-h-72 place-items-center"><p className="flex items-center gap-2 text-sm font-semibold text-slate-500"><LoaderCircle className="size-5 animate-spin" /> 공개 서식을 불러오는 중</p></div> : filtered.length === 0 ? (
        <div className="mt-7 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center"><Globe2 className="mx-auto size-9 text-slate-300" /><p className="mt-4 font-black text-slate-700">아직 표시할 공개 서식이 없습니다.</p><p className="mt-2 text-sm text-slate-500">마이페이지의 ‘나의 서식’에서 서식을 공개하면 이곳에 나타납니다.</p></div>
      ) : (
        <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((preset) => {
            const parsed = readStoredStyles(preset.styles) ?? [];
            return <article key={preset.id} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><span className="text-xs font-extrabold text-blue-600">{preset.author_name || "익명 사용자"}</span><h2 className="mt-1 text-xl font-black">{preset.name}</h2></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">공개 서식</span></div><p className="mt-3 min-h-12 text-sm leading-6 text-slate-500">{preset.description || "작성자가 등록한 서식 묶음입니다."}</p><div className="mt-4 space-y-2">{parsed.slice(0, 3).map((style) => <div key={style.id} className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-extrabold">{style.name}</span><span className="shrink-0 text-xs text-slate-500">{style.settings.fontSize}pt · {style.settings.bold ? "굵게" : "보통"}</span></div><p className="mt-1 text-xs text-slate-500">{style.settings.font} · {style.settings.alignment} 정렬 · 들여쓰기 {style.settings.indentation}pt</p></div>)}</div><Button type="button" className="mt-5 h-11 w-full rounded-xl bg-blue-600" disabled={importingId === preset.id} onClick={() => void importPreset(preset)}>{importingId === preset.id ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} 내 서식으로 가져오기</Button></article>;
          })}
        </div>
      )}
    </section>
  );
}

