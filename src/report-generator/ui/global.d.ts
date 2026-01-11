import type { BenchmarkReport } from '~/types';

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
