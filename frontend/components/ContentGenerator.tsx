'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  Bot, Send, Loader2, Calculator, Sparkles,
  FileDown, Eye, EyeOff, Trash2, BookOpen, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Heading, ChatEntry } from '@/app/page';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Props {
  tocHeadings:    Heading[];
  chatHistory:    ChatEntry[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatEntry[]>>;
  studentName:    string;
  storeKeys:      Record<string, string>;
}

// ── localStorage helpers ──────────────────────────────────────────────────────
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

// ── Ollama API via Backend ────────────────────────────────────────────────────────────────
async function generateWithClaude(
  heading: Heading, reference: string, targetWords: number,
): Promise<string> {
  const res = await fetch('http://localhost:8000/api/generate-content', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      section_number: heading.sno,
      heading: heading.text,
      reference,
      target_words: targetWords,
    }),
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Failed to generate content');
  }
  
  const data = await res.json();
  return data.content;
}

// ── XML helpers ───────────────────────────────────────────────────────────────
const escXml = (s: string) =>
  s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function xmlPara(text: string, opts: {
  bold?: boolean; size?: number; center?: boolean;
  indent?: boolean; spaceBefore?: number; spaceAfter?: number;
} = {}) {
  const { bold=false, size=24, center=false, indent=false, spaceBefore=0, spaceAfter=120 } = opts;
  return `<w:p>
<w:pPr>
  <w:jc w:val="${center ? 'center' : 'both'}"/>
  <w:spacing w:before="${spaceBefore}" w:after="${spaceAfter}" w:line="360" w:lineRule="auto"/>
  ${indent ? '<w:ind w:firstLine="720"/>' : ''}
</w:pPr>
<w:r>
  <w:rPr>
    <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
    <w:sz w:val="${size}"/>
    ${bold ? '<w:b/>' : ''}
  </w:rPr>
  <w:t xml:space="preserve">${escXml(text)}</w:t>
</w:r>
</w:p>`;
}

const pageBreak = () => `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

function tocRow(sno: string, title: string, isHeader=false, isLevel1=false) {
  const bg   = isHeader ? 'D3D3D3' : 'FFFFFF';
  const bold = isHeader || isLevel1;
  const disp = isLevel1 && !isHeader ? title.toUpperCase() : title;
  const ind  = !isHeader && !isLevel1 ? '<w:ind w:left="500"/>' : '';
  const bdr  = `<w:top w:val="single" w:sz="4" w:color="000000"/>
                <w:left w:val="single" w:sz="4" w:color="000000"/>
                <w:bottom w:val="single" w:sz="4" w:color="000000"/>
                <w:right w:val="single" w:sz="4" w:color="000000"/>`;
  const cell = (w: number, jc: string, t: string, extra='') =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>
      <w:shd w:val="clear" w:color="auto" w:fill="${bg}"/>
      <w:tcBorders>${bdr}</w:tcBorders></w:tcPr>
      <w:p><w:pPr><w:jc w:val="${jc}"/>${extra}</w:pPr>
        <w:r><w:rPr>
          <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
          <w:sz w:val="22"/>${bold ? '<w:b/>' : ''}
        </w:rPr><w:t xml:space="preserve">${escXml(t)}</w:t></w:r>
      </w:p></w:tc>`;
  return `<w:tr><w:trPr><w:cantSplit/></w:trPr>
    ${cell(900,  'center', sno)}
    ${cell(7200, 'left',   disp, ind)}
    ${cell(1260, 'center', isHeader ? 'PAGE NO' : '')}
  </w:tr>`;
}

// ── CRC32 + ZIP builder ───────────────────────────────────────────────────────
function crc32(d: Uint8Array): number {
  const t = new Uint32Array(256);
  for (let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[i]=c;}
  let c=0xFFFFFFFF;
  for(const b of d)c=t[(c^b)&0xFF]^(c>>>8);
  return(c^0xFFFFFFFF)>>>0;
}

