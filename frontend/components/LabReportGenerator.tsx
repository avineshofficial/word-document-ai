import { useState, useEffect, useRef, useCallback } from "react";
import {
  Download, Plus, Trash2, Zap, ChevronDown, ChevronUp,
  Eye, EyeOff, BookOpen, X, CheckCircle, Layers, AlertCircle
} from "lucide-react";
import axios from "axios";

declare global {
  interface Window {
    storage: {
      get: (key: string) => Promise<{ value: string } | null>;
      set: (key: string, value: string) => Promise<void>;
    };
  }
}

export interface Program {
  id: string;
  exNo: string;
  title: string;
  programMode: string;
  programText: string;
  programImg: string | null;
  outputMode: string;
  outputText: string;
  outputImg: string | null;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────
const store = {
  async get(key: string) {
    try {
      const res = await axios.get(`http://localhost:8000/api/store/${key}`);
      if (res.data && res.data.success && res.data.value !== undefined) {
        return res.data.value;
      }
    } catch (e) {
      console.warn("Backend load failed, falling back to localStorage", e);
    }
    // Fallback to localStorage
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  async set(key: string, val: unknown) {
    // Save to backend
    try {
      await axios.post(`http://localhost:8000/api/store/${key}`, { value: val });
    } catch (e) {
      console.warn("Backend save failed, saving to localStorage only", e);
    }
    // Save to localStorage
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  }
};

// ─── Utility helpers ──────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split("T")[0];
}
function fmtDate(d: string | undefined) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "numeric", year: "numeric" });
}
function escH(s: string) {
  return (s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function detectSteps(text: string) {
  if (!text || !text.trim()) return [];
  return text.split("\n")
    .map(l => l.trim()).filter(Boolean)
    .map(l => l
      .replace(/^step\s*\d+\s*[:.)]\s*/i, "")
      .replace(/^\d+\s*[:.)]\s*/, "")
      .replace(/^[-*•]\s*/, "")
      .trim()
    ).filter(s => s.length > 2);
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
const SHARED_DEF = {
  date: "",
  aim: "",
  procedure: [] as string[],
  result: "The program is compiled and executed successfully.",
  theory: "",
  theoryMode: "default",   // "default" | "steps" | "bullets"
  showTheory: false
};

export interface LabReport {
  shared: typeof SHARED_DEF;
  programs: Program[];
}

function makeProg(exNo: number | string): Program {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
    exNo: String(exNo),
    title: "",
    programMode: "text",
    programText: "",
    programImg: null,
    outputMode: "text",
    outputText: "",
    outputImg: null
  };
}

