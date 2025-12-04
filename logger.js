const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class Logger {
  constructor() {
    // 日志文件路径 - 保存在用户数据目录
    this.logDir = app.getPath('userData');
    this.logFile = path.join(this.logDir, `cursor-renewal-${this.getDateString()}.log`);
    this.crashLogFile = path.join(this.logDir, 'crash-log.txt');
    
    // 确保日志目录存在
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    // 初始化日志文件
    this.initLog();
  }
  
  getDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  
  getTimeString() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
  }
  
  initLog() {
    const header = `
========================================
Cursor Renewal Client - 日志文件
创建时间: ${new Date().toLocaleString('zh-CN')}
应用版本: ${app.getVersion()}
平台: ${process.platform}
Node版本: ${process.version}
Electron版本: ${process.versions.electron}
日志文件: ${this.logFile}
========================================\n\n`;
    
    // 写入或追加日志头
    if (!fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, header, 'utf8');
    }
    
    this.log('INFO', '日志系统初始化完成');
    this.log('INFO', `日志文件位置: ${this.logFile}`);
  }
  
  // 主日志方法
  log(level, message, data = null) {
    try {
      const timestamp = this.getTimeString();
      let logEntry = `[${timestamp}] [${level}] ${message}`;
      
      if (data) {
        if (typeof data === 'object') {
          // 对象数据格式化
          logEntry += '\n' + JSON.stringify(data, null, 2);
        } else {
          logEntry += ` | ${data}`;
        }
      }
      
      logEntry += '\n';
      
      // 同时输出到控制台
      console.log(logEntry);
      
      // 立即写入文件（同步写入，确保崩溃前能保存）
      fs.appendFileSync(this.logFile, logEntry, 'utf8');
      
      // 如果是错误，也写入崩溃日志
      if (level === 'ERROR' || level === 'FATAL') {
        this.writeCrashLog(logEntry);
      }
    } catch (error) {
      console.error('日志写入失败:', error);
    }
  }
  
  // 写入崩溃日志（独立文件，便于查看最后的错误）
  writeCrashLog(entry) {
    try {
      const crashEntry = `最后错误时间: ${new Date().toLocaleString('zh-CN')}\n${entry}\n`;
      fs.writeFileSync(this.crashLogFile, crashEntry, 'utf8');
    } catch (error) {
      console.error('崩溃日志写入失败:', error);
    }
  }
  
  // 便捷方法
  info(message, data) {
    this.log('INFO', message, data);
  }
  
  warn(message, data) {
    this.log('WARN', message, data);
  }
  
  error(message, data) {
    this.log('ERROR', message, data);
  }
  
  fatal(message, data) {
    this.log('FATAL', message, data);
  }
  
  debug(message, data) {
    this.log('DEBUG', message, data);
  }
  
  // 记录函数调用
  logFunction(functionName, params = {}) {
    this.log('FUNC', `调用函数: ${functionName}`, params);
  }
  
  // 记录步骤
  logStep(stepNumber, stepName, status = 'START') {
    this.log('STEP', `步骤 ${stepNumber}: ${stepName} [${status}]`);
  }
  
  // 记录系统信息
  logSystemInfo() {
    const info = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      memory: {
        total: `${Math.round(require('os').totalmem() / 1024 / 1024)} MB`,
        free: `${Math.round(require('os').freemem() / 1024 / 1024)} MB`
      },
      appPath: app.getAppPath(),
      userData: app.getPath('userData'),
      isPackaged: app.isPackaged
    };
    
    this.log('SYSTEM', '系统信息', info);
    return info;
  }
  
  // 获取日志文件路径
  getLogPath() {
    return this.logFile;
  }
  
  // 获取崩溃日志路径
  getCrashLogPath() {
    return this.crashLogFile;
  }
  
  // 清理旧日志（保留最近7天）
  cleanOldLogs() {
    try {
      const files = fs.readdirSync(this.logDir);
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      
      files.forEach(file => {
        if (file.startsWith('cursor-renewal-') && file.endsWith('.log')) {
          const filePath = path.join(this.logDir, file);
          const stats = fs.statSync(filePath);
          
          if (now - stats.mtime.getTime() > sevenDays) {
            fs.unlinkSync(filePath);
            this.info(`删除旧日志文件: ${file}`);
          }
        }
      });
    } catch (error) {
      this.error('清理旧日志失败', error.message);
    }
  }
}

// 创建全局日志实例
let loggerInstance = null;

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return loggerInstance;
}

module.exports = {
  Logger,
  getLogger
};
