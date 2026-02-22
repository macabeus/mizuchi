import type { BenchmarkReport } from '~/report-generator/types';

declare global {
  interface Window {
    __BENCHMARK_REPORT__?: BenchmarkReport;
  }
}

declare module '*.png' {
  const src: string;
  export default src;
}

export {};
