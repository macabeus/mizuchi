import type { RunReport } from '~/report-generator/types';

declare global {
  interface Window {
    __RUN_REPORT__?: RunReport;
  }
}

declare module '*.png' {
  const src: string;
  export default src;
}

export {};
