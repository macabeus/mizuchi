import type { DecompFunctionDoc } from '@shared/kappa-db/kappa-db';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { LinesChart as EChartsLinesChart, ScatterChart as EChartsScatterChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useKappaDb } from '../KappaDbContext';

echarts.use([
  EChartsScatterChart,
  EChartsLinesChart,
  TooltipComponent,
  DataZoomComponent,
  GridComponent,
  CanvasRenderer,
]);

interface ScatterChartProps {
  selectedPath: string | null;
  selectedFunctionId: string | null;
  onFunctionSelect: (id: string) => void;
  onFunctionDeselect: () => void;
}

interface Point {
  x: number;
  y: number;
  fn: DecompFunctionDoc;
}

interface UmapOutput {
  coordinates: number[][];
}

interface EdgeData {
  callsEdges: { coords: number[][] }[];
  calledByEdges: { coords: number[][] }[];
}

export function ScatterChart({
  selectedPath,
  selectedFunctionId,
  onFunctionSelect,
  onFunctionDeselect,
}: ScatterChartProps) {
  const db = useKappaDb();
  const [coordinates, setCoordinates] = useState<number[][] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const echartsRef = useRef<ReactEChartsCore | null>(null);

  // Run UMAP
  useEffect(() => {
    setIsLoading(true);
    setError(null);

    const vectors = db.vectors;
    if (vectors.size === 0) {
      setIsLoading(false);
      setError('No vectors available for visualization.');
      return;
    }

    const ids: string[] = [];
    const embeddings: number[][] = [];
    for (const [id, vec] of vectors) {
      ids.push(id);
      embeddings.push(vec);
    }

    const fallbackToMainThread = () => {
      runUmapMainThread(embeddings).then(
        (coords) => {
          setCoordinates(coords);
          setIsLoading(false);
        },
        (err) => {
          setError(`UMAP failed: ${err instanceof Error ? err.message : String(err)}`);
          setIsLoading(false);
        },
      );
    };

    try {
      const worker = new Worker(new URL('../umap.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent<UmapOutput>) => {
        setCoordinates(event.data.coordinates);
        setIsLoading(false);
        worker.terminate();
      };

      worker.onerror = () => {
        fallbackToMainThread();
      };

      worker.postMessage({ embeddings });
    } catch {
      fallbackToMainThread();
    }

    return () => {
      workerRef.current?.terminate();
    };
  }, [db]);

  // Build vector ID list with memoization
  const vectorIds = useMemo(() => {
    const vectors = db.vectors;
    const ids: string[] = [];
    for (const [id] of vectors) {
      ids.push(id);
    }
    return ids;
  }, [db]);

  // O(1) coordinate lookup by function ID
  const coordinateMap = useMemo(() => {
    if (!coordinates) {
      return null;
    }
    const map = new Map<string, [number, number]>();
    for (let i = 0; i < vectorIds.length; i++) {
      map.set(vectorIds[i], [coordinates[i][0], coordinates[i][1]]);
    }
    return map;
  }, [coordinates, vectorIds]);

  // Set of IDs connected to the selected function (selected + callees + callers)
  const connectedIds = useMemo(() => {
    if (!selectedFunctionId) {
      return null;
    }
    const fn = db.getFunctionById(selectedFunctionId);
    if (!fn) {
      return null;
    }
    const ids = new Set<string>();
    ids.add(selectedFunctionId);
    for (const calleeId of fn.callsFunctions) {
      ids.add(calleeId);
    }
    for (const caller of db.getCalledBy(selectedFunctionId)) {
      ids.add(caller.id);
    }
    return ids;
  }, [selectedFunctionId, db]);

  const chartData = useMemo(() => {
    if (!coordinates || coordinates.length === 0) {
      return null;
    }

    const hasCCode: Point[] = [];
    const asmOnly: Point[] = [];
    const selected: Point[] = [];
    const dimmed: Point[] = [];
    const connectedHasC: Point[] = [];
    const connectedAsmOnly: Point[] = [];
    const selectedNode: Point[] = [];

    for (let i = 0; i < vectorIds.length; i++) {
      const fn = db.getFunctionById(vectorIds[i]);
      if (!fn) {
        continue;
      }

      const point: Point = {
        x: coordinates[i][0],
        y: coordinates[i][1],
        fn,
      };

      if (selectedFunctionId && connectedIds) {
        if (fn.id === selectedFunctionId) {
          selectedNode.push(point);
        } else if (connectedIds.has(fn.id)) {
          if (fn.cCode) {
            connectedHasC.push(point);
          } else {
            connectedAsmOnly.push(point);
          }
        } else {
          dimmed.push(point);
        }
      } else if (selectedPath) {
        const matchesPath = fn.cModulePath?.startsWith(selectedPath) || fn.asmModulePath.startsWith(selectedPath);
        if (matchesPath) {
          selected.push(point);
        } else {
          dimmed.push(point);
        }
      } else {
        if (fn.cCode) {
          hasCCode.push(point);
        } else {
          asmOnly.push(point);
        }
      }
    }

    if (selectedFunctionId && connectedIds) {
      return [
        { id: 'Dimmed', data: dimmed },
        { id: 'Connected (asm)', data: connectedAsmOnly },
        { id: 'Connected (C)', data: connectedHasC },
        { id: 'Selected node', data: selectedNode },
      ];
    }

    if (selectedPath) {
      return [
        { id: 'Dimmed', data: dimmed },
        { id: 'Selected', data: selected },
      ];
    }

    return [
      { id: 'Assembly only', data: asmOnly },
      { id: 'Has C code', data: hasCCode },
    ];
  }, [coordinates, vectorIds, db, selectedPath, selectedFunctionId, connectedIds]);

  // Edge data: computed when a function is selected
  const edgeData = useMemo((): EdgeData | null => {
    if (!selectedFunctionId || !coordinateMap) {
      return null;
    }
    const fn = db.getFunctionById(selectedFunctionId);
    if (!fn) {
      return null;
    }
    const selCoord = coordinateMap.get(selectedFunctionId);
    if (!selCoord) {
      return null;
    }

    const callsEdges: { coords: number[][] }[] = [];
    for (const calleeId of fn.callsFunctions) {
      const coord = coordinateMap.get(calleeId);
      if (coord) {
        callsEdges.push({ coords: [selCoord, coord] });
      }
    }

    const calledByEdges: { coords: number[][] }[] = [];
    for (const caller of db.getCalledBy(selectedFunctionId)) {
      const coord = coordinateMap.get(caller.id);
      if (coord) {
        calledByEdges.push({ coords: [coord, selCoord] });
      }
    }

    return { callsEdges, calledByEdges };
  }, [selectedFunctionId, coordinateMap, db]);

  const colors = useMemo(() => {
    if (selectedFunctionId && connectedIds) {
      return ['rgba(148, 163, 184, 0.3)', '#FFFFFF', '#FF69B4', '#facc15'];
    }
    if (selectedPath) {
      return ['rgba(148, 163, 184, 0.1)', '#007ACC'];
    }
    return ['#FFFFFF', '#FF69B4'];
  }, [selectedFunctionId, connectedIds, selectedPath]);

  const buildOption = useCallback((data: typeof chartData, cols: string[], edges: EdgeData | null) => {
    if (!data) {
      return {};
    }

    const scatterSeries = data.map((series, i) => {
      const isSelectedNode = series.id === 'Selected node';
      return {
        name: series.id,
        type: 'scatter' as const,
        progressive: 0,
        clip: true,
        symbolSize: isSelectedNode ? 12 : 4,
        itemStyle: {
          color: cols[i],
          ...(isSelectedNode
            ? {
                borderWidth: 2,
                borderColor: '#fff',
                shadowBlur: 15,
                shadowColor: '#facc15',
              }
            : {}),
        },
        data: series.data.map((p) => [p.x, p.y, p.fn]),
      };
    });

    const linesSeries: object[] = [];
    if (edges) {
      const makeLinesSeries = (name: string, color: string, curveness: number, data: { coords: number[][] }[]) =>
        data.length > 0
          ? {
              name,
              type: 'lines',
              coordinateSystem: 'cartesian2d',
              silent: true,
              clip: true,
              lineStyle: { color, width: 1.5, opacity: 0.7, curveness },
              effect: { show: false },
              symbol: ['none', 'arrow'],
              symbolSize: 6,
              data,
            }
          : null;

      const calls = makeLinesSeries('Calls', '#f59e0b', 0.2, edges.callsEdges);
      const calledBy = makeLinesSeries('Called by', '#06b6d4', -0.2, edges.calledByEdges);
      if (calls) {
        linesSeries.push(calls);
      }
      if (calledBy) {
        linesSeries.push(calledBy);
      }
    }

    return {
      animation: false,
      grid: {
        top: 20,
        right: 20,
        bottom: 20,
        left: 20,
        containLabel: false,
      },
      xAxis: {
        type: 'value' as const,
        show: false,
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        show: false,
        splitLine: { show: false },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' as const },
        { type: 'inside', yAxisIndex: 0, filterMode: 'none' as const },
      ],
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: '#1e293b',
        borderColor: '#475569',
        borderWidth: 1,
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: { data: [number, number, DecompFunctionDoc] }) => {
          const fn = params.data[2];
          const status = fn.cCode
            ? '<span style="color:#f472b6">Has C code</span>'
            : '<span style="color:#64748b">Assembly only</span>';
          return `<div style="max-width:250px">
            <div style="font-weight:600;color:#fff">${fn.name}</div>
            <div style="color:#94a3b8;font-size:11px;margin-top:2px">${fn.cModulePath || fn.asmModulePath}</div>
            <div style="font-size:11px;margin-top:2px">${status}</div>
          </div>`;
        },
      },
      series: [...scatterSeries, ...linesSeries],
    };
  }, []);

  // Stable initial option for the first mount only.
  // echarts-for-react only calls setOption when the option prop reference changes,
  // so keeping a stable ref prevents it from ever re-applying after mount.
  const initialOptionRef = useRef<ReturnType<typeof buildOption> | null>(null);
  if (chartData && !initialOptionRef.current) {
    initialOptionRef.current = buildOption(chartData, colors, edgeData);
  }

  // Apply subsequent option updates via replaceMerge to preserve dataZoom state.
  // notMerge would reset zoom/pan; plain merge wouldn't clean up old series.
  // replaceMerge: ['series'] replaces series cleanly while keeping dataZoom intact.
  const isInitialMount = useRef(true);
  useLayoutEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const instance = echartsRef.current?.getEchartsInstance();
    if (instance && chartData) {
      instance.setOption(buildOption(chartData, colors, edgeData), { replaceMerge: ['series'] });
    }
  }, [chartData, colors, edgeData, buildOption]);

  const onEvents = useMemo(
    () => ({
      click: (params: { data: [number, number, DecompFunctionDoc] }) => {
        onFunctionSelect(params.data[2].id);
      },
    }),
    [onFunctionSelect],
  );

  const dispatchZoom = useCallback((startX: number, endX: number, startY: number, endY: number) => {
    const instance = echartsRef.current?.getEchartsInstance();
    if (!instance) {
      return;
    }
    instance.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: startX, end: endX });
    instance.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: startY, end: endY });
  }, []);

  const zoomIn = useCallback(() => {
    const instance = echartsRef.current?.getEchartsInstance();
    if (!instance) {
      return;
    }
    const opts = instance.getOption() as { dataZoom: { start: number; end: number }[] };
    const delta = 15;
    dispatchZoom(
      Math.min(opts.dataZoom[0].start + delta, 50),
      Math.max(opts.dataZoom[0].end - delta, 50),
      Math.min(opts.dataZoom[1].start + delta, 50),
      Math.max(opts.dataZoom[1].end - delta, 50),
    );
  }, [dispatchZoom]);

  const zoomOut = useCallback(() => {
    const instance = echartsRef.current?.getEchartsInstance();
    if (!instance) {
      return;
    }
    const opts = instance.getOption() as { dataZoom: { start: number; end: number }[] };
    const delta = 15;
    dispatchZoom(
      Math.max(opts.dataZoom[0].start - delta, 0),
      Math.min(opts.dataZoom[0].end + delta, 100),
      Math.max(opts.dataZoom[1].start - delta, 0),
      Math.min(opts.dataZoom[1].end + delta, 100),
    );
  }, [dispatchZoom]);

  const resetZoom = useCallback(() => {
    dispatchZoom(0, 100, 0, 100);
  }, [dispatchZoom]);

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-12 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-slate-300 font-medium">Computing UMAP projection...</p>
        <p className="text-slate-500 text-sm mt-1">This may take a few seconds for large datasets</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-red-500/30 p-12 text-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!chartData) {
    return null;
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
      <div
        style={{
          height: 'calc(100vh - 320px)',
          minHeight: '400px',
          position: 'relative',
        }}
      >
        <ReactEChartsCore
          ref={echartsRef}
          echarts={echarts}
          option={initialOptionRef.current!}
          onEvents={onEvents}
          style={{ height: '100%', width: '100%' }}
        />

        {/* Zoom control buttons */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <button
            onClick={zoomIn}
            className="bg-slate-700/80 hover:bg-slate-600 text-slate-300 border border-slate-600 w-7 h-7 rounded flex items-center justify-center text-sm font-bold"
            title="Zoom in"
          >
            +
          </button>
          <button
            onClick={zoomOut}
            className="bg-slate-700/80 hover:bg-slate-600 text-slate-300 border border-slate-600 w-7 h-7 rounded flex items-center justify-center text-sm font-bold"
            title="Zoom out"
          >
            −
          </button>
          <button
            onClick={resetZoom}
            className="bg-slate-700/80 hover:bg-slate-600 text-slate-300 border border-slate-600 w-7 h-7 rounded flex items-center justify-center text-sm"
            title="Reset zoom"
          >
            ⟲
          </button>
          {selectedFunctionId && (
            <button
              onClick={onFunctionDeselect}
              className="bg-slate-700/80 hover:bg-slate-600 text-slate-300 border border-slate-600 w-7 h-7 rounded flex items-center justify-center text-sm"
              title="Deselect node"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

async function runUmapMainThread(embeddings: number[][]): Promise<number[][]> {
  const { UMAP } = await import('umap-js');
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: Math.min(15, Math.max(2, Math.floor(embeddings.length / 10))),
    minDist: 0.1,
  });
  return umap.fit(embeddings);
}
