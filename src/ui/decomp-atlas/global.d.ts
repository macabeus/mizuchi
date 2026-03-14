declare module '*.png' {
  const src: string;
  export default src;
}

interface MizuchiConfig {
  serverBaseUrl: string;
  projectRoot: string;
  target: string;
}

interface Window {
  __MIZUCHI_CONFIG__?: MizuchiConfig;
}
