'use client';
import { useState, useEffect } from 'react';
import { ClipboardPaste, CheckCircle2, Loader2, FileDown, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { Heading } from '@/app/page';

interface Props {
  onUpdate:        (headings: Heading[]) => void;
  onContinue:      () => void;
  initialHeadings: Heading[];
}

export default function TocEditor({ onUpdate, onContinue, initialHeadings }: Props) {
  const [rawText,        setRawText]        = useState('');
  const [parsedHeadings, setParsedHeadings] = useState<Heading[]>(initialHeadings);
  const [loading,        setLoading]        = useState(false);

  // Sync with parent state (especially important for Reset/Start Over)
  useEffect(() => {
    setParsedHeadings(initialHeadings);
    if (initialHeadings.length === 0) {
      setRawText('');
    }
  }, [initialHeadings]);

  const handleParse = () => {
    if (!rawText.trim()) return toast.error('Please paste your Table of Contents first.');

    const lines     = rawText.split('\n');
    const extracted: Heading[] = [];

    lines.forEach(line => {
      // Support markdown table rows
      const tableMatch = line.match(/\|\s*([a-zA-Z0-9.]+)\s*\|\s*(.*?)\s*\|/);
      if (tableMatch) {
        const sno   = tableMatch[1].trim();
        const title = tableMatch[2].trim().replace(/\*\*/g, '').replace(/\*/g, '');
        if (sno.toLowerCase() !== 's. no' && sno !== '---') {
          const level = /^[IVX]+$/i.test(sno) || !sno.includes('.') ? 1 : 2;
          extracted.push({ sno, text: title, level });
        }
        return;
      }
      // Support plain numbered list
      const plainMatch = line.trim().match(/^([IVX]+|\d+(?:\.\d+)?)\s+(.+)$/i);
      if (plainMatch) {
        const sno   = plainMatch[1].trim();
        const title = plainMatch[2].trim().replace(/\*\*/g, '').replace(/\*/g, '');
        const level = /^[IVX]+$/i.test(sno) || !sno.includes('.') ? 1 : 2;
        extracted.push({ sno, text: title, level });
      }
    });

    if (extracted.length > 0) {
      setParsedHeadings(extracted);
      onUpdate(extracted);
      toast.success(`Parsed ${extracted.length} headings successfully.`);
    } else {
      toast.error('Could not parse TOC. Check format (e.g. "1 Introduction" or "1.1 About the Project").');
    }
  };

  const handleExportTOC = async () => {
    if (parsedHeadings.length === 0) return toast.error('Parse TOC first.');
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:8000/api/export-toc', {
        toc_headings: parsedHeadings,
      });
      if (res.data.success) {
        window.location.href = `http://localhost:8000${res.data.download_url}`;
        toast.success('TOC document ready!');
      }
    } catch {
      toast.error('Failed to generate TOC document. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  const chapters   = parsedHeadings.filter(h => h.level === 1);
  const subSections = parsedHeadings.filter(h => h.level !== 1);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-black text-slate-800">Paste Table of Contents</h2>
        <p className="text-xs text-slate-500 mt-1">
          Paste your TOC as a numbered list or markdown table.
          Chapter titles (1, 2, 3…) become page-break headings.
          Sub-sections (1.1, 1.2…) get AI-generated content.
        </p>
      </div>

      {/* Textarea */}
      <textarea
        value={rawText}
        onChange={e => setRawText(e.target.value)}
        placeholder={`1 Introduction\n1.1 About the Project\n1.2 Problem Statement\n1.3 Objectives of the Project\n2 System Analysis\n2.1 Existing System\n2.2 Proposed System\n3 System Design\n3.1 System Architecture\n3.2 Database Design\n4 Conclusion`}
        className="w-full h-52 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 font-mono resize-none shadow-inner transition-all"
      />

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleParse}
          className="flex-1 flex justify-center items-center py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg active:scale-[0.99] text-sm"
        >
          <ClipboardPaste size={16} className="mr-2" /> Parse &amp; Preview TOC
        </button>
        {parsedHeadings.length > 0 && (
          <button
            onClick={onContinue}
            className="flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-black text-white font-bold rounded-xl transition-all text-sm"
          >
            Continue <ArrowRight size={15} />
          </button>
        )}
      </div>

      {/* ── Live TOC Preview ── shown immediately after parsing ── */}
      {parsedHeadings.length > 0 && (
        <div className="mt-2 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xl animate-in fade-in slide-in-from-top-4 duration-500">

          {/* Preview header */}
          <div className="bg-slate-50 px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <div className="font-bold text-slate-800 flex items-center text-sm">
              <CheckCircle2 size={16} className="text-emerald-500 mr-2" />
              Structure Preview
              <span className="ml-3 text-[10px] bg-indigo-100 text-indigo-700 font-black px-2 py-0.5 rounded-full">
                {chapters.length} chapters · {subSections.length} sub-sections
              </span>
            </div>
            <button
              onClick={handleExportTOC}
              disabled={loading}
              className="flex items-center bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-all font-bold text-xs shadow-md disabled:opacity-50"
            >
              {loading
                ? <Loader2 size={14} className="animate-spin mr-1.5" />
                : <FileDown size={14} className="mr-1.5" />}
              Export TOC .docx
            </button>
          </div>

          {/* Simulated Word document TOC table */}
          <div className="max-h-[480px] overflow-y-auto">
            {/* Column headers — matches Word document exactly */}
            <div className="grid grid-cols-[56px_1fr_64px] bg-[#D3D3D3] border-b border-slate-400 text-[11px] font-bold text-slate-700">
              <div className="px-3 py-2.5 text-center border-r border-slate-400">S. No</div>
              <div className="px-3 py-2.5 border-r border-slate-400">TITLE</div>
              <div className="px-3 py-2.5 text-center">PAGE NO</div>
            </div>

            {parsedHeadings.map((h, i) => (
              <div
                key={i}
                className={`grid grid-cols-[56px_1fr_64px] border-b border-slate-200 transition-colors hover:bg-indigo-50/30 ${
                  h.level === 1 ? 'bg-slate-50' : 'bg-white'
                }`}
              >
                <div className={`px-3 py-2 text-center border-r border-slate-200 text-[11px] ${h.level === 1 ? 'font-bold text-slate-800' : 'text-slate-500'}`}>
                  {h.sno}
                </div>
                <div className={`px-3 py-2 border-r border-slate-200 text-[11px] ${
                  h.level === 1
                    ? 'font-bold text-slate-900 uppercase tracking-wide'
                    : 'text-slate-600 pl-8'
                }`}>
                  {h.text}
                </div>
                <div className="px-3 py-2 text-center text-[10px] text-slate-400">—</div>
              </div>
            ))}
          </div>

          {/* Word document format info footer */}
          <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-between">
            <p className="text-[10px] text-slate-500">
              Times New Roman · Chapter rows bold uppercase · Sub-sections indented · Gray header row
            </p>
            <button
              onClick={onContinue}
              className="text-[11px] font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
            >
              Go to Generate <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}