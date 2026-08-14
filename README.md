# DeepSeek Harness 桌面版（Electron 封装）

把 DeepSeek Harness 的网页版封装成一个可在 Windows 上双击运行的桌面应用，界面与原网页版一致、功能不变，支持自动更新。

## 一、项目结构判断结论（为什么这么封装）

经检查，**DeepSeek Harness 的“网页版”不是纯静态前端项目**，而是由 `dsh web` 启动的本地 Node 服务：

- 前端静态资源（`@deepseek-ai/dsh-web-frontend/dist`）由该服务托管；
- 页面依赖服务注入的 `window.__DSH_BOOT__`；
- 所有交互走同源 `/api` 网关（`@deepseek-ai/dsh-host-apiproxy`）；
- 存在完整后端（webserver + apiproxy + Cordis 插件宿主）。

因此前端**无法脱离该服务独立运行**，不能用“直接加载 dist/index.html”的方式封装。正确做法：

> 用 Electron 启动 `dsh web` 本地服务，再用桌面窗口加载 `http://127.0.0.1:<port>`。

这样 100% 复用原网页版功能（agent / 工具 / 模型 / 会话 / 插件等）。

## 二、目录结构

```
DeepseekHarness/
├── package.json            # 桌面工程清单 + electron-builder 配置 + 脚本
├── electron/
│   ├── main.js             # 主进程：拉起 dsh web 服务 + 创建窗口 + 自动更新 + 退出清理
│   └── preload.js          # 最小安全配置（渲染进程不需要 Node 能力）
├── scripts/
│   ├── prepare-node.ps1    # 下载内置 Node 运行时（首次构建前执行一次）
│   └── check-release.mjs   # 检测 dsh 新版 + 递增版本号（CI 用）
├── build/
│   └── icon.ico            # DeepSeek 官方鲸鱼图标（透明底，多尺寸）
├── .github/workflows/
│   └── release.yml         # 自动更新流水线：定时检测 dsh 新版 → 构建 → 发 Release
├── node-runtime/           # 内置 Node 运行时（node.exe，gitignore，由脚本生成）
├── .npmrc                  # npmmirror 镜像配置（GitHub 墙场景）
├── .gitignore
└── README.md
```

## 三、环境要求

- Windows 10/11 x64
- Node.js ≥ 22（本机 v24.x）、npm（本机 v11.x）
- 首次 `npm install` 与首次打包需要联网

## 四、开发环境运行

```powershell
# 1) 安装依赖（只需一次；GitHub 不通时走 .npmrc 里的 npmmirror 镜像）
npm install

# 2) 启动桌面版（开发模式）
npm run dev          # 等价：npm start / npm run electron:dev
```

开发模式用**系统 Node** 启动 `dsh web`（与 node_modules 原生依赖 ABI 匹配），Electron 窗口加载本地页面。

可选环境变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DSH_WEB_PORT` | `3080` | 本地服务端口 |
| `DSH_WEB_HOST` | `127.0.0.1` | 监听地址 |
| `DSH_WORKSPACE` | 用户主目录 | agent 默认工作目录（workspace 根） |
| `DSH_USER_DATA` | Electron 默认 | 重定位 Electron userData（调试/迁移用） |
| `DSH_BIN` | 自动定位 | 手动指定 dsh 入口（高级） |

## 五、打包成 Windows 可执行程序

```powershell
# 0) 首次构建前：下载内置 Node 运行时（GitHub 墙场景已内置 npmmirror 镜像）
npm run prepare:node

# 1) 本地打包（不发布，产物在 dist/）
npm run build

