"use client";

import { useMemo, useState } from "react";
import { Keyboard, Search } from "lucide-react";
import { hwpShortcuts } from "@/lib/hwp-shortcuts";

const categories = ["전체", "글자", "문단", "삽입", "찾기", "보기", "파일"] as const;

export function ShortcutDictionary() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("전체");
  const normalized = query.trim().toLowerCase().replace(/\s/g, "");
  const results = useMemo(() => hwpShortcuts.filter((shortcut) => {
    if (category !== "전체" && shortcut.category !== category) return false;
    if (!normalized) return true;
    return [shortcut.title, shortcut.description, ...shortcut.keywords, shortcut.keys.join("")]
      .some((value) => value.toLowerCase().replace(/\s/g, "").includes(normalized));
  }), [category, normalized]);

  return (
    <section className="mx-auto min-h-[calc(100vh-4rem)] max-w-6xl px-5 py-12 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-violet-100 text-violet-700"><Keyboard className="size-6" /></div>
        <h1 className="mt-5 text-3xl font-black tracking-[-0.04em] sm:text-4xl">찾고 싶은 한글 기능을 입력하세요</h1>
        <p className="mt-3 leading-7 text-slate-600">‘아래첨자’, ‘가운데 정렬’, ‘수식’처럼 기능 이름으로 검색하면 단축키를 바로 확인할 수 있습니다.</p>
        <label className="mt-7 flex h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 text-left shadow-[0_16px_50px_-32px_rgba(15,23,42,0.45)] focus-within:border-violet-400">
          <Search className="size-5 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-base outline-none" placeholder="예: 아래첨자" autoFocus />
          <span className="hidden text-xs font-semibold text-slate-400 sm:inline">{results.length}개 결과</span>
        </label>
      </div>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        {categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`rounded-full px-4 py-2 text-sm font-bold transition ${category === item ? "bg-violet-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-violet-50"}`}>{item}</button>)}
      </div>
      {results.length > 0 ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {results.map((shortcut) => (
            <article key={shortcut.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between gap-4"><div><span className="text-xs font-extrabold text-violet-600">{shortcut.category}</span><h2 className="mt-1 text-lg font-black">{shortcut.title}</h2></div><div className="flex flex-wrap justify-end gap-1">{shortcut.keys.map((key, index) => <span key={`${key}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-xs font-bold text-slate-700 shadow-[0_2px_0_#cbd5e1]">{key}</span>)}</div></div>
              <p className="mt-4 text-sm leading-6 text-slate-500">{shortcut.description}</p>
            </article>
          ))}
        </div>
      ) : <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center"><p className="font-bold text-slate-700">일치하는 단축키가 없습니다.</p><p className="mt-2 text-sm text-slate-500">조금 더 짧은 기능 이름으로 검색해 보세요.</p></div>}
      <p className="mt-8 text-center text-xs text-slate-400">한컴오피스 한글 공식 도움말의 Windows 단축키를 기준으로 정리했습니다.</p>
    </section>
  );
}

