'use strict';

/**
 * DeepSeek Harness 桌面版 —— Electron 主进程。
 *
 * 关键点：DeepSeek Harness 的“网页版”并不是一个纯静态前端项目，而是由
 * `dsh web` 启动的一个本地 Node 服务（同时托管前端静态资源与 /api 网关，
 * 并在页面里注入 window.__DSH_BOOT__）。因此前端无法脱离该服务独立运行。
 *
 * 桌面版的做法：
 *   1. 用 Electron 拉起 `dsh web` 本地服务（用“真实 Node”运行，见下）；
 *   2. 轮询等待服务就绪；
 *   3. 用一个 BrowserWindow 加载 http://127.0.0.1:<port>。
 *
 * 这样 100% 复用原网页版的功能（agent / 工具 / 模型 / 会话 / 插件等）。
 *
 * 为什么用“真实 Node”而不是 Electron 自带的 Node（ELECTRON_RUN_AS_NODE）：
 *   dsh 依赖 node-addon-require-builtin / node-pty / sharp 等原生插件，这些是按
 *   系统 Node 的 ABI 安装的；Electron 内置 Node 的 ABI 与其不匹配（还会触发
 *   HMR 服务的 --expose-internals 问题）。因此打包时通过 extraResources 内置一份
 *   独立的 Node 运行时，用它与 dsh 的 node_modules 完全匹配。
 */

const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const APP_TITLE = 'DeepSeek Harness';
const HOST = process.env.DSH_WEB_HOST || '127.0.0.1';
const PORT = Number(process.env.DSH_WEB_PORT || 3080);
const URL = `http://${HOST}:${PORT}`;
// 本地服务的“工作目录”（agent 默认的 workspace 根目录）。
const WORKSPACE = process.env.DSH_WORKSPACE || os.homedir();

// 应用版本号（来自 package.json；标题与加载页展示用）。
let APP_VERSION = '0.0.0';
try {
  APP_VERSION = require('../package.json').version;
} catch (_) {
  /* 忽略 */
}

let mainWindow = null;
let serverProcess = null;
let quitting = false;

// 可选：重定位 userData（便于测试或高级用户迁移数据）。
if (process.env.DSH_USER_DATA) {
  app.setPath('userData', process.env.DSH_USER_DATA);
}

/** 定位 dsh 命令行入口文件（lib/bin.js 是包内自执行入口）。 */
function resolveDshEntry() {
  if (process.env.DSH_BIN) return process.env.DSH_BIN;
  try {
    return require.resolve('@deepseek-ai/dsh/lib/bin.js');
  } catch (_) {
    const pkgDir = path.dirname(require.resolve('@deepseek-ai/dsh/package.json'));
    return path.join(pkgDir, 'lib', 'bin.js');
  }
}

/**
 * 选择运行 dsh 的 Node 运行时：
 *  - 打包后：用内置的独立 Node（extraResources 拷贝到 resources/node/node.exe）。
 *  - 开发时：用系统 Node（安装 node_modules 的那个 Node），原生依赖 ABI 完全匹配。
 */
function resolveNodeBinary() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'node', 'node.exe');
  }
  return process.env.npm_node_execpath || 'node';
}

/** 启动 dsh web 本地服务（子进程）。 */
function startServer() {
  const binary = resolveNodeBinary();
  const entry = resolveDshEntry();
  const args = [entry, 'web', '--host', HOST, '--port', String(PORT)];

  serverProcess = spawn(binary, args, {
    env: process.env,
    cwd: WORKSPACE,
    stdio: 'ignore',
    windowsHide: true,
  });

  serverProcess.on('error', (err) => {
    dialog.showErrorBox(`${APP_TITLE} 启动失败`, `无法启动本地服务：\n${err.message}`);
    app.quit();
  });

  serverProcess.on('exit', (code, signal) => {
    serverProcess = null;
    if (!quitting) {
      dialog.showErrorBox(
        `${APP_TITLE} 已停止`,
        `本地服务意外退出（code=${code}，signal=${signal}）。`
      );
      app.quit();
    }
  });
}

/** 轮询等待 HTTP 服务就绪。 */
function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error(`等待本地服务超时（${url}）`));
        } else {
          setTimeout(attempt, 300);
        }
      });
      req.setTimeout(1000, () => req.destroy());
    };
    attempt();
  });
}

/** 创建主窗口（1200x800，可调整大小）。 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: `${APP_TITLE} v${APP_VERSION}`,
    autoHideMenuBar: true,
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 先显示一个轻量加载页（含版本号），等服务就绪后再加载真正的界面。
  mainWindow.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        '<body style="font-family:system-ui;background:#111827;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
          '<div style="text-align:center">' +
          '<p style="font-size:18px;margin:0 0 8px">正在启动 DeepSeek Harness…</p>' +
          `<p style="font-size:12px;color:#9ca3af;margin:0">v${APP_VERSION}</p>` +
          '</div></body>'
      )
  );

  return mainWindow;
}

/** 启动服务 + 加载页面。 */
async function boot() {
  startServer();
  try {
    await waitForServer(URL);
  } catch (err) {
    dialog.showErrorBox(`${APP_TITLE} 启动失败`, err.message);
    app.quit();
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  await mainWindow.loadURL(URL);
}

/**
 * 自动更新（electron-updater，走 GitHub Releases）。
 * 仅打包版生效；检查失败（断网/被墙等）时静默，不打扰用户。
 */
function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: APP_TITLE,
        message: `发现新版本 v${info.version}`,
        detail: '新版本已下载完成，重启后生效。',
        buttons: ['立即重启', '稍后'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      })
      .catch(() => {});
  });

  autoUpdater.on('error', () => {
    /* 静默处理：GitHub 不可达等原因不打断启动 */
  });

  // 延迟检查，避免拖慢启动
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);
}

/** 退出前终止本地服务（Windows 用 taskkill 结束整棵进程树）。 */
function stopServer() {
  if (!serverProcess) return;
  const pid = serverProcess.pid;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      serverProcess.kill('SIGTERM');
    }
  } catch (_) {
    /* 忽略清理阶段的错误 */
  }
  serverProcess = null;
}

// 单实例锁：避免同时启动两个进程争抢同一个端口。
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('ai.deepseek.harness.desktop');
    createWindow();
    boot();
    setupAutoUpdater();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      boot();
    }
  });

  app.on('before-quit', () => {
    quitting = true;
    stopServer();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
