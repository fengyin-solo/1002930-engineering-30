/**
 * 请求层端到端验证（不依赖浏览器 / 后端）：
 * node --experimental-vm-modules scripts/verify-http.mjs
 *
 * 起一个可控的本地 HTTP 服务，stub 掉 sessionStorage / navigator，
 * 用 pinia 的最小响应式替身驱动 src/api/http.ts。
 */
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// ---------- 最小 pinia 替身（只覆盖 http/session/notice 用到的 API） ----------
function createMiniStore(initial, actions = {}) {
  const store = { ...initial }
  store.$patch = (p) => Object.assign(store, typeof p === 'function' ? p(store) : p)
  for (const [name, fn] of Object.entries(actions)) {
    store[name] = (...args) => fn(store, ...args)
  }
  return store
}

let persisted = null
globalThis.sessionStorage = {
  getItem: () => persisted,
  setItem: (_k, v) => {
    persisted = v
  },
  removeItem: () => {
    persisted = null
  },
}

const notices = createMiniStore({ latest: null, seq: 0 }, {
  push(s, n) {
    s.seq += 1
    s.latest = { ...n, id: s.seq }
  },
  clear(s, tag) {
    if (tag === undefined || s.latest?.tag === tag) s.latest = null
  },
})

const session = createMiniStore(
  {
    operator: 'tester',
    shiftLabel: '白班',
    scope: 'x',
    token: 'TOKEN-1',
    issuedAt: 1,
    isAuthenticated: true,
    expired: false,
    authHeader: 'Bearer TOKEN-1',
  },
  {
    handleExpired(s) {
      s.isAuthenticated = false
      s.token = ''
      console.log('    [session] handleExpired called')
    },
  },
)

// 用 esbuild 把 http.ts 与替身 store 打成一个 IIFE，再在当前进程执行。
import { build } from 'esbuild'

const virtualSetup = `
export const useSessionStore = () => globalThis.__session
export const useNoticeStore = () => globalThis.__notices
`
const bundle = await build({
  stdin: {
    contents: `
import * as http from '@/api/http'
import { ApiError } from '@/api/http'
globalThis.__http = { ...http, ApiError }
`,
    loader: 'ts',
    resolveDir: root,
  },
  bundle: true,
  format: 'iife',
  platform: 'node',
  write: false,
  define: {
    'import.meta.env.VITE_API_BASE': JSON.stringify(''),
    'import.meta.env.VITE_HTTP_TIMEOUT': JSON.stringify('10000'),
  },
  alias: {
    '@': path.join(root, 'src'),
  },
  plugins: [
    {
      name: 'stub-stores',
      setup(b) {
        b.onResolve({ filter: /stores\/(session|notice)$/ }, (args) => {
          return { path: args.path, namespace: 'stub' }
        })
        b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
          contents: args.path.endsWith('session') ? virtualSetup : virtualSetup,
          loader: 'ts',
        }))
      },
    },
  ],
})

globalThis.__session = session
globalThis.__notices = notices
// eslint-disable-next-line no-new-func
new Function(bundle.outputFiles[0].text)()
const http = globalThis.__http

// ---------- 可控 mock 服务 ----------
let requestCount = 0
const authHeaderSeen = []
const server = createServer((req, res) => {
  requestCount += 1
  authHeaderSeen.push(req.headers.authorization ?? null)
  const url = req.url
  if (url === '/ok') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ hello: 'world' }))
  }
  if (url === '/business-fail') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ ok: false, message: '该设备已注销，不能办理登记' }))
  }
  if (url === '/http-fail') {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ detail: '每页最多 200 条' }))
  }
  if (url === '/unauthorized') {
    res.statusCode = 401
    return res.end(JSON.stringify({ detail: 'bad token' }))
  }
  if (url === '/slow') {
    return setTimeout(() => res.end(JSON.stringify({ ok: true })), 300)
  }
  if (url.startsWith('/action')) {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      setTimeout(() => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, message: `done ${body.length}` }))
      }, 100)
    })
    return
  }
  res.statusCode = 404
  res.end()
})
await new Promise((r) => server.listen(8931, r))
const base = 'http://127.0.0.1:8931'

