'use client';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Loader2 } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

export default function FileUploader({ onUpload }: { onUpload: (data: any) => void }) {
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file.type !== 'application/pdf') return toast.error('Please upload a valid PDF file.');
    
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('http://localhost:8000/api/upload-report-format', formData);
      if (res.data.success) onUpload(res.data.structure);
    } catch {
      toast.error('Failed to parse PDF.');
    } finally {
      setUploading(false);
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] } });

  return (
    <div 
      {...getRootProps()} 
      className={`border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center 
        ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-slate-100'}`}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
      ) : (
        <div className="w-16 h-16 bg-white shadow-sm border border-slate-200 rounded-full flex items-center justify-center mb-4">
          <UploadCloud className="w-8 h-8 text-indigo-600" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-800 mb-1">
        {uploading ? 'Extracting Structure...' : 'Click or drag PDF to upload'}
      </h3>
      <p className="text-sm text-slate-500">Supported format: .pdf (Max 10MB)</p>
    </div>
  );
}