// ─── Theory HTML builder (for .doc export) ────────────────────────────────────
function buildTheoryExportHtml(theory: string, theoryMode: string) {
  if (!theory || !theory.trim()) return "";
  if (theoryMode === "steps") {
    const steps = detectSteps(theory);
    return steps.map((s, i) =>
      `<p style="margin:2pt 0 2pt 20pt;">Step ${i + 1}: ${escH(s)}</p>`
    ).join("");
  }
  if (theoryMode === "bullets") {
    const lines = theory.split("\n").map(l => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
    return `<ul style="margin:0 0 4pt 30pt;padding:0;">${
      lines.map(l => `<li>${escH(l)}</li>`).join("")
    }</ul>`;
  }
  // default: as-typed
  return `<p style="margin:2pt 0 2pt 20pt;white-space:pre-wrap;">${escH(theory)}</p>`;
}

// ─── .doc download builder ────────────────────────────────────────────────────
async function downloadDoc(shared: typeof SHARED_DEF, programs: Program[], filename: string) {
  const pages = programs.map((prog, idx) => {

    const theoryBlock = shared.showTheory && shared.theory && shared.theory.trim()
      ? `<p style="font-weight:bold;margin:10pt 0 3pt;">Theory:</p>
         ${buildTheoryExportHtml(shared.theory, shared.theoryMode)}
         <p style="margin:0;">&nbsp;</p>`
      : "";

    const procedureRows = shared.procedure.map((s, i) =>
      `<p style="margin:2pt 0 2pt 20pt;">Step ${i + 1}: ${escH(s)}</p>`
    ).join("");

    const programSection = prog.programMode === "image" && prog.programImg
      ? `<p style="font-weight:bold;margin:10pt 0 3pt;">Program:</p>
         <p><img src="${prog.programImg}" style="max-width:100%;border:1px solid #ccc;" /></p>`
      : `<p style="font-weight:bold;margin:10pt 0 3pt;">Program:</p>
         <pre style="font-family:'Courier New',monospace;font-size:10pt;background:#f5f5f5;border:1pt solid #ccc;padding:8pt 10pt;white-space:pre-wrap;word-break:break-all;margin:0 0 4pt;">${escH(prog.programText || "")}</pre>`;

    const outputSection = prog.outputMode === "image" && prog.outputImg
      ? `<p style="font-weight:bold;margin:10pt 0 3pt;">Output:</p>
         <p><img src="${prog.outputImg}" style="max-width:100%;border:1px solid #ccc;" /></p>`
      : `<p style="font-weight:bold;margin:10pt 0 3pt;">Output:</p>
         <pre style="font-family:'Courier New',monospace;font-size:10pt;background:#f5f5f5;border:1pt solid #ccc;border-left:3pt solid #555;padding:8pt 10pt;white-space:pre-wrap;word-break:break-all;margin:0 0 4pt;">${escH(prog.outputText || "")}</pre>`;

    return `
<table style="width:100%;border-collapse:collapse;${idx > 0 ? "page-break-before:always;" : ""}" cellpadding="0" cellspacing="0">
  <tr>
    <td style="vertical-align:top;padding:0;">

      <table style="width:100%;border-collapse:collapse;margin-bottom:8pt;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="border:1.5pt solid #000;padding:7pt 10pt;font-weight:bold;font-size:11pt;width:20%;vertical-align:top;line-height:1.8;">
            Ex.No: ${escH(prog.exNo)}<br/><br/>Date: ${escH(fmtDate(shared.date))}
          </td>
          <td style="border:1.5pt solid #000;padding:7pt 10pt;font-weight:bold;font-size:12pt;text-align:center;vertical-align:middle;">
             ${escH(prog.title)}
          </td>
        </tr>
      </table>

      <p style="margin:0;">&nbsp;</p>

      <p style="font-weight:bold;margin:6pt 0 2pt;">Aim:</p>
      <p style="margin:0 0 4pt 20pt;">${escH(shared.aim)}</p>
      <p style="margin:0;">&nbsp;</p>

      ${theoryBlock}

      <p style="font-weight:bold;margin:6pt 0 2pt;">Procedure:</p>
      ${procedureRows}
      <p style="margin:0;">&nbsp;</p>

      ${programSection}
      <p style="margin:0;">&nbsp;</p>

      ${outputSection}

    </td>
  </tr>
  <tr>
    <td style="vertical-align:bottom;padding:16pt 0 0 0;">
      <p style="font-weight:bold;margin:0 0 3pt;">Result:</p>
      <p style="margin:0 0 0 20pt;">${escH(shared.result)}</p>
    </td>
  </tr>
</table>`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<title>${escH(filename)}</title>
<!--[if gte mso 9]>
<xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/></w:WordDocument></xml>
<![endif]-->
<style>
  @page { size:A4; margin:2.54cm; }
  body { font-family:"Times New Roman",serif; font-size:12pt; line-height:1.6; color:#000; margin:0; padding:0; }
  pre { font-family:"Courier New",monospace; }
  ul,li { font-family:"Times New Roman",serif; }
</style>
</head>
<body>${pages}</body>
</html>`;

  const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".doc") ? filename : filename + ".doc";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}

// ─── Theory preview renderer ──────────────────────────────────────────────────
function TheoryContent({ theory, theoryMode }: { theory: string; theoryMode: string }) {
  if (!theory || !theory.trim()) {
    return <span style={{ color: "#94a3b8", fontStyle: "italic", fontSize: 12 }}>No theory content yet.</span>;
  }
  if (theoryMode === "steps") {
    const steps = detectSteps(theory);
    return (
      <div style={{ marginLeft: 16 }}>
        {steps.map((s, i) => <p key={i} style={{ margin: "2px 0", fontSize: 13 }}>Step {i + 1}: {s}</p>)}
      </div>
    );
  }
  if (theoryMode === "bullets") {
    const lines = theory.split("\n").map(l => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
    return (
      <ul style={{ margin: "2px 0 4px 28px", padding: 0 }}>
        {lines.map((l, i) => <li key={i} style={{ margin: "2px 0", fontSize: 13 }}>{l}</li>)}
      </ul>
    );
  }
  return <p style={{ margin: "2px 0 4px 16px", fontSize: 13, whiteSpace: "pre-wrap" }}>{theory}</p>;
}

// ─── Live Preview ─────────────────────────────────────────────────────────────
function Preview({ shared, prog }: { shared: typeof SHARED_DEF; prog: Program }) {
  return (
    <div style={{
      fontFamily: "'Times New Roman', serif", fontSize: 13, lineHeight: 1.65, color: "#111",
      background: "#fff", padding: "30px 34px",
      boxShadow: "0 2px 20px rgba(0,0,0,.09)", borderRadius: 8,
      border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", minHeight: "82vh"
    }}>
      {/* Header — 2-col format matching image 2 */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
        <tbody>
          <tr>
            <td style={{
              border: "1.5px solid #000", padding: "8px 12px", fontWeight: 700,
              width: "22%", verticalAlign: "top", fontSize: 13, lineHeight: 1.8
            }}>
              Ex.No: {prog.exNo || "—"}<br /><br />Date:
            </td>
            <td style={{
              border: "1.5px solid #000", padding: "8px 12px", fontWeight: 700,
              textAlign: "center", fontSize: 14, verticalAlign: "middle"
            }}>
              {prog.title || <span style={{ color: "#94a3b8", fontWeight: 400, fontStyle: "italic" }}>Enter title…</span>}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Aim */}
      <p style={{ fontWeight: 700, margin: "10px 0 2px" }}>Aim:</p>
      <p style={{ margin: "0 0 8px 16px" }}>{shared.aim || <em style={{ color: "#94a3b8" }}>No aim entered.</em>}</p>

      {/* Theory (optional) */}
      {shared.showTheory && shared.theory && (
        <>
          <p style={{ fontWeight: 700, margin: "8px 0 2px" }}>Theory:</p>
          <div style={{ marginBottom: 8 }}>
            <TheoryContent theory={shared.theory} theoryMode={shared.theoryMode} />
          </div>
        </>
      )}

      {/* Procedure */}
      <p style={{ fontWeight: 700, margin: "8px 0 2px" }}>Procedure:</p>
      <div style={{ marginLeft: 16, marginBottom: 8 }}>
        {shared.procedure.length > 0
          ? shared.procedure.map((s, i) => <p key={i} style={{ margin: "2px 0" }}>Step {i + 1}: {s}</p>)
          : <em style={{ color: "#94a3b8", fontSize: 12 }}>No procedure steps added.</em>
        }
      </div>

      {/* Program */}
      <p style={{ fontWeight: 700, margin: "8px 0 4px" }}>Program:</p>
      {prog.programMode === "image" && prog.programImg
        ? <img src={prog.programImg} alt="program" style={{ maxWidth: "100%", border: "1px solid #ddd", borderRadius: 4, marginBottom: 8 }} />
        : <pre style={{
            fontFamily: "'Courier New', monospace", fontSize: 11, background: "#f8f8f8",
            border: "1px solid #ddd", padding: "10px 12px", borderRadius: 4,
            whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "0 0 8px",
            minHeight: 40
          }}>{prog.programText || <span style={{ color: "#94a3b8" }}>No code entered.</span>}</pre>
      }

      {/* Output */}
      <p style={{ fontWeight: 700, margin: "8px 0 4px" }}>Output:</p>
      {prog.outputMode === "image" && prog.outputImg
        ? <img src={prog.outputImg} alt="output" style={{ maxWidth: "100%", border: "1px solid #ddd", borderRadius: 4, marginBottom: 8 }} />
        : <pre style={{
            fontFamily: "'Courier New', monospace", fontSize: 11, background: "#f8f8f8",
            border: "1px solid #ddd", borderLeft: "3px solid #555",
            padding: "10px 12px", borderRadius: 4,
            whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "0 0 8px",
            minHeight: 36
          }}>{prog.outputText || <span style={{ color: "#94a3b8" }}>No output entered.</span>}</pre>
      }

      {/* Result — always at bottom */}
      <div style={{ marginTop: "auto", paddingTop: 12 }}>
        <p style={{ fontWeight: 700, margin: "0 0 2px" }}>Result:</p>
        <p style={{ margin: "0 0 0 16px" }}>{shared.result}</p>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }: { msg: string; type: "ok" | "err"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: type === "err" ? "#7f1d1d" : "#1e293b",
      color: "#fff", padding: "10px 18px", borderRadius: 8, fontSize: 13,
      display: "flex", alignItems: "center", gap: 8,
      boxShadow: "0 4px 20px rgba(0,0,0,.35)"
    }}>
      {type === "err"
        ? <AlertCircle size={15} color="#fca5a5" />
        : <CheckCircle size={15} color="#4ade80" />}
      {msg}
    </div>
  );
}

// ─── Image upload zone ────────────────────────────────────────────────────────
function ImgZone({ b64, onImg, label }: { b64: string | null; onImg: (val: string | null) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      if (typeof r.result === "string") {
        onImg(r.result);
      }
    };
    r.readAsDataURL(f);
    e.target.value = "";
  };
  return (
    <div>
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={onChange} />
      {b64
        ? <div style={{ position: "relative" }}>
            <img src={b64} alt={label} style={{ maxWidth: "100%", borderRadius: 6, border: "1.5px solid #e2e8f0", display: "block" }} />
            <button onClick={() => onImg(null)} style={{
              position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,.6)",
              border: "none", borderRadius: 20, color: "#fff", padding: "3px 9px", cursor: "pointer", fontSize: 12
            }}>✕ Remove</button>
          </div>
        : <div onClick={() => ref.current?.click()} style={{
            border: "2px dashed #c7d2fe", borderRadius: 8, padding: "26px 0",
            textAlign: "center", cursor: "pointer", background: "#f5f3ff",
            color: "#6366f1", fontSize: 13, fontWeight: 600
          }}>
            🖼 Click to upload {label} screenshot
          </div>
      }
    </div>
  );
}

// ─── Pill toggle ──────────────────────────────────────────────────────────────
interface PillToggleOption {
  val: string;
  label: string;
}

interface PillToggleProps {
  value: string;
  onChange: (val: string) => void;
  opts: PillToggleOption[];
}

function PillToggle({ value, onChange, opts }: PillToggleProps) {
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
      {opts.map(o => (
        <button key={o.val} onClick={() => onChange(o.val)} style={{
          padding: "4px 13px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
          border: "1.5px solid " + (value === o.val ? "#4f46e5" : "#e2e8f0"),
          background: value === o.val ? "#4f46e5" : "#f8fafc",
          color: value === o.val ? "#fff" : "#64748b", transition: "all .13s"
        }}>{o.label}</button>
      ))}
    </div>
  );
}

// ─── Download filename modal ──────────────────────────────────────────────────
interface DownloadModalProps {
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

function DownloadModal({ onConfirm, onCancel }: DownloadModalProps) {
  const [name, setName] = useState("lab-reports");
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9998,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{
        background: "#fff", borderRadius: 12, padding: "28px 30px",
        width: 370, boxShadow: "0 8px 40px rgba(0,0,0,.25)"
      }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 16, color: "#1e293b" }}>Name your document</h3>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#64748b" }}>File will be saved as <b>.doc</b> (opens in Word)</p>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && name.trim() && onConfirm(name.trim())}
          autoFocus
          placeholder="e.g. DCN-Lab-Report"
          style={{
            width: "100%", padding: "9px 12px", border: "1.5px solid #c7d2fe",
            borderRadius: 7, fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 16
          }}
        />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{
            padding: "8px 18px", borderRadius: 7, border: "1.5px solid #e2e8f0",
            background: "#f8fafc", cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#475569"
          }}>Cancel</button>
          <button onClick={() => name.trim() && onConfirm(name.trim())} style={{
            padding: "8px 22px", borderRadius: 7, border: "none",
            background: "#4f46e5", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13
          }}>Download</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
interface LabReportGeneratorProps {
  initialData?: LabReport;
  onSave?: (data: LabReport) => void;
  studentName?: string;
  storeKeys?: any;
}

export default function App({ initialData, onSave, studentName, storeKeys }: LabReportGeneratorProps = {}) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [shared, setShared] = useState<typeof SHARED_DEF>(initialData?.shared ?? SHARED_DEF);
  const [programs, setPrograms] = useState<Program[]>(() => initialData?.programs ?? [makeProg(1)]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const [bulkProc, setBulkProc] = useState("");
  const [showProcPanel, setShowProcPanel] = useState(false);
  const [showTheoryPanel, setShowTheoryPanel] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => setToast({ msg, type }), []);
  const saveTimer = useRef<number | null>(null);

  // ── Load once on mount ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const s = await store.get("lr_shared_v3");
        const p = await store.get("lr_programs_v3");
        if (s && typeof s === "object") setShared(prev => ({ ...prev, ...s }));
        if (p && Array.isArray(p) && p.length > 0) setPrograms(p);
      } catch {}
      setLoaded(true);
    })();
  }, []);

  // ── Auto-save with debounce ───────────────────────────────────────────────
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
    }
    saveTimer.current = window.setTimeout(() => {
      store.set("lr_shared_v3", shared);
      store.set("lr_programs_v3", programs);
      if (onSave) {
        onSave({ shared, programs });
      }
    }, 700);
  }, [shared, programs, loaded, onSave]);

  // ── Updaters ──────────────────────────────────────────────────────────────
  const updShared = useCallback((field: keyof typeof SHARED_DEF, val: any) =>
    setShared(prev => ({ ...prev, [field]: val })), []);

  // CRITICAL: updProg uses functional update — not captured activeIdx
  // So switching tabs never breaks the update
  const updProg = useCallback((field: keyof Program, val: any, idx: number) => {
    setPrograms(prev =>
      prev.map((pg, i) => i === idx ? { ...pg, [field]: val } : pg)
    );
  }, []);

  const prog = programs[activeIdx] ?? programs[0];

  // ── Program list ops ──────────────────────────────────────────────────────
  const addProgram = useCallback(() => {
    setPrograms(prev => {
      const next = [...prev, makeProg(prev.length + 1)];
      setActiveIdx(next.length - 1);
      return next;
    });
  }, []);

  const removeProgram = useCallback((i: number) => {
    setPrograms(prev => {
      if (prev.length === 1) { showToast("At least one program required.", "err"); return prev; }
      const next = prev.filter((_, j) => j !== i);
      setActiveIdx(ai => Math.max(0, Math.min(ai, next.length - 1)));
      return next;
    });
  }, [showToast]);

  // ── Procedure ─────────────────────────────────────────────────────────────
  const autoProcedure = useCallback(() => {
    const steps = detectSteps(bulkProc);
    if (!steps.length) { showToast("No steps detected. Check format.", "err"); return; }
    updShared("procedure", steps);
    setBulkProc("");
    setShowProcPanel(false);
    showToast(steps.length + " procedure steps detected!");
  }, [bulkProc, updShared, showToast]);

  const removeProcStep = useCallback((i: number) =>
    updShared("procedure", shared.procedure.filter((_, j) => j !== i)), [shared.procedure, updShared]);

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownloadConfirm = useCallback(async (name: string) => {
    setShowDownloadModal(false);
    setDownloading(true);
    try {
      await downloadDoc(shared, programs, name);
      showToast("Downloaded: " + name + ".doc");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast("Download failed: " + msg, "err");
    }
    setDownloading(false);
  }, [shared, programs, showToast]);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    if (confirm("Are you sure you want to start over? All your work will be cleared.")) {
      setShared(SHARED_DEF);
      setPrograms([makeProg(1)]);
      setActiveIdx(0);
      setBulkProc("");
      showToast("Started from first.", "ok");
    }
  }, [showToast]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 11px", border: "1.5px solid #e2e8f0",
    borderRadius: 7, fontSize: 13, fontFamily: "inherit", outline: "none",
    boxSizing: "border-box", background: "#fafafa", minWidth: 0, color: "#111"
  };
  const ta: React.CSSProperties = { ...inp, fontFamily: "'Courier New', monospace", resize: "vertical" };
  const btnPri: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
    borderRadius: 8, background: "#4f46e5", color: "#fff", border: "none",
    cursor: "pointer", fontWeight: 700, fontSize: 13
  };
  const btnSec: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
    borderRadius: 7, background: "#f1f5f9", color: "#334155",
    border: "1.5px solid #e2e8f0", cursor: "pointer", fontWeight: 600, fontSize: 12
  };
  const panelHeader = (open: boolean, toggle: () => void, title: string, sub?: string) => (
    <button onClick={toggle} style={{
      width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "11px 15px", background: "#fafafa", border: "none",
      cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#1e293b"
    }}>
      <span>{title} {sub && <span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8" }}>{sub}</span>}</span>
      {open ? <ChevronUp size={15} color="#64748b" /> : <ChevronDown size={15} color="#64748b" />}
    </button>
  );

  if (!loaded) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#64748b", fontSize: 14 }}>
      Loading saved data…
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4ff", fontFamily: "'Segoe UI',system-ui,sans-serif" }}>

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg,#4338ca 0%,#6366f1 100%)",
        padding: "13px 22px", display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 200,
        boxShadow: "0 2px 16px rgba(67,56,202,.3)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BookOpen size={20} color="#fff" />
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: .3 }}>Lab Report Generator</span>
          <span style={{ background: "rgba(255,255,255,.2)", color: "#e0e7ff", fontSize: 11, padding: "2px 9px", borderRadius: 20 }}>
            {programs.length} program{programs.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={resetAll} style={{ ...btnSec, background: "rgba(255,255,255,.15)", border: "1.5px solid rgba(255,255,255,.3)", color: "#fff" }}>
            <Trash2 size={13} /> Start Over
          </button>
          <button onClick={() => setShowPreview(v => !v)} style={{ ...btnSec, background: "rgba(255,255,255,.15)", border: "1.5px solid rgba(255,255,255,.3)", color: "#fff" }}>
            {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
            {showPreview ? "Hide Preview" : "Preview"}
          </button>
          <button onClick={() => setShowDownloadModal(true)} disabled={downloading} style={{ ...btnPri, background: "#fff", color: "#4338ca" }}>
            <Download size={14} /> {downloading ? "Generating…" : "Download .doc"}
          </button>
        </div>
      </div>

      {/* ── Main grid ─────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: showPreview ? "1fr 1fr" : "1fr", minHeight: "calc(100vh - 53px)" }}>

        {/* ── LEFT: Editor ──────────────────────────────────────────────── */}
        <div style={{ padding: "20px 24px", overflowY: "auto", background: "#fff", borderRight: "1.5px solid #e2e8f0", minWidth: 0 }}>

          {/* Program tabs */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .8, marginBottom: 8 }}>Programs</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {programs.map((p, i) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <button onClick={() => setActiveIdx(i)} style={{
                    padding: "5px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer",
                    borderRadius: "7px 0 0 7px",
                    border: "1.5px solid " + (i === activeIdx ? "#4338ca" : "#e2e8f0"),
                    background: i === activeIdx ? "#4338ca" : "#f8fafc",
                    color: i === activeIdx ? "#fff" : "#475569", transition: "all .12s"
                  }}>Ex.{p.exNo || i + 1}</button>
                  <button onClick={() => removeProgram(i)} style={{
                    padding: "5px 6px", cursor: "pointer", fontSize: 11,
                    borderRadius: "0 7px 7px 0",
                    borderTop: "1.5px solid " + (i === activeIdx ? "#4338ca" : "#e2e8f0"),
                    borderRight: "1.5px solid " + (i === activeIdx ? "#4338ca" : "#e2e8f0"),
                    borderBottom: "1.5px solid " + (i === activeIdx ? "#4338ca" : "#e2e8f0"),
                    borderLeft: "none",
                    background: i === activeIdx ? "#3730a3" : "#f1f5f9",
                    color: i === activeIdx ? "#fca5a5" : "#94a3b8"
                  }}><X size={11} /></button>
                </div>
              ))}
              <button onClick={addProgram} style={{ ...btnSec, borderRadius: 7 }}>
                <Plus size={13} /> Add
              </button>
            </div>
          </div>

          {/* ── Shared panel ─────────────────────────────────────────────── */}
          <div style={{ background: "#f0f4ff", border: "1.5px solid #c7d2fe", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#4338ca", textTransform: "uppercase", letterSpacing: .7, marginBottom: 11 }}>
              📌 Shared — set once, applied to all programs
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginBottom: 11 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Date</label>
                <input type="date" value={shared.date} onChange={e => updShared("date", e.target.value)} style={inp} />
              </div>
            </div>
            <div style={{ marginBottom: 11 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                Result <span style={{ fontWeight: 400, color: "#94a3b8" }}>(same for all)</span>
              </label>
              <textarea value={shared.result} onChange={e => updShared("result", e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Aim</label>
              <textarea value={shared.aim} onChange={e => updShared("aim", e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} />
            </div>
          </div>

          {/* ── Theory panel ─────────────────────────────────────────────── */}
          <div style={{ marginBottom: 16, border: "1.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <button onClick={() => setShowTheoryPanel(v => !v)} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "11px 15px", background: "#fafafa", border: "none", cursor: "pointer",
                fontWeight: 700, fontSize: 13, color: "#1e293b"
              }}>
                <span>Theory <span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8" }}>(optional)</span></span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span onClick={e => { e.stopPropagation(); updShared("showTheory", !shared.showTheory); }} style={{
                    fontSize: 11, padding: "2px 10px", borderRadius: 20, cursor: "pointer", fontWeight: 700,
                    border: "1.5px solid " + (shared.showTheory ? "#6366f1" : "#cbd5e1"),
                    background: shared.showTheory ? "#6366f1" : "transparent",
                    color: shared.showTheory ? "#fff" : "#64748b"
                  }}>
                    {shared.showTheory ? "Included ✓" : "Include in report"}
                  </span>
                  {showTheoryPanel ? <ChevronUp size={15} color="#64748b" /> : <ChevronDown size={15} color="#64748b" />}
                </div>
              </button>
            </div>

            {showTheoryPanel && (
              <div style={{ padding: "13px 15px", borderTop: "1.5px solid #e2e8f0" }}>
                {/* Display mode */}
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>
                  Display Mode
                </label>
                <PillToggle
                  value={shared.theoryMode}
                  onChange={v => updShared("theoryMode", v)}
                  opts={[
                    { val: "default", label: "Default (as typed)" },
                    { val: "steps",   label: "Step 1, 2, 3…" },
                    { val: "bullets", label: "• Bullet Points" }
                  ]}
                />
                <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 9px" }}>
                  {shared.theoryMode === "default" && "Theory content will appear exactly as you type it."}
                  {shared.theoryMode === "steps"   && "Each line will be prefixed as Step 1:, Step 2:, etc."}
                  {shared.theoryMode === "bullets" && "Each line will appear as a bullet point (•)."}
                </p>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>
                  Theory Content
                </label>
                <textarea
                  value={shared.theory}
                  onChange={e => updShared("theory", e.target.value)}
                  rows={5}
                  placeholder="Paste or type theory content here…"
                  style={{ ...inp, resize: "vertical" }}
                />
              </div>
            )}
          </div>

          {/* ── Procedure panel ──────────────────────────────────────────── */}
          <div style={{ marginBottom: 16, border: "1.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
            {panelHeader(
              showProcPanel,
              () => setShowProcPanel(v => !v),
              "Procedure",
              `(${shared.procedure.length} steps · shared)`
            )}

            {showProcPanel && (
              <div style={{ padding: "13px 15px", borderTop: "1.5px solid #e2e8f0" }}>
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "7px 11px", marginBottom: 9, fontSize: 12, color: "#1e40af" }}>
                  💡 Paste steps in any format — "Step 1:", "1.", "-" — and click Auto Detect
                </div>
                <textarea value={bulkProc} onChange={e => setBulkProc(e.target.value)}
                  placeholder="Paste procedure steps here…" rows={4} style={ta} />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={autoProcedure} style={{ ...btnPri, flex: 1, justifyContent: "center" }}>
                    <Zap size={13} /> Auto Detect Steps
                  </button>
                  <button onClick={() => updShared("procedure", [])} style={{ ...btnSec, color: "#ef4444", borderColor: "#fca5a5" }}>
                    <Trash2 size={13} /> Clear
                  </button>
                </div>
                {shared.procedure.length > 0 && (
                  <div style={{ marginTop: 12, maxHeight: 210, overflowY: "auto" }}>
                    {shared.procedure.map((s, i) => (
                      <div key={i} style={{
                        display: "flex", gap: 8, alignItems: "flex-start",
                        padding: "5px 8px", background: "#fff", borderRadius: 6,
                        marginBottom: 5, border: "1px solid #e2e8f0"
                      }}>
                        <span style={{ color: "#4338ca", fontWeight: 800, fontSize: 12, minWidth: 62, flexShrink: 0 }}>Step {i + 1}:</span>
                        <span style={{ fontSize: 12, flex: 1 }}>{s}</span>
                        <button onClick={() => removeProcStep(i)} style={{ border: "none", background: "none", color: "#f87171", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Per-program details ───────────────────────────────────────── */}
          <div style={{ background: "#fff8f0", border: "1.5px solid #fed7aa", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#ea580c", textTransform: "uppercase", letterSpacing: .7, marginBottom: 12 }}>
              ✏️ Program {activeIdx + 1} Details
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 11, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Ex. No</label>
                <input
                  value={prog.exNo}
                  onChange={e => updProg("exNo", e.target.value, activeIdx)}
                  style={inp}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Title</label>
                <input
                  value={prog.title}
                  onChange={e => updProg("title", e.target.value, activeIdx)}
                  style={inp}
                  placeholder="e.g. Program to find Hamming Distance"
                />
              </div>
            </div>

            {/* Program section */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>Program</label>
              <PillToggle
                value={prog.programMode}
                onChange={v => updProg("programMode", v, activeIdx)}
                opts={[{ val: "text", label: "📝 Text" }, { val: "image", label: "🖼 Screenshot" }]}
              />
              {prog.programMode === "text"
                ? <textarea
                    value={prog.programText}
                    onChange={e => updProg("programText", e.target.value, activeIdx)}
                    rows={5} style={ta} placeholder="Paste your program code here…"
                  />
                : <ImgZone b64={prog.programImg} onImg={v => updProg("programImg", v, activeIdx)} label="program" />
              }
            </div>

            {/* Output section */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>Output</label>
              <PillToggle
                value={prog.outputMode}
                onChange={v => updProg("outputMode", v, activeIdx)}
                opts={[{ val: "text", label: "📝 Text" }, { val: "image", label: "🖼 Screenshot" }]}
              />
              {prog.outputMode === "text"
                ? <textarea
                    value={prog.outputText}
                    onChange={e => updProg("outputText", e.target.value, activeIdx)}
                    rows={3} style={ta} placeholder="Paste program output here…"
                  />
                : <ImgZone b64={prog.outputImg} onImg={v => updProg("outputImg", v, activeIdx)} label="output" />
              }
            </div>
          </div>

          {/* ── All programs summary ─────────────────────────────────────── */}
          {programs.length > 1 && (
            <div style={{ background: "#f1f5f9", borderRadius: 10, padding: "12px 14px" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#475569", margin: "0 0 9px", display: "flex", alignItems: "center", gap: 6 }}>
                <Layers size={13} /> All {programs.length} programs (merged on download)
              </p>
              {programs.map((p, i) => (
                <div key={p.id} onClick={() => setActiveIdx(i)} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "5px 9px",
                  borderRadius: 6, cursor: "pointer", marginBottom: 4,
                  background: i === activeIdx ? "#e0e7ff" : "#fff",
                  border: "1.5px solid " + (i === activeIdx ? "#6366f1" : "#e2e8f0"),
                  transition: "all .12s"
                }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: "#4338ca", minWidth: 46 }}>Ex.{p.exNo}</span>
                  <span style={{ fontSize: 12, color: "#475569", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.title || "(untitled)"}
                  </span>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>
                    {p.programMode === "image" ? "img" : "txt"}/{p.outputMode === "image" ? "img" : "txt"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: Preview ────────────────────────────────────────────── */}
        {showPreview && (
          <div style={{ padding: "20px 24px", overflowY: "auto", background: "#f0f4ff", minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: .8, marginBottom: 10 }}>
              Live Preview — Program {activeIdx + 1}
            </div>
            <Preview shared={shared} prog={prog} />
          </div>
        )}
      </div>

      {/* ── Download modal ───────────────────────────────────────────────── */}
      {showDownloadModal && (
        <DownloadModal
          onConfirm={handleDownloadConfirm}
          onCancel={() => setShowDownloadModal(false)}
        />
      )}

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}