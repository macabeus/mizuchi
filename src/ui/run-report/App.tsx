import { Header } from '@ui-shared/components/Header';
import { Icon } from '@ui-shared/components/Icon';
import { useMemo, useState } from 'react';

import type { ReportFilters, ReportSort } from '~/report-generator/types';

import { Filters } from './components/Filters';
import { PromptResult } from './components/PromptResult';
import { Summary } from './components/Summary';

export function App() {
  const report = window.__BENCHMARK_REPORT__;

  const [filters, setFilters] = useState<ReportFilters>({ outcome: 'all' });
  const [sort, setSort] = useState<ReportSort>({ field: 'name', direction: 'asc' });
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);

  // Get unique plugin names for filter dropdown
  const pluginNames = useMemo(() => {
    if (!report) return [];
    const names = new Set<string>();
    for (const result of report.results) {
      for (const attempt of result.attempts) {
        for (const plugin of attempt.pluginResults) {
          names.add(plugin.pluginName);
        }
      }
    }
    return Array.from(names);
  }, [report]);

  // Filter and sort results
  const filteredResults = useMemo(() => {
    if (!report) return [];

    let results = [...report.results];

    // Apply filters
    if (filters.outcome === 'success') {
      results = results.filter((r) => r.success);
    } else if (filters.outcome === 'failure') {
      results = results.filter((r) => !r.success);
    }

    if (filters.failedAtPlugin) {
      results = results.filter((r) => {
        const lastAttempt = r.attempts[r.attempts.length - 1];
        return lastAttempt?.pluginResults.some(
          (p: any) => p.pluginName === filters.failedAtPlugin && p.status === 'failure',
        );
      });
    }

    // Apply sorting
    results.sort((a, b) => {
      let comparison = 0;
      switch (sort.field) {
        case 'name':
          comparison = a.promptPath.localeCompare(b.promptPath);
          break;
        case 'duration':
          comparison = a.totalDurationMs - b.totalDurationMs;
          break;
        case 'status':
          comparison = (a.success ? 0 : 1) - (b.success ? 0 : 1);
          break;
      }
      return sort.direction === 'asc' ? comparison : -comparison;
    });

    return results;
  }, [report, filters, sort]);

  // Count for filter badges
  const filterCounts = useMemo(() => {
    if (!report) return { all: 0, success: 0, failure: 0 };
    return {
      all: report.results.length,
      success: report.results.filter((r: any) => r.success).length,
      failure: report.results.filter((r: any) => !r.success).length,
    };
  }, [report]);

  if (!report) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center bg-slate-800/50 rounded-2xl p-8 border border-slate-700 shadow-xl">
          <Icon name="document" className="w-16 h-16 mx-auto mb-4 text-slate-500" />
          <h1 className="text-2xl font-bold text-white mb-2">No Report Data</h1>
          <p className="text-slate-400">The benchmark report data was not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <Header subtitle="Run Report" rightContent={<ReportTimestamp timestamp={report.timestamp} />} />

        {/* Summary Cards */}
        <Summary summary={report.summary} config={report.config} />

        {/* Filters and Sorting */}
        <Filters
          filters={filters}
          sort={sort}
          filterCounts={filterCounts}
          pluginNames={pluginNames}
          onFiltersChange={setFilters}
          onSortChange={setSort}
        />

        {/* Results */}
        <section className="mt-8">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
            <Icon name="clipboard" className="w-6 h-6 text-cyan-400" />
            Results
            <span className="text-lg font-normal text-slate-400">({filteredResults.length})</span>
          </h2>

          <div className="space-y-4">
            {filteredResults.map((result) => (
              <PromptResult
                key={result.promptPath}
                result={result}
                isExpanded={selectedPrompt === result.promptPath}
                onToggle={() => setSelectedPrompt(selectedPrompt === result.promptPath ? null : result.promptPath)}
              />
            ))}
          </div>

          {filteredResults.length === 0 && (
            <div className="text-center py-12 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 shadow-lg">
              <Icon name="search" className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400">No results match the current filters.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ReportTimestamp({ timestamp }: { timestamp: string }) {
  const formattedDate = new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const formattedTime = new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <>
      <div className="flex items-center gap-2 text-slate-400 mb-1">
        <Icon name="calendar" className="w-4 h-4" />
        <span className="text-sm font-medium">Report generated at</span>
      </div>
      <p className="text-white font-semibold">{formattedDate}</p>
      <p className="text-slate-300 text-sm">{formattedTime}</p>
    </>
  );
}
