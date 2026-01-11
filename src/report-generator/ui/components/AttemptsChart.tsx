import { ResponsiveLine } from '@nivo/line';
import { getPluginResult } from '@shared/utils.js';

import { ReportPromptResult } from '~/report-generator/types';

interface AttemptsChartProps {
  result: ReportPromptResult;
}

export function AttemptsChart({ result }: AttemptsChartProps) {
  const data = result.attempts
    .map((attempt) => {
      const objdiffPluginResult = getPluginResult(attempt, 'objdiff');

      if (objdiffPluginResult?.data?.differenceCount !== undefined) {
        return {
          x: `Attempt ${attempt.attemptNumber}`,
          y: objdiffPluginResult.data.differenceCount,
        };
      }
    })
    .filter((point): point is { x: string; y: number } => point !== undefined);

  if (data.length === 0) {
    return (
      <div className="p-5">
        <div className="flex items-center gap-2 text-red-400">No data available for Attempts Chart</div>
      </div>
    );
  }

  return (
    <div className="h-[500px] bg-slate-800/30 rounded-lg p-4">
      <ResponsiveLine /* or Line for fixed dimensions */
        data={[
          {
            id: 'Differences',
            data,
          },
        ]}
        margin={{ top: 50, right: 110, bottom: 50, left: 60 }}
        yScale={{ type: 'linear', min: 0, max: 'auto', stacked: true, reverse: false }}
        axisBottom={{
          legend: 'attempts',
          legendOffset: 36,
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
        }}
        axisLeft={{
          legend: 'count',
          legendOffset: -40,
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
        }}
        colors={['#06b6d4']}
        lineWidth={3}
        pointSize={10}
        pointColor="#0e7490"
        pointBorderWidth={2}
        pointBorderColor="#22d3ee"
        pointLabelYOffset={-12}
        enableTouchCrosshair={true}
        useMesh={true}
        enableGridX={false}
        enableGridY={true}
        gridYValues={5}
        theme={{
          background: 'transparent',
          text: {
            fontSize: 11,
            fill: '#94a3b8',
          },
          axis: {
            domain: {
              line: {
                stroke: '#475569',
                strokeWidth: 1,
              },
            },
            legend: {
              text: {
                fontSize: 12,
                fill: '#cbd5e1',
                fontWeight: 500,
              },
            },
            ticks: {
              line: {
                stroke: '#475569',
                strokeWidth: 1,
              },
              text: {
                fontSize: 11,
                fill: '#94a3b8',
              },
            },
          },
          grid: {
            line: {
              stroke: '#334155',
              strokeWidth: 1,
            },
          },
          crosshair: {
            line: {
              stroke: '#22d3ee',
              strokeWidth: 1,
              strokeOpacity: 0.75,
            },
          },
          legends: {
            text: {
              fontSize: 12,
              fill: '#cbd5e1',
            },
          },
          tooltip: {
            container: {
              background: '#1e293b',
              color: '#e2e8f0',
              fontSize: 12,
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
              border: '1px solid #334155',
            },
          },
        }}
        legends={[
          {
            anchor: 'bottom-right',
            direction: 'column',
            translateX: 100,
            itemWidth: 80,
            itemHeight: 22,
            symbolShape: 'circle',
            itemTextColor: '#cbd5e1',
            symbolSize: 12,
            symbolBorderColor: '#22d3ee',
            effects: [
              {
                on: 'hover',
                style: {
                  itemTextColor: '#f1f5f9',
                },
              },
            ],
          },
        ]}
      />
    </div>
  );
}
