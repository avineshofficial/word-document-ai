'use client';
import { useState, useEffect } from 'react';
import { ListTree, MessageSquare, User, BookOpen } from 'lucide-react';
import TocEditor from '@/components/TocEditor';
import ContentGenerator from '@/components/ContentGenerator';
import { Toaster } from 'sonner';

// ── Shared Types ──────────────────────────────────────────────────────────────
export interface Heading {
  sno: string;
  text: string;
  level: number;
}

export interface ChatEntry {
  sno: string;
  title: string;
  content: string;
  reference: string;
  wordCount: number;
}

// ── Storage keys ──────────────────────────────────────────────────────────────
const STORE = {
  TAB:          'docgen_activeTab',
  TOC:          'docgen_tocHeadings',
  CHAT:         'docgen_chatHistory',
  STUDENT:      'docgen_studentName',
  MODE:         'docgen_mode',
  PAGES:        'docgen_targetPages',
  WORDS:        'docgen_wordsPerHeading',
  SELECTED_IDX: 'docgen_selectedIdx',
};

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = localStorage.getItem(key);
    return v !== null ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const [activeTab,   setActiveTab]   = useState<'toc' | 'generate'>(() => load(STORE.TAB, 'toc'));
  const [tocHeadings, setTocHeadings] = useState<Heading[]>(()        => load(STORE.TOC, []));
  const [chatHistory, setChatHistory] = useState<ChatEntry[]>(()      => load(STORE.CHAT, []));
  const [studentName, setStudentName] = useState<string>(()           => load(STORE.STUDENT, ''));

  // Persist every change
  useEffect(() => { save(STORE.TAB,     activeTab);   }, [activeTab]);
  useEffect(() => { save(STORE.TOC,     tocHeadings); }, [tocHeadings]);
  useEffect(() => { save(STORE.CHAT,    chatHistory); }, [chatHistory]);
  useEffect(() => { save(STORE.STUDENT, studentName); }, [studentName]);

  const handleTocUpdate = (headings: Heading[]) => {
    setTocHeadings(headings);
    // Don't auto-navigate — let user stay on TOC tab to see the preview
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <Toaster position="top-right" richColors theme="light" />

      {/* ── Navbar ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center font-bold text-white text-sm">
              AI
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-800 leading-none">
                Word Document Generator
              </h1>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                MCA Project Report · Powered by Claude AI
              </p>
            </div>
          </div>

          {/* Student name — persisted */}
          <div className="flex items-center bg-slate-100 rounded-full px-4 py-1.5 border border-slate-200">
            <User size={13} className="text-slate-400 mr-2 flex-shrink-0" />
            <input
              placeholder="Enter Student Name..."
              value={studentName}
              onChange={e => setStudentName(e.target.value)}
              className="bg-transparent text-xs font-bold outline-none w-44 placeholder:text-slate-400"
            />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 md:grid-cols-4 gap-8">

        {/* ── Sidebar ── */}
        <div className="md:col-span-1 space-y-2">
          <TabBtn
            active={activeTab === 'toc'}
            onClick={() => setActiveTab('toc')}
            icon={<ListTree size={18} />}
            label="1. Paste TOC"
            badge={tocHeadings.length > 0 ? `${tocHeadings.length} headings` : undefined}
          />
          <TabBtn
            active={activeTab === 'generate'}
            onClick={() => setActiveTab('generate')}
            icon={<MessageSquare size={18} />}
            label="2. Generate"
            badge={chatHistory.length > 0
              ? `${chatHistory.length}/${tocHeadings.filter(h => h.level !== 1).length} done`
              : undefined}
          />

          {/* Session restore notice */}
          {(tocHeadings.length > 0 || chatHistory.length > 0) && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-bold text-emerald-700 flex items-center gap-1.5">
                <BookOpen size={11} /> Session restored
              </p>
              <p className="text-[9px] text-emerald-600 mt-0.5">
                Your progress is saved automatically. Refreshing won't lose your work.
              </p>
            </div>
          )}
        </div>

        {/* ── Content area ── */}
        <div className="md:col-span-3 bg-white border border-slate-200 rounded-3xl shadow-sm min-h-[75vh] p-8">
          {activeTab === 'toc' && (
            <div className="animate-in fade-in duration-300">
              <TocEditor
                onUpdate={handleTocUpdate}
                initialHeadings={tocHeadings}
                onContinue={() => setActiveTab('generate')}
              />
            </div>
          )}

          {activeTab === 'generate' && (
            <div className="animate-in fade-in duration-300">
              <ContentGenerator
                tocHeadings={tocHeadings}
                chatHistory={chatHistory}
                setChatHistory={setChatHistory}
                studentName={studentName}
                storeKeys={STORE}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label, badge }: {
  active: boolean; onClick: () => void;
  icon: React.ReactNode; label: string; badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl font-bold text-sm transition-all border ${
        active
          ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200 scale-[1.02]'
          : 'text-slate-500 hover:bg-slate-100 border-transparent'
      }`}
    >
      <span className="flex items-center space-x-3">
        {icon}
        <span>{label}</span>
      </span>
      {badge && (
        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
          active ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-600'
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}