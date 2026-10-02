/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_APP_NAME?: string
  /** 单次请求超时毫秒数，默认 10000 */
  readonly VITE_HTTP_TIMEOUT?: string
  /** 可重试错误的额外重试次数，默认 2 */
  readonly VITE_HTTP_RETRIES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
