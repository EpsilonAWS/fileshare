/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MOCKING?: "enabled" | "disabled";
  readonly VITE_API_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
