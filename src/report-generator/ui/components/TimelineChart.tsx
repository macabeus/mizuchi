import { Gantt, Tooltip, WillowDark, registerScaleUnit } from '@svar-ui/react-gantt';
import type { IApi, ILink, IScaleConfig, ITask } from '@svar-ui/react-gantt';
import '@svar-ui/react-gantt/style.css';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { ReportPermuterBackgroundTask, ReportPromptResult } from '~/report-generator/types';

// Register the "minute" scale unit for the SVAR Gantt library.
//
// The `start` function is intentionally the identity (no truncation to minute
// boundaries). SVAR internally calls `getUnitStart()` when computing bar widths
// (unitSize=true path) to snap both endpoints to unit boundaries, inflating the
// visual width to whole minutes. With an identity `start`, snapping is a no-op
// and bars render at their precise sub-minute duration.
//
// This works for gridlines too because the chart's time origin (EPOCH) is already
// on a minute boundary, so the scale iteration (start → add(step) → add(step)…)
// still produces clean minute-aligned gridlines.
registerScaleUnit('minute', {
  start: (date: Date) => (date ? new Date(date) : new Date(0)),
  end: (date: Date) => {
    if (!date) {
      return new Date(0);
    }
    return new Date(date.getTime() + 60_000);
  },
  isSame: (a: Date, b: Date) => {
    if (!a || !b) {
      return true;
    }
    return a.getHours() === b.getHours() && a.getMinutes() === b.getMinutes();
  },
  add: (date: Date, num: number) => {
    if (!date) {
      return new Date(0);
    }
    return new Date(date.getTime() + num * 60_000);
  },
  diff: (a: Date, b: Date) => {
    if (!a || !b) {
      return 0;
    }
    return (a.getTime() - b.getTime()) / 60_000;
  },
});

interface TimelineChartProps {
  result: ReportPromptResult;
  activeTaskId?: string | null;
  onTaskSelect?: (taskId: string) => void;
}

const ActiveTaskContext = createContext<string | null>(null);

