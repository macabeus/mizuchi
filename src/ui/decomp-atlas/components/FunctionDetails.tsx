import { CodeBlock } from '@ui-shared/components/CodeBlock';
import { Icon } from '@ui-shared/components/Icon';
import { WithTooltip } from '@ui-shared/components/WithTooltip';

import { useKappaDb } from '../KappaDbContext';

interface FunctionDetailsProps {
  functionId: string;
  onFunctionSelect: (id: string) => void;
  onClose: () => void;
}

function Section({
  icon,
  iconColor,
  title,
  children,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  iconColor?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden bg-slate-800/30">
      <div className="bg-slate-700/30 px-4 py-2.5 border-b border-slate-700 flex items-center gap-2">
        <Icon name={icon} color={iconColor} className="w-4 h-4" />
        <span className="text-slate-200 font-medium text-sm">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function FunctionPill({ name, onClick, disabled }: { name: string; onClick?: () => void; disabled?: boolean }) {
  if (disabled) {
    return (
      <WithTooltip tooltip="This symbol is not a known function in the database" position="top">
        <span className="bg-slate-700/50 text-slate-500 px-2 py-1 rounded text-sm font-mono cursor-default">
          {name}
        </span>
      </WithTooltip>
    );
  }

  return (
    <button
      className="bg-slate-700 hover:bg-slate-600 text-cyan-400 px-2 py-1 rounded text-sm font-mono cursor-pointer"
      onClick={onClick}
    >
      {name}
    </button>
  );
}

export function FunctionDetails({ functionId, onFunctionSelect, onClose }: FunctionDetailsProps) {
  const db = useKappaDb();
  const fn = db.getFunctionById(functionId);
  if (!fn) {
    return null;
  }

  const calledBy = db.getCalledBy(functionId);
  const similarFunctions = db.findSimilar(functionId, 5);
  const isDecompiled = !!fn.cCode;

  return (
    <div className="mt-4 border border-slate-700 rounded-xl overflow-hidden bg-slate-800/50">
      <div className="bg-slate-700/30 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon name="code" color="cyan-400" className="w-5 h-5" />
          <h4 className="text-white font-semibold font-mono">{fn.name}</h4>
          {isDecompiled ? (
            <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full text-xs font-medium">
              Decompiled
            </span>
          ) : (
            <span className="bg-slate-600/50 text-slate-300 border border-slate-500/30 px-2 py-0.5 rounded-full text-xs font-medium">
              Assembly Only
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700/50">
          <Icon name="close" className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 grid gap-4">
        <Section icon="document" title="Module Paths">
          <div className="space-y-1 text-sm">
            <p className="text-slate-300">
              <span className="text-slate-500">ASM:</span> {fn.asmModulePath}
            </p>
            {fn.cModulePath && (
              <p className="text-slate-300">
                <span className="text-slate-500">C:</span> {fn.cModulePath}
              </p>
            )}
          </div>
        </Section>

        <Section icon="code" iconColor="cyan-400" title="Assembly Code">
          <CodeBlock code={fn.asmCode} language="asm" />
        </Section>

        {fn.cCode && (
          <Section icon="code" iconColor="cyan-400" title="C Code">
            <CodeBlock code={fn.cCode} language="c" />
          </Section>
        )}

        {fn.callsFunctions.length > 0 && (
          <Section icon="bolt" title="Calls →">
            <div className="flex flex-wrap gap-2">
              {fn.callsFunctions.map((calleeId) => {
                const callee = db.getFunctionById(calleeId);
                const displayName = callee?.name ?? calleeId.replace(/^id:/, '');
                return (
                  <FunctionPill
                    key={calleeId}
                    name={displayName}
                    disabled={!callee}
                    onClick={callee ? () => onFunctionSelect(calleeId) : undefined}
                  />
                );
              })}
            </div>
          </Section>
        )}

        {calledBy.length > 0 && (
          <Section icon="bolt" title="← Called By">
            <div className="flex flex-wrap gap-2">
              {calledBy.map((caller) => (
                <FunctionPill key={caller.id} name={caller.name} onClick={() => onFunctionSelect(caller.id)} />
              ))}
            </div>
          </Section>
        )}

        {similarFunctions.length > 0 && (
          <Section icon="search" title="Similar Functions">
            <div className="flex flex-wrap gap-2">
              {similarFunctions.map((result) => (
                <FunctionPill
                  key={result.function.id}
                  name={`${result.function.name} (${(result.similarity * 100).toFixed(0)}%)`}
                  onClick={() => onFunctionSelect(result.function.id)}
                />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
