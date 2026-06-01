from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import logging
import tempfile
import httpx

from services.document_generator import DocumentGenerator
from services.report_parser import ReportParser

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Word Document AI Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = "generated_docs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

document_generator = DocumentGenerator()
report_parser      = ReportParser()


# ── Request / Response Models ─────────────────────────────────────────────────

class TocExportRequest(BaseModel):
    toc_headings: List[Dict[str, Any]]

class GenerateContentRequest(BaseModel):
    """Request to generate content for a section using Ollama."""
    section_number: str
    heading: str
    reference: str
    target_words: int

class FinalCompileRequest(BaseModel):
    """
    Receives the full TOC and the list of AI-generated sub-sections.

    generated_data items:  { "sno": str, "title": str, "content": str }

    Chapter titles (level=1) are structural headings only — no content entry
    is expected for them.  Sub-sections (level 2+) are matched by title.
    """
    toc_headings:   List[Dict[str, Any]]
    generated_data: List[Dict[str, Any]]
    student_name:   Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/upload-report-format")
async def upload_report_format(file: UploadFile = File(...)):
    """
    Accepts a PDF and returns its heading structure.
    Called by FileUploader.tsx to pre-populate the TOC editor.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        result = report_parser.parse_pdf(tmp_path)
        os.unlink(tmp_path)

        if result["success"]:
            return {"success": True, "structure": result["headings"]}
        raise HTTPException(status_code=422, detail=result.get("error", "Parse failed"))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"UPLOAD ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/export-toc")
async def export_toc(request: TocExportRequest):
    """
    Generates a Word document containing only the TOC table.
    Called by TocEditor.tsx 'Get TOC Docx' button.
    """
    try:
        output_path = document_generator.create_toc_only_document(request.toc_headings)
        return {
            "success":      True,
            "download_url": f"/api/download/{os.path.basename(output_path)}"
        }
    except Exception as e:
        logger.error(f"TOC EXPORT ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate-content")
async def generate_content(request: GenerateContentRequest):
    """
    Generates content for a section using local Ollama server.
    Called by ContentGenerator.tsx to generate AI content.
    """
    try:
        ollama_url = "http://localhost:11434"
        
        # Construct the prompt
        prompt = f"""You are writing a section for a professional MCA project report.

SECTION: {request.section_number} {request.heading}
REFERENCE/CONTEXT: {request.reference}
TARGET: Write exactly {request.target_words} words.

RULES:
1. Formal academic thesis style. No markdown, no bold/italic, no bullet points.
2. Complete justified paragraphs separated by blank lines (\\n\\n).
3. Highly technical and analytical content.
4. Start directly with body text — no "Here is…" opener.
5. No section headings inside — flowing paragraphs only."""

        # Call Ollama API
        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.post(
                f"{ollama_url}/api/generate",
                json={
                    "model": "llama3",  # Using llama3; change if you have another model
                    "prompt": prompt,
                    "stream": False,
                    "temperature": 0.7,
                },
            )
        
        if response.status_code != 200:
            logger.error(f"Ollama API error: {response.text}")
            raise HTTPException(
                status_code=500,
                detail=f"Ollama service error: {response.text}"
            )
        
        result = response.json()
        content = result.get("response", "").strip()
        
        if not content:
            raise HTTPException(
                status_code=500,
                detail="Ollama returned empty response"
            )
        
        return {
            "success": True,
            "content": content,
            "section_number": request.section_number,
            "heading": request.heading,
        }
    
    except httpx.ConnectError:
        logger.error("Cannot connect to Ollama service at http://localhost:11434")
        raise HTTPException(
            status_code=503,
            detail="Ollama service not running. Ensure Ollama is started on http://localhost:11434"
        )
    except Exception as e:
        logger.error(f"GENERATE CONTENT ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/compile-full-report")
async def compile_full_report(request: FinalCompileRequest):
    """
    Compiles AI-generated sub-section content (produced by the Claude API
    running directly in the browser) into a properly formatted Word document.

    Structure rules (matching SecureChain PDF):
      - Page break BEFORE each chapter title (except the very first).
      - Chapter title at top of new page, centred, 14 pt bold.
      - Sub-sections and their body text flow directly below — no break between them.
      - The next chapter triggers the next page break.
    """
    try:
        logger.info(
            f"Compiling report: {len(request.toc_headings)} headings, "
            f"{len(request.generated_data)} generated sections"
        )

        # Build content map  →  { section_title: { "content": "..." } }
        content_map: Dict[str, Dict] = {}
        for item in request.generated_data:
            title   = item.get("title", "").strip()
            content = item.get("content", "").strip()
            if title and content:
                content_map[title] = {"content": content}

        student_info = {"name": request.student_name} if request.student_name else None

        output_path = document_generator.create_document(
            toc_headings=request.toc_headings,
            content_data=content_map,
            student_info=student_info,
        )

        return {
            "success":      True,
            "download_url": f"/api/download/{os.path.basename(output_path)}"
        }
    except Exception as e:
        logger.error(f"COMPILE ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/download/{filename}")
async def download_document(filename: str):
    """Serves a generated .docx file for download."""
    filename  = os.path.basename(filename)          # prevent path traversal
    file_path = os.path.join(OUTPUT_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type=(
                "application/vnd.openxmlformats-officedocument"
                ".wordprocessingml.document"
            ),
        )
    raise HTTPException(status_code=404, detail="File not found")


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "Document AI Generator"}