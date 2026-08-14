# DeepSeek Harness 桌面版

> 用 Electron 把 [DeepSeek Harness](https://github.com/deepseek-ai) 的网页版封装成 Windows 桌面应用：**双击即用，无需命令行**，100% 复用原版功能（agent / 工具 / 模型 / 会话 / 插件），安装版支持自动更新。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 这是什么

DeepSeek Harness 的「网页版」并不是一个纯静态前端项目，而是由 `dsh web` 启动的**本地 Node 服务**（托管前端资源 + `/api` 网关，并在页面注入 `window.__DSH_BOOT__`）。因此前端无法脱离该服务独立运行。

本项目用 Electron 做了一层「薄封装」：

```
Electron 主进程
   └─ 启动 dsh web 本地服务（127.0.0.1:3080）
        └─ 轮询等待服务就绪
             └─ BrowserWindow 加载 http://127.0.0.1:3080
```

这样桌面版与命令行 `dsh web` 行为完全一致，功能零改动、零维护成本。

## 功能特性

- ✅ **桌面化体验**：免命令行，双击即用，独立窗口
- ✅ **功能 100% 复用**：agent / 工具 / 模型 / 会话 / 插件等全部继承原网页版
- ✅ **自动更新**：安装版启动后静默检查新版本，下载完成后一键重启（见[自动更新](#自动更新)）
- ✅ **单实例锁**：重复启动时聚焦已有窗口，不抢端口
- ✅ **安全隔离**：`contextIsolation` + `sandbox` + 无 Node 权限的 preload，页面零攻击面
- ✅ **与命令行版共享数据**：会话/配置沿用 `DSH_HOME`，桌面版与 `dsh web` 看到同一份记录

## 快速开始（普通用户）

前往 [Releases](https://github.com/QinHaoXiang0501/DeepSeekHarnessDesktop/releases) 页面，按需下载：

| 文件 | 类型 | 说明 |
|---|---|---|
| `DeepSeek Harness Setup 0.1.x.exe` | NSIS 安装包 | **推荐**。有安装向导、开始菜单/桌面快捷方式、卸载入口，**支持自动更新** |
| `DeepSeek Harness 0.1.x.exe` | 便携版 | 免安装，双击即用，可放 U 盘；**不支持自动更新**，且更易被杀软误报 |

> 版本号会随发布递增，请以下载页最新版本为准。

安装/解压后双击 `DeepSeek Harness.exe` 即可。

### 数据保存在哪里

聊天记录、会话、配置**不随程序存放**，而是写入独立的数据目录：

- **`DSH_HOME`**（默认 `~/.dsh`，即 `C:\Users\<你>\.dsh`）—— 会话/配置，与命令行 `dsh web` 共享
- **Electron userData** —— 窗口状态、缓存等，默认在 `%APPDATA%` 下

因此**升级或重装程序不会丢失聊天记录**。想迁移/备份数据，把 `~/.dsh` 复制走即可；想换目录，设置 `DSH_HOME` 环境变量后重启（详见下方[环境变量](#环境变量)）。

## 开发环境

```powershell
# 1) 安装依赖（只需一次；GitHub 直连不通时走 .npmrc 里的 npmmirror 镜像）
npm install

# 2) 启动桌面版（开发模式，等价 npm start / npm run electron:dev）
npm run dev
```

开发模式用**系统 Node** 启动 `dsh web`（与 node_modules 原生依赖 ABI 匹配），Electron 窗口加载本地页面。

### 环境要求

- Windows 10/11 x64
- Node.js ≥ 22（CI 使用 v24）
- 首次 `npm install` 与首次打包需联网

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DSH_HOME` | `~/.dsh` | dsh 数据目录（会话/配置），桌面版会透传给 `dsh web` |
| `DSH_WEB_PORT` | `3080` | 本地服务端口 |
| `DSH_WEB_HOST` | `127.0.0.1` | 监听地址 |
| `DSH_WORKSPACE` | 用户主目录 | agent 默认工作目录（workspace 根） |
| `DSH_USER_DATA` | Electron 默认 | 重定位 Electron userData（调试/迁移用） |
| `DSH_BIN` | 自动定位 | 手动指定 dsh 入口（高级） |

## 打包

```powershell
# 0) 首次构建前：下载内置 Node 运行时（GitHub 墙场景已内置 npmmirror 镜像）
npm run prepare:node

# 1) 本地打包（不发布，产物在 dist/）
npm run build          # 等价：npm run dist（nsis + portable 双 target）

# 2) 打包并发布到 GitHub Releases（需要 GH_TOKEN）
npm run release
```

产物位于 `dist/`：

- `DeepSeek Harness Setup 0.1.x.exe` —— NSIS 安装包
- `DeepSeek Harness 0.1.x.exe` —— 便携版（免安装）
- `latest.yml` —— 自动更新元数据（electron-updater 据此判断版本）

## 自动更新

桌面端启动 5 秒后静默检查 GitHub Releases 的 `latest.yml`，发现新版本就后台下载，完成后弹窗提示「立即重启」。

- **安装版（NSIS）**：✅ 支持自动更新
- **便携版（portable）**：❌ electron-updater 不支持该目标，需手动下载新版

云端由 GitHub Actions 驱动（`.github/workflows/release.yml`）：每天定时检查 npm 上 `@deepseek-ai/dsh` 的最新版，若比仓库锁定的版本新，则自动「更新依赖 → 递增应用版本号 → 重新构建 → 发布 Release」。

### 首次发布（只需一次）

自动更新需要仓库里已存在至少一个 Release 作为起点：

- **方式一（推荐，GitHub 网页）**：仓库 → Actions → `Auto Release` → `Run workflow` → 勾选 `force` → 运行
- **方式二（本地）**：`$env:GH_TOKEN="<token>"; npm run release`

### 注意事项

- **仓库需保持公开**：检查更新是匿名 HTTP 请求，不消耗 token；私有仓库需内置只读 token（有泄露风险），不推荐
- **国内网络**：检查更新走 GitHub，被墙时会静默失败（不影响启动），挂代理即可
- **版本号解耦**：应用版本号（如 `0.1.1`）与 dsh 版本（如 `0.1.0-rc.6`）相互独立，每次自动发布应用版本号 +0.0.1

## 项目结构

```
DeepseekHarness/
├── package.json                 # 桌面工程清单 + electron-builder 配置 + 脚本
├── electron/
│   ├── main.js                  # 主进程：拉起 dsh web + 创建窗口 + 自动更新 + 退出清理
│   └── preload.js               # 最小安全配置（渲染进程无需 Node 能力）
├── scripts/
│   ├── prepare-node.ps1         # 下载内置 Node 运行时（首次构建前执行一次）
│   ├── check-release.mjs        # 检测 dsh 新版 + 递增版本号（CI 用）
│   └── publish-drafts.ps1       # 修复 NSIS+portable 双 target 的重复 draft Release
├── build/
│   └── icon.ico                 # 应用图标（多尺寸）
├── .github/workflows/
│   └── release.yml              # 自动更新流水线：定时检测 dsh 新版 → 构建 → 发 Release
├── node-runtime/                # 内置 Node 运行时（node.exe，gitignore，脚本生成）
├── .npmrc                       # npmmirror 镜像配置
└── README.md
```

## 架构与实现说明

1. **内置真实 Node 运行时**（而非 `ELECTRON_RUN_AS_NODE`）
   dsh 依赖 `node-pty` / `sharp` / `koffi` 等原生插件，按系统 Node ABI 安装，Electron 内置 Node 的 ABI 与其不匹配。因此通过 `build.extraResources` 内置独立 Node（v24），打包后用真实 Node 启动 dsh，ABI 完全匹配。
2. **`npmRebuild: false`**：保留原生插件按 Node ABI 编译的状态，不做 Electron ABI 重编译。
3. **`asar: false`**：需要以文件路径 spawn dsh 入口并加载原生模块，禁用 asar 更稳妥。
4. **`files` 白名单**：只打包 `electron/**` 与 `package.json`，避免缓存/测试文件混入安装包。
5. **单实例锁**：防止同时启动两个进程争抢同一端口。
6. **退出清理**：关闭窗口时 `taskkill /T` 结束 dsh 服务整棵进程树。
7. **安全隔离**：`contextIsolation: true` + `nodeIntegration: false` + `sandbox: true`，preload 刻意留空，渲染进程不暴露任何 Node 能力。

## 常见问题

| 现象 | 最可能原因 | 处理 |
|---|---|---|
| 窗口提示「等待本地服务超时」 | 端口被占用 / dsh 启动失败 | 换端口 `$env:DSH_WEB_PORT=3090; npm run dev`；或先关闭占用进程 |
| 「无法启动本地服务」 | Node 版本过低 / 依赖未装全 | 确认 Node ≥ 22，重新 `npm install` |
| 首次 `npm install` 卡在 electron 下载 | GitHub 直连被墙 | 确认存在 `.npmrc`（npmmirror 镜像），删除 `node_modules/electron` 后重装 |
| 首次打包卡在 electron / NSIS 下载 | GitHub 直连被墙 | 确认 `.npmrc` 镜像；或手动设置 `ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR` |
| 打包提示 `node-runtime/node.exe` 缺失 | 未执行 prepare-node | `npm run prepare:node` |
| 便携版不提示更新 | portable 不支持自动更新 | 改用安装版，或手动下载新版 |
| 打开不提示更新 | 尚未发布过 Release / GitHub 被墙 / 仓库私有 | 先手动发一次 Release；检查网络；仓库保持公开 |
| 杀软报毒 | Electron 便携版被误报 | 用 NSIS 安装版并添加信任 |
| 与命令行 `dsh web` 同开冲突 | 都默认用 3080 端口、同一 `DSH_HOME` | 不要同时运行，或给桌面版指定不同端口 |

## License

[MIT](LICENSE)
