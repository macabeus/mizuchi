import { CodeBlock } from '@ui-shared/components/CodeBlock';
import { Icon } from '@ui-shared/components/Icon';
import { useCallback, useEffect, useState } from 'react';

import { useMizuchiDb } from '../MizuchiDbContext';
import { apiClient } from '../api-client';

interface PromptBuilderProps {
  selectedFunctionId: string | null;
}

export function PromptBuilder({ selectedFunctionId }: PromptBuilderProps) {
  const db = useMizuchiDb();
  const [prompt, setPrompt] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ success: boolean; path?: string; error?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fn = selectedFunctionId ? db.getFunctionById(selectedFunctionId) : null;

  // Auto-generate prompt when the selected function changes
  useEffect(() => {
    if (!selectedFunctionId) {
      return;
    }

    let cancelled = false;

    setIsGenerating(true);
    setError(null);
    setPrompt(null);
    setSaveStatus(null);

    (async () => {
      try {
        const res = await apiClient.api.buildPrompt.$post({
          json: { functionId: selectedFunctionId },
        });

        if (cancelled) {
          return;
        }

        const json = await res.json();
        if ('error' in json) {
          setError(json.error || 'Failed to generate prompt');
        } else {
          setPrompt(json.prompt);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setIsGenerating(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedFunctionId]);

  const handleSave = useCallback(async () => {
    if (!prompt || !fn) {
      return;
    }

    setIsSaving(true);
    setSaveStatus(null);

    try {
      const res = await apiClient.api.savePrompt.$post({
        json: {
          functionName: fn.name,
          promptContent: prompt,
          asm: fn.asmCode,
        },
      });

      const json = await res.json();
      if ('error' in json) {
        setSaveStatus({ success: false, error: json.error });
      } else {
        setSaveStatus({ success: true, path: json.path });
      }
    } catch (err) {
      setSaveStatus({ success: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsSaving(false);
    }
  }, [prompt, fn]);

  if (!selectedFunctionId || !fn) {
    return (
      <div className="mt-4 bg-slate-800/50 rounded-xl border border-slate-700 p-12 text-center">
        <Icon name="code" color="slate-500" className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p className="text-slate-400 text-lg">Select a function to build a prompt</p>
        <p className="text-slate-500 text-sm mt-2">Use the sidebar or embeddings chart to select a function</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Function info + save button */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold font-mono text-lg">{fn.name}</h3>
            <p className="text-slate-400 text-sm mt-1">{fn.cModulePath || fn.asmModulePath}</p>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving || !prompt}
            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-500 text-white font-medium rounded-lg hover:from-emerald-600 hover:to-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? 'Saving...' : 'Save to prompts/'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {isGenerating && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-12 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Generating prompt...</p>
        </div>
      )}

      {/* Generated prompt */}
      {prompt && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <div className="bg-slate-700/30 px-4 py-2.5 border-b border-slate-700">
            <span className="text-slate-200 font-medium text-sm">Generated Prompt</span>
          </div>
          <div className="p-4 max-h-[60vh] overflow-y-auto [scrollbar-width:thin]">
            <CodeBlock code={prompt} language="markdown" />
          </div>
        </div>
      )}

      {/* Save status */}
      {saveStatus && (
        <div
          className={`rounded-xl p-4 border ${
            saveStatus.success ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'
          }`}
        >
          {saveStatus.success ? (
            <p className="text-emerald-400">
              Saved to <span className="font-mono text-sm">{saveStatus.path}</span>
            </p>
          ) : (
            <p className="text-red-400">{saveStatus.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
