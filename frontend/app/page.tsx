'use client';
import { useState, useEffect } from 'react';
import { ListTree, MessageSquare, User, BookOpen, FileText, Beaker, Menu, X, Trash2 } from 'lucide-react';
import TocEditor from '@/components/TocEditor';
import ContentGenerator from '@/components/ContentGenerator';
import LabReportGenerator, { LabReport } from '@/components/LabReportGenerator';
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
  GENERATOR_MODE: 'docgen_generatorMode',
};

const STORE_LAB = {
  TAB:          'labgen_activeTab',
  TOC:          'labgen_tocHeadings',
  CHAT:         'labgen_chatHistory',
  STUDENT:      'labgen_studentName',
  MODE:         'labgen_mode',
  PAGES:        'labgen_targetPages',
  WORDS:        'labgen_wordsPerHeading',
  SELECTED_IDX: 'labgen_selectedIdx',
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [generatorMode, setGeneratorMode] = useState<'project' | 'lab'>('project');
  
  // Project Report state
  const [activeTab,   setActiveTab]   = useState<'toc' | 'generate'>('toc');
  const [tocHeadings, setTocHeadings] = useState<Heading[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatEntry[]>([]);
  const [studentName, setStudentName] = useState<string>('');

  // Lab Report state
  const [labActiveTab,   setLabActiveTab]   = useState<'toc' | 'generate'>('toc');
  const [labTocHeadings, setLabTocHeadings] = useState<Heading[]>([]);
  const [labChatHistory, setLabChatHistory] = useState<ChatEntry[]>([]);
  const [labStudentName, setLabStudentName] = useState<string>('');
  const [labReportData, setLabReportData] = useState<LabReport | null>(null);

  // Load persisted state only on the client to avoid SSR hydration mismatch.
  useEffect(() => {
    setGeneratorMode(load(STORE.GENERATOR_MODE, 'project'));
    setActiveTab(load(STORE.TAB, 'toc'));
    setTocHeadings(load(STORE.TOC, []));
    setChatHistory(load(STORE.CHAT, []));
    setStudentName(load(STORE.STUDENT, ''));
    
    setLabActiveTab(load(STORE_LAB.TAB, 'toc'));
    setLabTocHeadings(load(STORE_LAB.TOC, []));
    setLabChatHistory(load(STORE_LAB.CHAT, []));
    setLabStudentName(load(STORE_LAB.STUDENT, ''));
  }, []);

  // Persist every change - Project Report
  useEffect(() => { save(STORE.GENERATOR_MODE, generatorMode); }, [generatorMode]);
  useEffect(() => { save(STORE.TAB,     activeTab);   }, [activeTab]);
  useEffect(() => { save(STORE.TOC,     tocHeadings); }, [tocHeadings]);
  useEffect(() => { save(STORE.CHAT,    chatHistory); }, [chatHistory]);
  useEffect(() => { save(STORE.STUDENT, studentName); }, [studentName]);

  // Persist every change - Lab Report
  useEffect(() => { save(STORE_LAB.TAB,     labActiveTab);   }, [labActiveTab]);
  useEffect(() => { save(STORE_LAB.TOC,     labTocHeadings); }, [labTocHeadings]);
  useEffect(() => { save(STORE_LAB.CHAT,    labChatHistory); }, [labChatHistory]);
  useEffect(() => { save(STORE_LAB.STUDENT, labStudentName); }, [labStudentName]);

  const handleProjectReset = () => {
    if (confirm("Are you sure you want to start over? All project report data will be cleared.")) {
      setTocHeadings([]);
      setChatHistory([]);
      setStudentName('');
      setActiveTab('toc');
    }
  };

  const handleTocUpdate = (headings: Heading[]) => {
    setTocHeadings(headings);
  };

  const handleLabTocUpdate = (headings: Heading[]) => {
    setLabTocHeadings(headings);
  };

  const isProjectMode = generatorMode === 'project';

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <Toaster position="top-right" richColors theme="light" />

      {/* ── Navbar ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-2 hover:bg-slate-100 rounded-lg transition"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center font-bold text-white text-sm">
              AI
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-800 leading-none">
                {isProjectMode ? 'Project Report Generator' : 'Lab Report Generator'}
              </h1>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                {isProjectMode ? 'MCA Project Report · Powered by Claude AI' : 'Lab Report · Powered by Claude AI'}
              </p>
            </div>
          </div>

          {/* Student name — persisted */}
          <div className="flex items-center bg-slate-100 rounded-full px-4 py-1.5 border border-slate-200">
            <User size={13} className="text-slate-400 mr-2 flex-shrink-0" />
            <input
              placeholder="Enter Student Name..."
              value={isProjectMode ? studentName : labStudentName}
              onChange={e => isProjectMode ? setStudentName(e.target.value) : setLabStudentName(e.target.value)}
              className="bg-transparent text-xs font-bold outline-none w-44 placeholder:text-slate-400"
            />
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar Navigation ── */}
        <aside className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } md:w-64 bg-white border-r border-slate-200 overflow-y-auto transition-all duration-300 shadow-lg md:shadow-none flex-shrink-0`}>
          <div className="p-6 space-y-2">
            <div className="px-4 py-2 mb-6">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Generators</p>
            </div>
            
            <NavOption
              icon={<FileText size={20} />}
              label="Project Report"
              description="MCA Project Report"
              active={isProjectMode}
              onClick={() => {
                setGeneratorMode('project');
                setSidebarOpen(false);
              }}
              color="indigo"
            />
            
            <NavOption
              icon={<Beaker size={20} />}
              label="Lab Report"
              description="Lab Report Generator"
              active={!isProjectMode}
              onClick={() => {
                setGeneratorMode('lab');
                setSidebarOpen(false);
              }}
              color="purple"
            />
          </div>
        </aside>

        {/* ── Main Content ── */}
        {/* ── Main Content ── */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* ── Project Report Generator ── */}
          {isProjectMode && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
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
                    <p className="text-[9px] text-emerald-600 mt-0.5 mb-2.5">
                      Your progress is saved automatically. Refreshing won't lose your work.
                    </p>
                    <button onClick={handleProjectReset} className="w-full py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 hover:bg-red-100 transition-colors">
                      <Trash2 size={12} /> Start Over
                    </button>
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
            </div>
          )}

          {/* ── Lab Report Generator ── */}
          {!isProjectMode && (
            <div className="w-full">
              <LabReportGenerator
                initialData={labReportData || undefined}
                onSave={setLabReportData}
                studentName={labStudentName}
                storeKeys={STORE_LAB}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label, badge, colorScheme = 'indigo' }: {
  active: boolean; onClick: () => void;
  icon: React.ReactNode; label: string; badge?: string; colorScheme?: 'indigo' | 'purple';
}) {
  const colors = {
    indigo: {
      active: 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200 scale-[1.02]',
      badge: 'bg-white/20 text-white'
    },
    purple: {
      active: 'bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-200 scale-[1.02]',
      badge: 'bg-white/20 text-white'
    }
  };

  const badgeColorInactive = colorScheme === 'purple' 
    ? 'bg-purple-100 text-purple-600' 
    : 'bg-indigo-100 text-indigo-600';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl font-bold text-sm transition-all border ${
        active
          ? colors[colorScheme].active
          : 'text-slate-500 hover:bg-slate-100 border-transparent'
      }`}
    >
      <span className="flex items-center space-x-3">
        {icon}
        <span>{label}</span>
      </span>
      {badge && (
        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
          active ? colors[colorScheme].badge : badgeColorInactive
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}

function NavOption({ 
  icon, 
  label, 
  description, 
  active, 
  onClick, 
  color = 'indigo' 
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
  color?: 'indigo' | 'purple';
}) {
  const colorClasses = {
    indigo: {
      active: 'bg-indigo-50 border-indigo-300 text-indigo-900',
      inactive: 'border-slate-200 text-slate-700 hover:bg-slate-50'
    },
    purple: {
      active: 'bg-purple-50 border-purple-300 text-purple-900',
      inactive: 'border-slate-200 text-slate-700 hover:bg-slate-50'
    }
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg border transition-all ${
        active ? colorClasses[color].active : colorClasses[color].inactive
      }`}
    >
      <div className={`flex-shrink-0 ${active ? (color === 'indigo' ? 'text-indigo-600' : 'text-purple-600') : 'text-slate-400'}`}>
        {icon}
      </div>
      <div className="text-left">
        <p className="font-semibold text-sm">{label}</p>
        <p className="text-[11px] text-slate-500">{description}</p>
      </div>
    </button>
  );
}