interface GanttData {
  tasks: ITask[];
  links: ILink[];
  scales: IScaleConfig[];
  start: Date;
  end: Date;
  cellWidth: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${(ms / 60000).toFixed(1)}m`;
}

/** The epoch used as time zero — all timestamps are shifted relative to this. */
const EPOCH = new Date(2024, 0, 1, 0, 0, 0).getTime();

/**
 * Format a Date (relative to EPOCH) as elapsed time: "0:00", "5:30", "1:15:00".
 */
function formatElapsed(date: Date): string {
  const totalMs = date.getTime() - EPOCH;
  const totalSeconds = Math.round(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Compute dynamic scale configuration based on total timeline duration.
 * Uses a single scale row with a step size that guarantees labels never overlap.
 * Labels show elapsed time from 0:00 instead of wall-clock time.
 */
function computeScaleConfig(totalDurationMs: number): {
  scales: IScaleConfig[];
  cellWidth: number;
  stepMs: number;
} {
  const totalMinutes = totalDurationMs / 60000;

  // Each cell needs at least 60px to fit a label without overlap.
  const minCellWidth = 60;
  const maxCells = Math.floor(700 / minCellWidth);

  // Pick the smallest "nice" step where all labels fit
  const rawStep = totalMinutes / maxCells;
  const niceSteps = [1, 2, 5, 10, 15, 30, 60, 120];
  const step = niceSteps.find((s) => s >= rawStep) ?? 120;

  const numCells = Math.ceil(totalMinutes / step);
  const cellWidthPerCell = Math.max(minCellWidth, Math.floor(700 / Math.max(numCells, 1)));

  // SVAR Gantt interprets cellWidth as pixels per smallest scale unit (not per cell).
  // Divide by the step to convert from per-cell to per-unit.
  if (step >= 60) {
    const stepHours = step / 60;
    return {
      scales: [{ unit: 'hour', step: stepHours, format: formatElapsed }],
      cellWidth: Math.max(1, Math.round(cellWidthPerCell / stepHours)),
      stepMs: step * 60_000,
    };
  }

  return {
    scales: [{ unit: 'minute', step, format: formatElapsed }],
    cellWidth: Math.max(1, Math.round(cellWidthPerCell / step)),
    stepMs: step * 60_000,
  };
}

/**
 * Build SVAR Gantt task/scale data from the report result.
 */
function buildGanttData(result: ReportPromptResult): GanttData | null {
  if (result.attempts.length === 0 && !result.backgroundTasks?.length) {
    return null;
  }

  const tasks: ITask[] = [];
  const links: ILink[] = [];
  let minTime = Infinity;
  let maxTime = -Infinity;

  // Claude section header + attempts
  tasks.push({ id: 'claude-header', text: 'Claude', type: 'header', taskCategory: 'attempt', unscheduled: true });

  for (const attempt of result.attempts) {
    if (!attempt.startTimestamp) {
      continue;
    }

    const start = new Date(attempt.startTimestamp);
    const end = new Date(start.getTime() + attempt.durationMs);

    minTime = Math.min(minTime, start.getTime());
    maxTime = Math.max(maxTime, end.getTime());

    tasks.push({
      id: `attempt-${attempt.attemptNumber}`,
      text: `Attempt ${attempt.attemptNumber}`,
      start,
      end,
      type: 'task',
      barColor: attempt.success ? '#34d399' : '#f87171',
      taskCategory: 'attempt',
      durationMs: attempt.durationMs,
      success: attempt.success,
      attemptNumber: attempt.attemptNumber,
    });
  }

  // Permuter section header + background tasks
  if (result.backgroundTasks?.length) {
    tasks.push({
      id: 'permuter-header',
      text: 'Permuter',
      type: 'header',
      taskCategory: 'permuter',
      unscheduled: true,
    });

    const sortedTasks = [...result.backgroundTasks].sort(
      (a, b) => new Date(a.startTimestamp).getTime() - new Date(b.startTimestamp).getTime(),
    );

    for (const task of sortedTasks) {
      const start = new Date(task.startTimestamp);
      const end = new Date(start.getTime() + task.durationMs);

      minTime = Math.min(minTime, start.getTime());
      maxTime = Math.max(maxTime, end.getTime());

      const isPermuter = (t: typeof task): t is ReportPermuterBackgroundTask => t.pluginId === 'decomp-permuter';

      tasks.push({
        id: task.taskId,
        text: `Permuter ${task.taskId.replace('permuter-', '')}`,
        start,
        end,
        type: 'task',
        barColor: task.success ? '#a78bfa' : '#7c3aed',
        taskCategory: 'permuter',
        durationMs: task.durationMs,
        success: task.success,
        triggeredByAttempt: task.triggeredByAttempt,
        bestScore: isPermuter(task) ? task.data.bestScore : undefined,
        baseScore: isPermuter(task) ? task.data.baseScore : undefined,
      });

      // Link from the triggering attempt to this permuter task
      links.push({
        id: `link-${task.taskId}`,
        source: `attempt-${task.triggeredByAttempt}`,
        target: task.taskId,
        type: 's2s',
      });
    }
  }

  // Must have at least one task with dates
  if (tasks.every((t) => t.type === 'header')) {
    return null;
  }

  if (minTime === Infinity) {
    return null;
  }

  const totalDurationMs = maxTime - minTime;
  const { scales, cellWidth, stepMs } = computeScaleConfig(totalDurationMs);

  // Shift all tasks so the earliest starts slightly after EPOCH.
  // The padding gives breathing room so bars don't touch the left edge,
  // while keeping the chart start at exactly EPOCH so labels begin at 0:00.
  const startPadding = Math.max(totalDurationMs * 0.05, 5000);
  const offset = EPOCH + startPadding - minTime;
  for (const task of tasks) {
    if (task.start && task.end) {
      task.start = new Date(task.start.getTime() + offset);
      task.end = new Date(task.end.getTime() + offset);
    }
  }

  return {
    tasks,
    links,
    scales,
    start: new Date(EPOCH),
    end: new Date(EPOCH + startPadding + totalDurationMs + stepMs),
    cellWidth,
  };
}

/** Custom task bar: hides header rows, shows colored bars with duration labels */
function TaskBarTemplate({ data }: { data: ITask }) {
  const activeTaskId = useContext(ActiveTaskContext);

  if (data.type === 'header') {
    return <div />;
  }

  const isActive = activeTaskId != null && String(data.id) === activeTaskId;
  const duration = formatDuration(data.durationMs as number);

  return (
    <div
      className={isActive ? 'gantt-bar-active' : undefined}
      style={{
        backgroundColor: (data.barColor as string) || '#64748b',
        opacity: isActive ? 1 : 0.85,
        width: '100%',
        height: '100%',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        transition: 'opacity 150ms ease',
      }}
    >
      <span
        className="wx-text-out"
        style={{ fontSize: '11px', color: '#fff', paddingLeft: '6px', whiteSpace: 'nowrap' }}
      >
        {duration}
      </span>
    </div>
  );
}

const tooltipStyle: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: '12px',
  lineHeight: '1.6',
  backgroundColor: '#1e293b',
  color: '#e2e8f0',
  borderRadius: '4px',
};

/** Tooltip content shown on hover over a task bar */
function TooltipContent({ data }: { data: ITask }) {
  if (!data || data.type === 'header') {
    return null;
  }

  const duration = formatDuration(data.durationMs as number);

  if (data.taskCategory === 'attempt') {
    return (
      <div style={tooltipStyle}>
        <div style={{ fontWeight: 600 }}>Attempt {data.attemptNumber as number}</div>
        <div>Duration: {duration}</div>
        <div>Status: {data.success ? 'Success' : 'Failed'}</div>
      </div>
    );
  }

  return (
    <div style={tooltipStyle}>
      <div style={{ fontWeight: 600 }}>{data.text}</div>
      <div>Duration: {duration}</div>
      <div>Triggered by: Attempt {data.triggeredByAttempt as number}</div>
      <div>
        Score: {data.bestScore as number} / {data.baseScore as number}
      </div>
      <div>Status: {data.success ? 'Match found' : 'No match'}</div>
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  attempt: '#22d3ee',
  permuter: '#a78bfa',
};

/** Custom cell for the task name column: bold headers with colored dot, indented children */
function TaskNameCell({ row }: { row: ITask }) {
  const activeTaskId = useContext(ActiveTaskContext);

  if (row.type === 'header') {
    const color = CATEGORY_COLORS[row.taskCategory as string] ?? '#94a3b8';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: color,
            flexShrink: 0,
          }}
        />
        <span>{row.text}</span>
      </div>
    );
  }

  const isActive = activeTaskId != null && String(row.id) === activeTaskId;

  return (
    <div
      style={{
        paddingLeft: 20,
        color: isActive ? '#93c5fd' : undefined,
        fontWeight: isActive ? 600 : undefined,
        transition: 'color 150ms ease',
      }}
    >
      {row.text}
    </div>
  );
}

const columns = [{ id: 'text', header: 'Task', width: 140, resize: false, cell: TaskNameCell }];

export function TimelineChart({ result, activeTaskId, onTaskSelect }: TimelineChartProps) {
  const ganttData = useMemo(() => buildGanttData(result), [result]);
  const [api, setApi] = useState<IApi>();

  const handleInit = useCallback(
    (ganttApi: IApi) => {
      setApi(ganttApi);
      ganttApi.on('select-task', (ev: { id: string | number }) => {
        onTaskSelect?.(String(ev.id));
      });
    },
    [onTaskSelect],
  );

  if (!ganttData) {
    return <NoDataMessage />;
  }

  // Height: scale header + rows * cellHeight + padding
  const taskCount = ganttData.tasks.length;
  const chartHeight = Math.max(200, taskCount * 32 + 80);

  return (
    <div className="p-5 gantt-timeline">
      <ActiveTaskContext.Provider value={activeTaskId ?? null}>
        <WillowDark>
          <Tooltip api={api} content={TooltipContent}>
            <div style={{ height: `${chartHeight}px` }}>
              <Gantt
                tasks={ganttData.tasks}
                links={ganttData.links}
                scales={ganttData.scales}
                start={ganttData.start}
                end={ganttData.end}
                lengthUnit="minute"
                cellWidth={ganttData.cellWidth}
                cellHeight={32}
                scaleHeight={28}
                readonly={true}
                columns={columns}
                taskTemplate={TaskBarTemplate}
                unscheduledTasks={true}
                init={handleInit}
              />
            </div>
          </Tooltip>
        </WillowDark>
      </ActiveTaskContext.Provider>

      {/* Legend */}
      <div className="flex gap-4 mt-3 justify-center text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#34d399', opacity: 0.85 }} />
          <span>Success</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#f87171', opacity: 0.85 }} />
          <span>Failed</span>
        </div>
        {(result.backgroundTasks?.length ?? 0) > 0 && (
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#a78bfa', opacity: 0.85 }} />
              <span>Permuter match</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#7c3aed', opacity: 0.85 }} />
              <span>Permuter (no match)</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NoDataMessage() {
  return (
    <div className="p-5">
      <div className="flex items-center gap-2 text-slate-500">No timeline data available</div>
    </div>
  );
}
