declare module '*.png' {
  const src: string;
  export default src;
}

interface MizuchiConfig {
  serverBaseUrl: string;
  projectPath: string;
  target: string;
}

interface Window {
  __MIZUCHI_CONFIG__?: MizuchiConfig;
}