# 2) 打包并发布到 GitHub Releases（需要 GH_TOKEN）
npm run release
```

产物在 `dist/`：

- `DeepSeek Harness Setup 0.1.0.exe` —— NSIS 安装包
- `DeepSeek Harness 0.1.0.exe` —— 便携版（免安装，双击即用）
- `latest.yml` —— 自动更新元数据（electron-updater 读取它判断版本）

## 六、自动更新（A+B 方案）

### 工作原理

- **桌面端（A）**：应用启动 5 秒后静默检查 GitHub Releases 的 `latest.yml`，发现新版本就后台下载，下载完成弹窗提示“立即重启”。
- **云端（B）**：GitHub Actions 每天定时查一次 npm 上 `@deepseek-ai/dsh` 的最新版，若比仓库里锁定的版本新，就自动：更新依赖 → 递增应用版本号 → 重新构建 → 发布新 Release。

### 首次发布（只需一次）

当前还没有任何 Release，需要先手动发一次，自动更新才有“起点”：

- **方式一（推荐，GitHub 网页）**：仓库 → Actions → 左侧 `Auto Release` → `Run workflow` → 勾选 `force` → `Run workflow`。
- **方式二（本地）**：`$env:GH_TOKEN="<你的 GitHub Token>"; npm run release`。

之后就不用管了：官方一更新 dsh，Actions 自动出新 exe，桌面版自动检测并更新。

### 注意事项

- **仓库需保持公开**：检查更新是匿名 HTTP 请求，不消耗 token；私有仓库则需要在 exe 里内置只读 token（有泄露风险），不推荐。
- **国内网络**：检查更新走 GitHub，若被墙会静默失败（不影响启动），挂代理即可。
- **版本号**：应用版本号（如 `0.1.0`）与 dsh 版本（如 `0.1.0-rc.6`）解耦，每次自动发布应用版本号 +0.0.1。

## 七、关键实现说明

1. **内置真实 Node 运行时**（而非 `ELECTRON_RUN_AS_NODE`）
   dsh 依赖 `node-addon-require-builtin` / `node-pty` / `sharp` / `koffi` 等原生
   插件，按系统 Node ABI 安装。Electron 内置 Node 的 ABI 与其不匹配（实测会导致
   HMR 服务报 `--expose-internals` 错误、服务静默退出）。因此通过
   `build.extraResources` 把一份独立 Node（v24.14.0）内置到 `resources/node/`，
   打包后用真实 Node 启动 dsh，开发时用系统 Node，ABI 完全匹配。
2. **`npmRebuild: false`**：保留原生插件按 Node ABI 编译的状态，不做 Electron ABI 重编译。
3. **`asar: false`**：需要以文件路径 spawn dsh 入口并加载原生模块，禁用 asar 更稳妥。
4. **`files` 白名单**：只把 `electron/**` 与 `package.json` 打进 app，避免把缓存/测试文件带入安装包。
5. **单实例锁**：防止同时启动两个进程争抢同一端口。
6. **退出清理**：关闭窗口时 `taskkill /T` 结束 dsh 服务整棵进程树。
7. **图标**：`build/icon.ico` 为 DeepSeek 官方鲸鱼 logo（透明底，16~256 多尺寸），由 `build.win.icon` 引用。

## 八、常见问题排查

| 现象 | 最可能原因 | 处理 |
|---|---|---|
| 窗口提示“等待本地服务超时” | 端口被占用 / dsh 启动失败 | `$env:DSH_WEB_PORT=3090; npm run dev` 换端口；或先关闭占用进程 |
| “无法启动本地服务” | Node 版本过低 / 依赖未装全 | 确认 Node ≥ 22，重新 `npm install` |
| 首次 `npm install` 卡在 electron 下载 | GitHub 直连被墙 | 确认存在 `.npmrc`（已配 npmmirror 镜像），删除 `node_modules/electron` 后重装 |
| 首次打包卡在 electron / NSIS 下载 | GitHub 直连被墙 | 确认 `.npmrc` 镜像；或手动 `$env:ELECTRON_MIRROR=...; $env:ELECTRON_BUILDER_BINARIES_MIRROR=...` 后重试 |
| 打包提示 `node-runtime/node.exe` 缺失 | 未执行 prepare-node | `npm run prepare:node` |
| 打开不提示更新 | 尚未发布过 Release / GitHub 被墙 / 仓库私有 | 先手动发一次 Release；检查网络；仓库保持公开 |
| Actions 构建失败 | runner 下载 electron 被墙 | 已配 npmmirror 镜像，一般不会；若失败看 Actions 日志 |
| 杀软报毒 | Electron 便携版被误报 | 用 NSIS 安装版并添加信任 |
| 与命令行 `dsh web` 同开冲突 | 都默认用 3080 端口、同一 `DSH_HOME` | 不要同时运行，或给桌面版指定不同端口 |

数据目录沿用 `DSH_HOME`（默认 `~/.dsh`），与命令行网页版共享会话/配置。
