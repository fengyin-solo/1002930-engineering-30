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

### 前端请求层约定（统一入口，不再各页各写一套）

所有 HTTP 请求只允许从 `frontend/src/api/http.ts` 走（旧的 `@/api/client`
仅作兼容再导出），模块页统一使用 `src/composables/useModuleResource.ts`：

- **身份一处取**：令牌只存 `src/stores/session.ts`（sessionStorage 单条序列化），
  请求头由 http 层统一注入，页面不得自行拼装。退出 / 401 立即清空身份并
  `cancelAllRequests()` 取消全部在途请求，旧令牌不再随请求发出。
- **错误分档**（`ApiError.kind`）：`timeout`（默认 10s，`VITE_HTTP_TIMEOUT`
  可配）、`offline`（断网 / 连接失败）、`http`（非 2xx，附状态码与服务端
  detail）、`business`（HTTP 200 但响应体 `ok:false`，不可重试）、
  `aborted`（取消 / 被新请求顶替，静默）。非 2xx 一律抛错，不允许当成功继续走。
- **统一回显**：失败原因只登记到 `src/stores/notice.ts` 的 `latest`，
  顶栏 `NoticeBar`、页脚、其它页面读到的是同一份；成功后自动撤下对应原因。
- **从断掉那次接着取**：同 tag 的 GET 新请求顶掉旧请求（旧的静默取消），
  tag 留档最近一次入参，“重试”按原入参重发（筛选条件不丢）。
- **并发提交只放行一次**：同动作的非 GET 请求按 `方法+地址+请求体` 自动合并，
  复用同一个响应；在途期间按钮禁用。
- **重试 / 取消同一套**：`retry(tag)` / `cancel(tag)` 与超时共用
  AbortController；可重试性由分档决定（业务校验失败不提供重试）。
- 页面取数失败不得用假数据兜底，空表格区分为“暂无数据”与“数据未取到”。

本地验证：`node frontend/scripts/verify-http.mjs`（11 项端到端用例覆盖
以上各档与合并 / 顶替 / 重试 / 取消 / 退出失效）。

### 本地开发与构建依赖约定

- Node `>=18`（已写入 `frontend/package.json` 的 `engines`）；包管理器随
  仓库 lockfile，使用 npm。
- 运行依赖（dependencies）：`vue` / `vue-router` / `pinia`——请求层基于
  原生 `fetch` + `AbortController`，**不引入** axios 等第二套 HTTP 库。
- 构建依赖（devDependencies）：`vite` / `@vitejs/plugin-vue` / `typescript`
  / `vue-tsc`；`npm run build` 先做 `vue-tsc --noEmit` 类型门禁再打包。
- 本地环境变量写在 `frontend/.env.development`：`VITE_API_BASE`（留空走
  vite 代理）、`VITE_HTTP_TIMEOUT`（请求超时毫秒，默认 10000）。

