'use strict';

/**
 * 最小安全配置的 preload。
 *
 * 网页版完全通过 HTTP 与本地 dsh 服务通信，渲染进程不需要任何 Node 能力，
 * 因此这里刻意留空：main.js 里已开启 contextIsolation、关闭 nodeIntegration，
 * 避免把 Node 权限暴露给页面。
 */
