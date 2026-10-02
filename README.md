# 特种设备安全管理平台

面向锅炉、压力容器、电梯、起重机械与场内专用机动车辆等特种设备的注册登记、定期检验、维保监管与隐患排查的一体化安全管理后台。

这是一个前后端分离的管理平台：前端 Vue 3 + Vite + TypeScript，后端 FastAPI（Python）。
两边各自独立启动，前端 dev server 已关掉自动打开页面，启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/              统一请求封装
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false）
├── backend/                  FastAPI（Python） 后端
│   ├── app/routers/          每个业务模块一组接口
│   ├── app/services/         业务规则与状态流转
│   └── app/store.py          内存数据仓库与示例数据
├── .gitignore
└── docker-compose.yml
```

## 启动

### 后端

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
./run.sh
```

健康检查：`curl http://127.0.0.1:8000/api/health`

### 前端

```bash
cd frontend
npm install
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，
需要自己访问。`/api` 由 vite 代理到后端 `http://127.0.0.1:8000`。

### 本地开发与构建依赖约定

- Node 版本：`>=18`（见 `frontend/package.json` 的 `engines`）。首次开发 `npm install`，
  不额外引入请求库：HTTP 统一基于原生 `fetch` + `AbortController` 实现，无第三方运行时依赖。
- 依赖分档：Vue / Vue Router / Pinia 放在 `dependencies`；Vite、TypeScript、vue-tsc、
  插件与类型声明放在 `devDependencies`。新增依赖前先评估能否用原生能力替代。
- 常用命令：`npm run dev`（本地开发）、`npm run typecheck`（仅类型检查）、
  `npm run build`（先 `vue-tsc --noEmit` 再产物构建，CI 与发版用同一条）。
- 请求相关环境变量（`.env.development` 本地、`.env.production` 构建）：

  | 变量 | 默认 | 说明 |
  | --- | --- | --- |
  | `VITE_API_BASE` | 空（同源/代理） | 接口前缀，留空时走 vite 代理或同源网关 |
  | `VITE_HTTP_TIMEOUT` | `10000` | 单次请求超时毫秒数，超时归「超时」档 |
  | `VITE_HTTP_RETRIES` | `2` | 断网/超时/5xx/429 的额外重试次数，指数退避 300ms 起、上限 2s |

## 请求层约定（所有页面共用一份实现）

所有页面禁止各自 `fetch` / 各自编造错误文案，统一走 `src/api` 与 `src/composables`：

- 入口：`src/api/client.ts` 暴露 `request` / `fetchJson` / `postJson`，兼容旧签名
  （`fetchJson<T>(path)` 仍可用，行为已升级），页面层一般用 `useModulePage` /
  `useAsyncResource` / `useModuleList`，不要直接 new fetch。
- 错误分档（`src/api/errors.ts`）：`timeout`（超时）、`offline`（断网/网络不可达）、
  `http`（非 2xx，含 401/4xx/5xx）、`business`（HTTP 200 但 `{ok:false}`，动作接口的业务拒绝）、
  `aborted`（主动取消）。非 200 一律抛错，绝不继续当成功往下走；200 但 `ok:false` 同样抛业务异常。
- 统一回显：原因只写进 Pinia 的 notice store（`src/stores/notice.ts`），页面用
  `src/components/RequestNotice.vue` 按 `noticeKey` 读同一份；其他页面/组件用同一个 key
  读到的就是出错处写入的那句，全局最近一次原因可取 `notices.latest`。不再吞错留白。
- 超时/断网/5xx/429 自动重试（退避可被取消打断）；重试与取消共用同一套 `AbortController`。
- 取消：页面卸载自动取消在途请求；`RequestNotice` 上的「重试/取消」走同一套信号。
- 可续取列表：`src/api/resumable.ts` 的 `ResumableList` 按页拉，某页失败时已取数据保留、
  游标停在没取到的页，再调 `resume()`/页面上的「接着取」只重发那一页。
- 并发去重：相同的在途 GET 自动合并只发一次；提交型请求传同一个 `dedupeKey`
  （页面按「模块+记录+动作」生成）即可同一动作并发只放行一次，连点不重复提交。
- 导出等下载也走统一 `request`（带身份头、统一错误处理），不再用 `window.open` 绕过请求层。

## 会话（身份）约定

- 身份只有一处：`src/api/identity.ts`。请求头的令牌与页面显示的值班信息都从这里取，
  持久化只写 `localStorage` 的 `sq_session` 一个键，页面状态（`stores/session.ts`）只是只读视图。
- 退出 `logout()`（或服务端 401 触发 `invalidate()`）立即清令牌与持久化、广播失效：
  之后请求不再带身份，全部在途请求立刻取消，路由守卫把页面打回登录页。
- 本地开发可用 `/login` 页面「值班人员 + 留空令牌」生成一次性本地令牌；接入真实鉴权时
  把登录处换成后端登录接口即可，请求层与页面不用动。

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 使用登记 | `register` | 设备登记 | 设备编号、设备名称、设备种类 |
| 锅炉管理 | `boiler` | 锅炉 | 锅炉编号、锅炉型号、额定蒸发量 |
| 压力容器 | `pressurevessel` | 压力容器 | 容器编号、容器类别、设计压力 |
| 压力管道 | `pipeline` | 压力管道 | 管道编号、管道级别、设计压力 |
| 电梯管理 | `elevator` | 电梯 | 电梯编号、电梯类型、额定载重 |
| 起重机械 | `crane` | 起重机 | 起重机编号、起重机类型、额定起重量 |
| 场车管理 | `forklift` | 场内车辆 | 车辆编号、车辆类型、动力类型 |
| 定期检验 | `inspection` | 检验任务 | 检验编号、被检设备、检验类别 |
| 维保记录 | `maintenance` | 维保记录 | 维保编号、维保设备、维保单位 |
| 隐患排查 | `hazard` | 隐患记录 | 隐患编号、所在设备、隐患类别 |
| 事故管理 | `accident` | 事故记录 | 事故编号、事故设备、事故类型 |
| 作业人员 | `operator` | 作业人员 | 人员编号、姓名、证书类别 |
| 培训考核 | `training` | 培训记录 | 培训编号、培训内容、培训对象 |
| 安全阀校验 | `safetyvalve` | 安全阀 | 安全阀编号、所属设备、公称通径 |
| 压力表检定 | `gauge` | 压力表 | 压力表编号、所属设备、量程范围 |
| 备件管理 | `sparepart` | 备件 | 备件编号、备件名称、规格型号 |
| 应急演练 | `emergency` | 演练记录 | 演练编号、演练主题、演练类型 |
| 能效监测 | `energyeff` | 能效记录 | 记录编号、设备类型、耗能量 |
| 档案管理 | `archive` | 设备档案 | 档案编号、所属设备、档案类别 |
| 维保合同 | `contract` | 维保合同 | 合同编号、签约单位、维保范围 |

## 约定

- 每个模块的前端页面在 `frontend/src/views/<模块>/index.vue`，后端接口在
  `backend/app/routers/<模块>.py`，业务规则在 `backend/app/services/<模块>.py`。
- 列表接口统一返回 `{ items, total, page, size }`，动作接口统一返回 `{ ok, message }`。
- 状态流转只允许在 `app/services` 里改，路由层不做业务判断。
