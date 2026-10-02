/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_APP_NAME?: string
  /** 请求超时毫秒数，默认 10000 */
  readonly VITE_HTTP_TIMEOUT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