function buildZip(files: [string, string][]): Uint8Array {
  const enc=new TextEncoder();
  const entries:Uint8Array[]=[];
  const locals:{nb:Uint8Array;db:Uint8Array;cr:number;off:number}[]=[];
  let off=0;
  for(const[name,content]of files){
    const nb=enc.encode(name);
    const db=enc.encode(content);
    const cr=crc32(db);
    const h=new Uint8Array(30+nb.length);
    const dv=new DataView(h.buffer);
    dv.setUint32(0,0x04034b50,true);dv.setUint16(4,20,true);
    dv.setUint32(14,cr,true);dv.setUint32(18,db.length,true);
    dv.setUint32(22,db.length,true);dv.setUint16(26,nb.length,true);
    h.set(nb,30);
    locals.push({nb,db,cr,off});entries.push(h,db);off+=h.length+db.length;
  }
  const cds:Uint8Array[]=[];
  locals.forEach(({nb,db,cr,off:o})=>{
    const cd=new Uint8Array(46+nb.length);
    const dv=new DataView(cd.buffer);
    dv.setUint32(0,0x02014b50,true);dv.setUint16(4,20,true);dv.setUint16(6,20,true);
    dv.setUint32(16,cr,true);dv.setUint32(20,db.length,true);dv.setUint32(24,db.length,true);
    dv.setUint16(28,nb.length,true);dv.setUint32(42,o,true);cd.set(nb,46);cds.push(cd);
  });
  const cdb=cds.reduce((a,b)=>{const r=new Uint8Array(a.length+b.length);r.set(a);r.set(b,a.length);return r;},new Uint8Array(0));
  const eocd=new Uint8Array(22);const dv=new DataView(eocd.buffer);
  dv.setUint32(0,0x06054b50,true);dv.setUint16(8,locals.length,true);dv.setUint16(10,locals.length,true);
  dv.setUint32(12,cdb.length,true);dv.setUint32(16,off,true);
  const parts=[...entries,cdb,eocd];
  const total=parts.reduce((s,p)=>s+p.length,0);
  const out=new Uint8Array(total);let pos=0;
  for(const p of parts){out.set(p,pos);pos+=p.length;}
  return out;
}

