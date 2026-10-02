/**
 * 兼容层：请求实现已统一收拢到 @/api/http。
 * 这里保留旧导出名，老页面与新代码最终走的是同一份 fetch 封装、
 * 同一套错误分档、重试 / 取消与身份注入。新代码请直接从 '@/api/http' 引入。
 */
export {
  request,
  fetchJson,
  postJson,
  parseJson,
  download,
  notify,
  retry,
  cancel,
  cancelByTag,
  hasInflight,
  ApiError,
  DEFAULT_TIMEOUT,
} from '@/api/http'
export type { RequestOptions, ErrorKind } from '@/api/http'
