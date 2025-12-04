// 主进程日志IPC处理器
// 这个文件包含日志相关的IPC处理函数，需要在main.js中引入

const { ipcMain } = require('electron');
const { getLogger } = require('./logger');

function setupLoggerIPC() {
  // 渲染进程日志接口
  ipcMain.handle('log-info', (event, message, data) => {
    const logger = getLogger();
    logger.info(`[渲染进程] ${message}`, data);
  });

  ipcMain.handle('log-warn', (event, message, data) => {
    const logger = getLogger();
    logger.warn(`[渲染进程] ${message}`, data);
  });

  ipcMain.handle('log-error', (event, message, data) => {
    const logger = getLogger();
    logger.error(`[渲染进程] ${message}`, data);
  });

  ipcMain.handle('log-debug', (event, message, data) => {
    const logger = getLogger();
    logger.debug(`[渲染进程] ${message}`, data);
  });

  ipcMain.handle('log-function', (event, functionName, params) => {
    const logger = getLogger();
    logger.logFunction(`[渲染进程] ${functionName}`, params);
  });

  ipcMain.handle('log-step', (event, stepNumber, stepName, status) => {
    const logger = getLogger();
    logger.logStep(stepNumber, `[渲染进程] ${stepName}`, status);
  });

  // 获取日志文件路径
  ipcMain.handle('get-log-path', () => {
    const logger = getLogger();
    return {
      logPath: logger.getLogPath(),
      crashLogPath: logger.getCrashLogPath()
    };
  });

  // 打开日志文件夹
  ipcMain.handle('open-log-folder', () => {
    const { shell } = require('electron');
    const logger = getLogger();
    const path = require('path');
    const logDir = path.dirname(logger.getLogPath());
    shell.openPath(logDir);
    return { success: true, path: logDir };
  });
}

module.exports = {
  setupLoggerIPC
};
