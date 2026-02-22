import { useCallback, useRef, useState } from 'react';

interface FileLoaderProps {
  onFileLoaded: (data: unknown, fileName: string) => void;
  accept?: string;
  title: string;
  description: string;
}

export function FileLoader({ onFileLoaded, accept = '.json', title, description }: FileLoaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          onFileLoaded(data, file.name);
        } catch {
          setError('Invalid JSON file. Please select a valid JSON file.');
        }
      };
      reader.onerror = () => {
        setError('Failed to read file.');
      };
      reader.readAsText(file);
    },
    [onFileLoaded],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  return (
    <div className="flex items-center justify-center min-h-screen p-8">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`w-full max-w-lg p-12 text-center rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
          isDragOver
            ? 'border-cyan-400 bg-cyan-500/10 scale-105'
            : 'border-slate-600 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800/70'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="text-4xl mb-4">
          {isDragOver ? (
            <span className="text-cyan-400">+</span>
          ) : (
            <svg className="w-16 h-16 mx-auto text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          )}
        </div>

        <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
        <p className="text-slate-400 mb-4">{description}</p>

        <button
          type="button"
          className="px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium rounded-lg hover:from-blue-600 hover:to-cyan-600 transition-all"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          Choose File
        </button>

        <input ref={fileInputRef} type="file" accept={accept} onChange={handleInputChange} className="hidden" />

        {error && (
          <div className="mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
        )}
      </div>
    </div>
  );
}