// ── DOCX builder ──────────────────────────────────────────────────────────────
function buildDocx(toc: Heading[], hist: ChatEntry[], name: string): Uint8Array {
  const cmap: Record<string,string> = {};
  hist.forEach(c => { cmap[c.title] = c.content; });

  let body = '';
  // Cover
  body += xmlPara('PROJECT REPORT', { bold:true, size:44, center:true, spaceBefore:2000, spaceAfter:400 });
  if (name) body += xmlPara(`Submitted by:\n${name}`, { size:28, center:true, spaceAfter:200 });
  body += pageBreak();

  // TOC
  body += xmlPara('TABLE OF CONTENTS', { bold:true, size:28, center:true, spaceBefore:200, spaceAfter:400 });
  body += `<w:tbl>
<w:tblPr>
  <w:tblStyle w:val="TableGrid"/>
  <w:tblW w:w="9360" w:type="dxa"/>
  <w:tblBorders>
    <w:top w:val="single" w:sz="4" w:color="000000"/>
    <w:left w:val="single" w:sz="4" w:color="000000"/>
    <w:bottom w:val="single" w:sz="4" w:color="000000"/>
    <w:right w:val="single" w:sz="4" w:color="000000"/>
    <w:insideH w:val="single" w:sz="4" w:color="000000"/>
    <w:insideV w:val="single" w:sz="4" w:color="000000"/>
  </w:tblBorders>
</w:tblPr>
<w:tblGrid>
  <w:gridCol w:w="900"/>
  <w:gridCol w:w="7200"/>
  <w:gridCol w:w="1260"/>
</w:tblGrid>
${tocRow('S. No','TITLE',true)}
${toc.map(h => tocRow(h.sno, h.text, false, h.level===1)).join('\n')}
</w:tbl>`;
  body += pageBreak();

  // Content — page break BEFORE each chapter (except first); sub-sections flow below
  let firstChapter = true;
  toc.forEach(h => {
    if (h.level === 1) {
      if (!firstChapter) body += pageBreak();
      firstChapter = false;
      body += xmlPara(`CHAPTER ${h.sno} - ${h.text.toUpperCase()}`,
        { bold:true, size:28, center:true, spaceBefore:480, spaceAfter:360 });
      return;
    }
    body += xmlPara(`${h.sno} ${h.text}`,
      { bold:true, size:24, spaceBefore:240, spaceAfter:160 });
    const content = cmap[h.text] ?? '';
    content.split(/\n\n+/).forEach(pt => {
      if (pt.trim()) body += xmlPara(pt.trim(), { spaceAfter:120 });
    });
  });

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  mc:Ignorable="w14">
<w:body>
${body}
<w:sectPr>
  <w:pgSz w:w="12240" w:h="15840"/>
  <w:pgMar w:top="1440" w:right="1080" w:bottom="1440" w:left="1800"/>
</w:sectPr>
</w:body>
</w:document>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/>
<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr>
</w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/>
<w:tblPr><w:tblBorders>
  <w:top w:val="single" w:sz="4" w:color="000000"/>
  <w:left w:val="single" w:sz="4" w:color="000000"/>
  <w:bottom w:val="single" w:sz="4" w:color="000000"/>
  <w:right w:val="single" w:sz="4" w:color="000000"/>
  <w:insideH w:val="single" w:sz="4" w:color="000000"/>
  <w:insideV w:val="single" w:sz="4" w:color="000000"/>
</w:tblBorders></w:tblPr>
</w:style>
</w:styles>`;

  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:defaultTabStop w:val="720"/>
</w:settings>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1"
  Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
  Target="word/document.xml"/>
</Relationships>`;

  const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1"
  Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"
  Target="styles.xml"/>
<Relationship Id="rId2"
  Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings"
  Target="settings.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml"  ContentType="application/xml"/>
<Override PartName="/word/document.xml"
  ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml"
  ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml"
  ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>`;

  return buildZip([
    ['[Content_Types].xml',          contentTypes],
    ['_rels/.rels',                  rels],
    ['word/document.xml',            docXml],
    ['word/styles.xml',              styles],
    ['word/settings.xml',            settings],
    ['word/_rels/document.xml.rels', wordRels],
  ]);
}

// ── Document Structure Preview Modal ─────────────────────────────────────────
function StructurePreview({
  toc, history, onClose,
}: { toc: Heading[]; history: ChatEntry[]; onClose: () => void }) {
  const completedSns = new Set(history.map(c => c.sno));
  const subCount     = toc.filter(h => h.level !== 1).length;
  const doneCount    = history.length;
  const totalWords   = history.reduce((s, c) => s + c.wordCount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="font-black text-slate-800 text-base">Document Structure Preview</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {doneCount}/{subCount} sections generated · ~{totalWords.toLocaleString()} words · ~{Math.round(totalWords/400)} pages
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-6 py-3 border-b border-slate-100">
          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1.5">
            <span>COMPLETION</span>
            <span>{subCount > 0 ? Math.round((doneCount/subCount)*100) : 0}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all"
              style={{ width: `${subCount > 0 ? (doneCount/subCount)*100 : 0}%` }}
            />
          </div>
        </div>

        {/* Structure list */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-1">
          {/* Fixed pages */}
          {['Cover Page', 'Table of Contents'].map(p => (
            <div key={p} className="flex items-center gap-3 py-2 px-3 bg-amber-50 border border-amber-100 rounded-xl">
              <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-[9px] font-black">✓</span>
              </div>
              <span className="text-xs font-bold text-amber-800">{p}</span>
              <span className="ml-auto text-[9px] bg-amber-100 text-amber-600 font-bold px-2 py-0.5 rounded-full">auto</span>
            </div>
          ))}

          {/* TOC entries */}
          {toc.map((h, i) => {
            const done = completedSns.has(h.sno);
            const chat = history.find(c => c.sno === h.sno);
            if (h.level === 1) {
              return (
                <div key={i} className="flex items-center gap-3 py-2.5 px-3 bg-slate-800 rounded-xl mt-3">
                  <BookOpen size={13} className="text-slate-300 flex-shrink-0" />
                  <span className="text-xs font-black text-slate-100 uppercase tracking-wide">
                    Chapter {h.sno} · {h.text}
                  </span>
                  <span className="ml-auto text-[9px] text-slate-400 font-bold">new page</span>
                </div>
              );
            }
            return (
              <div key={i} className={`flex items-center gap-3 py-2 px-3 ml-4 rounded-xl border transition-all ${
                done
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  done ? 'bg-emerald-500' : 'bg-slate-300'
                }`}>
                  <span className="text-white text-[9px] font-black">{done ? '✓' : '○'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-slate-700">{h.sno} {h.text}</span>
                  {chat && (
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate italic">
                      {chat.content.substring(0, 80)}…
                    </p>
                  )}
                </div>
                {chat && (
                  <span className="text-[9px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                    {chat.wordCount}w
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 text-center">
            Times New Roman throughout · 1.25in left margin (binding) · 1.5× line spacing · Justified body text
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ContentGenerator({
  tocHeadings, chatHistory, setChatHistory, studentName, storeKeys,
}: Props) {

  const subHeadings      = tocHeadings.filter(h => h.level !== 1);
  const completedHeadings = new Set(chatHistory.map(c => c.sno));

  // Persisted UI state — restored on refresh
  const [mode,           setMode]           = useState<'pages'|'words'>(() => load(storeKeys.MODE,  'pages'));
  const [targetPages,    setTargetPages]    = useState<number>(()          => load(storeKeys.PAGES, 34));
  const [wordsPerHeading,setWordsPerHeading]= useState<number>(()          => load(storeKeys.WORDS, 500));
  const [selectedIdx,    setSelectedIdx]    = useState<number>(()          => load(storeKeys.SELECTED_IDX, 0));

  const [reference,      setReference]      = useState('');
  const [generating,     setGenerating]     = useState(false);
  const [showPreview,    setShowPreview]     = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Persist mode / pages / words / selectedIdx
  useEffect(() => { save(storeKeys.MODE,  mode);           }, [mode]);
  useEffect(() => { save(storeKeys.PAGES, targetPages);    }, [targetPages]);
  useEffect(() => { save(storeKeys.WORDS, wordsPerHeading);}, [wordsPerHeading]);
  useEffect(() => { save(storeKeys.SELECTED_IDX, selectedIdx); }, [selectedIdx]);

  // Auto-calc words ↔ pages
  useEffect(() => {
    const count = Math.max(1, subHeadings.length);
    if (mode === 'pages') {
      setWordsPerHeading(Math.max(100, Math.floor((targetPages * 400) / count)));
    } else {
      setTargetPages(Math.max(1, Math.ceil((wordsPerHeading * count) / 400)));
    }
  }, [targetPages, wordsPerHeading, mode, subHeadings.length]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Keep selectedIdx valid if TOC changes
  useEffect(() => {
    if (selectedIdx >= subHeadings.length && subHeadings.length > 0) {
      setSelectedIdx(0);
    }
  }, [subHeadings.length]);

  const progress = subHeadings.length > 0
    ? Math.round((completedHeadings.size / subHeadings.length) * 100)
    : 0;

  // ── Generate ──────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (subHeadings.length === 0) return toast.error('Please paste TOC first.');
    if (!reference.trim())        return toast.error('Please add reference context for this section.');

    const heading = subHeadings[selectedIdx];
    setGenerating(true);

    try {
      const content = await generateWithClaude(heading, reference, wordsPerHeading);
      const entry: ChatEntry = {
        sno:       heading.sno,
        title:     heading.text,
        content,
        reference,
        wordCount: content.split(/\s+/).filter(Boolean).length,
      };
      setChatHistory(prev => {
        const idx = prev.findIndex(c => c.sno === heading.sno);
        if (idx >= 0) { const u = [...prev]; u[idx] = entry; return u; }
        return [...prev, entry];
      });
      setReference('');
      if (selectedIdx < subHeadings.length - 1) setSelectedIdx(selectedIdx + 1);
      toast.success(`✓ Generated: ${heading.sno} ${heading.text}`);
    } catch (e: any) {
      toast.error('Generation error: ' + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = (sno: string) => {
    setChatHistory(prev => prev.filter(c => c.sno !== sno));
    toast.success('Section removed.');
  };

  // ── Download .docx ────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (chatHistory.length === 0) return toast.error('Generate at least one section first.');
    const data = buildDocx(tocHeadings, chatHistory, studentName);
    const blob = new Blob([new Uint8Array(data)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Project_Report_${(studentName || 'Report').replace(/\s+/g,'_')}.docx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Document downloaded!');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {showPreview && (
        <StructurePreview
          toc={tocHeadings}
          history={chatHistory}
          onClose={() => setShowPreview(false)}
        />
      )}

      <div className="flex flex-col space-y-5">

        {/* ── Top action bar ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-black text-slate-800">AI Chat &amp; Generate</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Select a sub-section, paste reference context, generate with Claude AI.
            </p>
          </div>
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl border border-indigo-200 transition-all text-xs"
          >
            <Eye size={14} /> Preview Document Structure
          </button>
        </div>

        {/* ── Configuration Hub ── */}
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-black text-slate-600 flex items-center uppercase tracking-tight">
              <Calculator size={13} className="mr-1.5 text-indigo-600" /> Report Logic
            </h3>
            <div className="flex bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
              <button
                onClick={() => setMode('pages')}
                className={`px-3 py-1 text-[10px] rounded-md font-black uppercase transition-all ${
                  mode === 'pages' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'
                }`}
              >By Pages</button>
              <button
                onClick={() => setMode('words')}
                className={`px-3 py-1 text-[10px] rounded-md font-black uppercase transition-all ${
                  mode === 'words' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'
                }`}
              >By Words</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className={`p-3 rounded-xl border transition-all ${mode === 'pages' ? 'bg-white border-indigo-300 ring-4 ring-indigo-50' : 'bg-slate-100 border-slate-200 opacity-60'}`}>
              <label className="block text-[9px] uppercase font-black text-indigo-600 mb-1">Target Pages</label>
              <input
                type="number" disabled={mode !== 'pages'}
                value={targetPages}
                onChange={e => setTargetPages(Number(e.target.value))}
                className="text-xl font-black bg-transparent outline-none w-full text-slate-800"
              />
            </div>
            <div className={`p-3 rounded-xl border transition-all ${mode === 'words' ? 'bg-white border-indigo-300 ring-4 ring-indigo-50' : 'bg-slate-100 border-slate-200 opacity-60'}`}>
              <label className="block text-[9px] uppercase font-black text-indigo-600 mb-1">Words / Section</label>
              <input
                type="number" disabled={mode !== 'words'}
                value={wordsPerHeading}
                onChange={e => setWordsPerHeading(Number(e.target.value))}
                className="text-xl font-black bg-transparent outline-none w-full text-slate-800"
              />
            </div>
          </div>

          {/* Calculated hint */}
          <p className="text-[10px] text-slate-500 text-center">
            {mode === 'pages'
              ? `${targetPages} pages → ~${wordsPerHeading} words per section`
              : `${wordsPerHeading} words/section → ~${targetPages} total pages`}
            &nbsp;·&nbsp;{subHeadings.length} sub-sections total
          </p>
        </div>

        {/* ── Progress ── */}
        <div>
          <div className="flex justify-between items-end mb-1.5">
            <span className="text-[10px] font-black text-slate-500 uppercase">
              Document Readiness — {completedHeadings.size}/{subHeadings.length} sections
            </span>
            <span className="text-[11px] font-black text-indigo-600">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-indigo-700 transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* ── Chat History ── */}
        <div className="min-h-48 max-h-72 overflow-y-auto space-y-3 pr-1 border-b border-slate-100 pb-4">
          {chatHistory.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-slate-300 opacity-40">
              <Bot size={40} strokeWidth={1.5} />
              <p className="text-xs font-black uppercase mt-2">Awaiting generation…</p>
              <p className="text-[10px] mt-1 text-center">
                Chapter titles are structural — only sub-sections need content.
              </p>
            </div>
          ) : (
            <>
              {tocHeadings.map((h, i) => {
                if (h.level === 1) {
                  return (
                    <div key={`div-${i}`} className="flex items-center gap-3 my-2">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap px-3 py-1 bg-slate-100 rounded-full border border-slate-200">
                        Chapter {h.sno} · {h.text}
                      </span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                  );
                }
                const chat = chatHistory.find(c => c.sno === h.sno);
                if (!chat) return null;
                return (
                  <div key={`chat-${i}`} className="space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-400">
                    <div className="flex justify-end">
                      <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-4 py-2 rounded-2xl rounded-tr-none text-[11px] font-medium max-w-[85%] shadow-sm">
                        <span className="block text-[9px] font-black uppercase text-indigo-400 mb-0.5">
                          Reference · {chat.sno} {chat.title}
                        </span>
                        {chat.reference}
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-tl-none text-sm text-slate-600 shadow-sm max-w-[95%]">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wide">
                            ✓ {chat.sno} {chat.title}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-bold">
                              {chat.wordCount}w
                            </span>
                            <button
                              onClick={() => handleDelete(chat.sno)}
                              className="text-slate-300 hover:text-red-500 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        <p className="italic text-[11px] line-clamp-2 opacity-70">{chat.content}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </>
          )}
        </div>

        {/* ── Chat Input Box ── */}
        <div className="bg-white border-2 border-indigo-100 p-5 rounded-[28px] shadow-xl">
          {/* Heading selector — sub-sections only, chapter group separators */}
          <div className="flex items-center justify-between mb-3">
            <select
              value={selectedIdx}
              onChange={e => setSelectedIdx(Number(e.target.value))}
              className="flex-1 mr-3 bg-slate-100 text-[11px] font-bold py-2 px-4 rounded-full outline-none hover:bg-slate-200 transition-all cursor-pointer border-none shadow-sm text-slate-700"
            >
              {(() => {
                const opts: React.ReactNode[] = [];
                let lastChSno: string|null = null;
                subHeadings.forEach((h, i) => {
                  const allIdx = tocHeadings.findIndex(t => t.sno === h.sno);
                  let chSno: string|null = null;
                  for (let j = allIdx-1; j >= 0; j--) {
                    if (tocHeadings[j].level === 1) { chSno = tocHeadings[j].sno; break; }
                  }
                  if (chSno && chSno !== lastChSno) {
                    lastChSno = chSno;
                    const ch = tocHeadings.find(t => t.sno === chSno);
                    opts.push(
                      <option key={`ch-${i}`} disabled style={{ color:'#888', fontWeight:700 }}>
                        ── Chapter {ch?.sno}: {ch?.text} ──
                      </option>
                    );
                  }
                  opts.push(
                    <option key={i} value={i}>
                      {completedHeadings.has(h.sno) ? '✅' : '⭕'} {h.sno} {h.text}
                    </option>
                  );
                });
                return opts;
              })()}
            </select>
            <span className="text-[10px] font-black text-slate-400 whitespace-nowrap">
              ~{wordsPerHeading}w
            </span>
          </div>

          {/* Current section info */}
          {subHeadings[selectedIdx] && (
            <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2 mb-3 border border-slate-100">
              <span className="font-bold text-slate-700">
                📄 {subHeadings[selectedIdx].sno} {subHeadings[selectedIdx].text}
              </span>
              &nbsp;·&nbsp;
              {completedHeadings.has(subHeadings[selectedIdx].sno)
                ? '✅ Generated (send again to regenerate)'
                : '⭕ Not yet generated'}
            </div>
          )}

          {/* Textarea + send */}
          <div className="relative">
            <textarea
              value={reference}
              onChange={e => setReference(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter' && (e.ctrlKey||e.metaKey)) handleGenerate(); }}
              placeholder={`Reference for "${subHeadings[selectedIdx]?.text || '...'}"…\ne.g. "Cover SHA256 hashing, explain tamper-proof ledger with Ethereum example"`}
              className="w-full h-28 p-4 pr-16 text-sm bg-slate-50 rounded-2xl outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200 transition-all resize-none border border-slate-200 placeholder:text-slate-300"
            />
            <button
              onClick={handleGenerate}
              disabled={generating || !reference.trim() || subHeadings.length === 0}
              className="absolute bottom-4 right-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white p-3 rounded-2xl shadow-lg transition-all active:scale-90"
              title="Generate (Ctrl+Enter)"
            >
              {generating ? <Loader2 className="animate-spin" size={20}/> : <Send size={20}/>}
            </button>
          </div>

          {/* Export buttons */}
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleDownload}
              disabled={chatHistory.length === 0 || generating}
              className="flex-1 bg-slate-900 hover:bg-black disabled:opacity-30 text-white text-[11px] font-black uppercase py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg tracking-wider"
            >
              <Sparkles size={14} className="text-yellow-400" />
              Export Word Report
              <span className="text-[9px] opacity-60">({chatHistory.length}/{subHeadings.length})</span>
            </button>
            <button
              onClick={handleDownload}
              disabled={chatHistory.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-30 text-white p-3.5 rounded-2xl shadow-lg transition-all active:scale-95"
              title="Download .docx"
            >
              <FileDown size={20} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}