let passed = 0
let failed = 0
async function check(name, fn) {
  notices.latest = null
  try {
    await fn()
    passed += 1
    console.log(`PASS ${name}`)
  } catch (e) {
    failed += 1
    console.log(`FAIL ${name}: ${e.message}`)
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// 1. 正常取数 + 身份头从 session 一处注入
await check('成功请求并注入 Authorization', async () => {
  const data = await http.fetchJson(`${base}/ok`, { tag: 't1' })
  assert(data.hello === 'world', '数据解析错误')
  assert(authHeaderSeen.at(-1) === 'Bearer TOKEN-1', '身份头未从 session 注入')
  assert(notices.latest === null, '成功后不应有提示')
})

// 2. 业务异常：200 + ok:false 必须当失败
await check('业务异常 ok:false 抛出 business 错误并统一回显', async () => {
  let caught
  try {
    await http.fetchJson(`${base}/business-fail`, { tag: 't2', source: '使用登记' })
  } catch (e) {
    caught = e
  }
  assert(caught?.kind === 'business', '错误分档应为 business')
  assert(caught.retryable === false, '业务异常不应可重试')
  assert(notices.latest?.text === '该设备已注销，不能办理登记', '原因未统一回显')
  assert(notices.latest.source === '使用登记', '来源未登记')
})

// 3. HTTP 异常：非 2xx 抛出且带服务端 detail
await check('HTTP 400 抛出并回显 detail', async () => {
  let caught
  try {
    await http.fetchJson(`${base}/http-fail`, { tag: 't3' })
  } catch (e) {
    caught = e
  }
  assert(caught?.kind === 'http' && caught.status === 400, '分档/状态码错误')
  assert(notices.latest?.text === '每页最多 200 条', 'detail 未回显')
  assert(caught.retryable === true, 'HTTP 异常应可重试')
})

// 4. 401：身份失效
await check('401 触发会话失效', async () => {
  let caught
  try {
    await http.fetchJson(`${base}/unauthorized`, { tag: 't4' })
  } catch (e) {
    caught = e
  }
  assert(caught?.status === 401, '应为 401')
  assert(session.isAuthenticated === false, '会话未立即失效')
  session.isAuthenticated = true // 还原以便后续用例
  session.token = 'TOKEN-1'
})

// 5. 超时分档
await check('超时归类为 timeout', async () => {
  let caught
  try {
    await http.fetchJson(`${base}/slow`, { tag: 't5', timeout: 50 })
  } catch (e) {
    caught = e
  }
  assert(caught?.kind === 'timeout', `应为 timeout，实际 ${caught?.kind}`)
  assert(notices.latest?.tag === 't5', '超时应登记原因')
})

// 6. 断网分档（指向一个必然拒绝连接的端口）
await check('断网归类为 offline', async () => {
  const promise = http.fetchJson('http://127.0.0.1:1/x', { tag: 't6', timeout: 4000 })
  let caught
  try {
    await promise
  } catch (e) {
    caught = e
  }
  assert(caught?.kind === 'offline', `应为 offline，实际 ${caught?.kind} (${caught?.message})`)
})

// 7. 同动作并发：只放行一次
await check('POST 同动作并发只真正发送一次', async () => {
  const before = requestCount
  const [a, b] = await Promise.all([
    http.postJson(`${base}/action`, { values: { action: '办理登记' } }, { tag: 'a1' }),
    http.postJson(`${base}/action`, { values: { action: '办理登记' } }, { tag: 'a2' }),
  ])
  assert(requestCount - before === 1, `应只发 1 次，实际 ${requestCount - before}`)
  assert(a.message === b.message, '复用结果不一致')
})

// 7b. 不同行（路径不同）的相同动作不允许被合并
await check('不同路径的同动作不合并，各自放行', async () => {
  const before = requestCount
  await Promise.all([
    http.postJson(`${base}/action/1`, { values: { action: '办理登记' } }, { tag: 'b1' }),
    http.postJson(`${base}/action/2`, { values: { action: '办理登记' } }, { tag: 'b2' }),
  ])
  assert(requestCount - before === 2, `不同行动作应发 2 次，实际 ${requestCount - before}`)
})

// 8. GET 同 tag 顶替
await check('GET 同 tag 新请求顶替旧请求（旧的静默取消）', async () => {
  let firstError
  const p1 = http.fetchJson(`${base}/slow`, { tag: 'dup' }).catch((e) => (firstError = e))
  await new Promise((r) => setTimeout(r, 20))
  const p2 = http.fetchJson(`${base}/ok`, { tag: 'dup' })
  const second = await p2
  await p1
  assert(firstError?.kind === 'aborted', '旧请求应被静默取消')
  assert(second.hello === 'world', '新请求应正常完成')
  assert(notices.latest === null, '顶替不应产生提示')
})

// 9. 重试：失败后按断掉那次重发，handler 优先
await check('重试走登记的 handler 并能成功清错', async () => {
  let attempts = 0
  let shouldFail = true
  const server2 = createServer((req, res) => {
    attempts += 1
    if (shouldFail) {
      shouldFail = false
      res.statusCode = 500
      return res.end(JSON.stringify({ detail: '临时故障' }))
    }
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ retried: true }))
  })
  await new Promise((r) => server2.listen(8932, r))
  const tag = 'retry-tag'
  let result
  await http
    .fetchJson('http://127.0.0.1:8932/data', { tag })
    .then((d) => (result = d))
    .catch(() => {})
  assert(notices.latest?.tag === tag, '失败应登记')
  http.registerRetryHandler(tag, () => {
    http.fetchJson('http://127.0.0.1:8932/data', { tag }).then((d) => (result = d))
  })
  const ok = http.retry(tag)
  assert(ok, 'retry 应返回 true')
  await new Promise((r) => setTimeout(r, 50))
  assert(result?.retried === true, '重试未成功')
  assert(notices.latest === null, '重试成功后原因应撤下')
  server2.close()
})

// 10. 取消：同一套 AbortController
await check('取消在途请求归类 aborted 并提示', async () => {
  let caught
  const p = http.fetchJson(`${base}/slow`, { tag: 'cancel-me' }).catch((e) => (caught = e))
  await new Promise((r) => setTimeout(r, 20))
  http.cancel('cancel-me', '测试模块')
  await p
  assert(caught?.kind === 'aborted', `应为 aborted，实际 ${caught?.kind}`)
  assert(notices.latest?.text === '已取消本次请求', '取消提示未统一登记')
})

// 11. 退出后立即失效：取消全部 + 后续请求无头
await check('cancelAllRequests 后旧请求中止且不再带身份', async () => {
  let caught
  const p = http.fetchJson(`${base}/slow`, { tag: 'logout-x' }).catch((e) => (caught = e))
  await new Promise((r) => setTimeout(r, 20))
  http.cancelAllRequests()
  await p
  assert(caught?.kind === 'aborted', '在途请求应被中止')
  session.token = ''
  await http.fetchJson(`${base}/ok`, { tag: 'after-logout' })
  assert(authHeaderSeen.at(-1) == null, '退出后不应再带身份头')
})

server.close()
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
