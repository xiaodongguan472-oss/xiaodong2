const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, execSync } = require('child_process');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const https = require('https');
const http = require('http');

// 设置 Windows 控制台编码为 UTF-8，解决中文乱码问题
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {
    // 忽略错误，某些环境可能不支持
  }
}

// 设置 axios 默认请求头（Nginx 验证）
axios.defaults.headers.common['xxcdndlzs'] = 'curs';
axios.defaults.headers.common['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
// const { resetMachineGuid } = require('./regedit-utils');  // 禁用注册表操作，避免macOS崩溃
const { safeModifyFile } = require('./file-permission-utils');

app.whenReady().then(() => {
  createWindow();
});

// 运行时保护 (已禁用，避免模块缺失错误)
// const RuntimeProtection = require('./scripts/runtime-protection');
// let protection;

let Database;

try {
  Database = require('better-sqlite3');
  console.log('better-sqlite3模块加载成功');
} catch (err) {
  console.error('better-sqlite3模块加载失败:', err.message);
  console.warn('部分功能可能无法正常工作，请安装必要的依赖: npm install better-sqlite3');
  // 不退出应用，继续执行，但在使用Database的地方要检查模块是否存在
}

// 是否是开发环境
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
let mainWindow;

// HTTP请求工具函数
function makeHttpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'xxcdndlzs': 'curs',  // Nginx 验证请求头
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...options.headers
      },
      timeout: options.timeout || 5000 // 5秒超时
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (parseError) {
          reject(new Error(`解析响应失败: ${parseError.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`请求失败: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    if (options.data) {
      req.write(JSON.stringify(options.data));
    }

    req.end();
  });
}

// 设置自定义缓存路径
const userDataPath = app.getPath('userData');
const cachePath = path.join(userDataPath, 'Cache');
// 确保缓存目录存在
if (!fs.existsSync(cachePath)) {
  try {
    fs.mkdirSync(cachePath, { recursive: true });
  } catch (err) {
    console.error('创建缓存目录失败:', err);
  }
}
app.commandLine.appendSwitch('disk-cache-dir', cachePath);

// 性能优化设置
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-features', 'TranslateUI');

// 忽略证书错误，允许加载自签名证书的HTTPS资源（如图片）
app.commandLine.appendSwitch('ignore-certificate-errors', 'true');
app.commandLine.appendSwitch('disable-ipc-flooding-protection');
app.commandLine.appendSwitch('no-sandbox');
// 修复中文乱码的相关设置
app.commandLine.appendSwitch('force-utf8');
app.commandLine.appendSwitch('lang', 'zh-CN');
// 启用硬件加速以提升性能（如果系统支持）
// app.disableHardwareAcceleration();

// 创建主窗口
function createWindow() {
  // 确保控制台输出使用UTF-8编码
  if (process.platform === 'win32') {
    try {
      // 强制设置控制台输出编码
      process.stdout.write('\x1b]0;Cursor续杯工具\x07'); // 设置窗口标题
      console.log('Windows控制台编码优化完成');
    } catch (error) {
      // 忽略编码设置错误
    }
  }

  // 获取屏幕尺寸
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // 计算窗口尺寸（确保所有内容可见）
  const windowWidth = Math.min(920, Math.floor(screenWidth * 0.7));
  const windowHeight = Math.min(680, Math.floor(screenHeight * 0.8));

  // 计算窗口位置（居中）
  const x = Math.floor((screenWidth - windowWidth) / 2);
  const y = Math.floor((screenHeight - windowHeight) / 2);

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    minWidth: 920,
    minHeight: 680,
    maxWidth: windowWidth,
    maxHeight: windowHeight,
    center: true, // 确保窗口居中
    resizable: false, // 禁止调整大小
    maximizable: false, // 禁用最大化按钮
    autoHideMenuBar: true, // 隐藏菜单栏
    backgroundColor: '#0560ef', // 设置窗口背景颜色与页面背景一致
    frame: false, // 隐藏默认标题栏
    titleBarStyle: 'customButtonsOnHover', // 自定义标题栏样式
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      backgroundThrottling: false,
      offscreen: false,
      experimentalFeatures: false,
      webSecurity: false, // 允许加载外部资源（图片等）
    },
    icon: path.join(__dirname, 'icon.ico'),
    show: false, // 先不显示窗口
  });

  // 加载主页面
  mainWindow.loadFile('index.html');

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.center(); // 再次确保居中
  });

  // 开发环境打开开发者工具
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // 关闭窗口时的处理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 保存原始的console方法，防止递归调用
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// 安全的UTF-8日志输出函数
function logUTF8(...args) {
  try {
    // 将所有参数转换为字符串并确保UTF-8编码
    const message = args.map(arg => {
      if (typeof arg === 'string') {
        // 确保字符串是UTF-8编码
        return Buffer.from(arg, 'utf8').toString('utf8');
      }
      return String(arg);
    }).join(' ');

    // 使用process.stdout直接输出，避免console.log可能的编码问题
    if (process.stdout && process.stdout.write) {
      process.stdout.write(message + '\n', 'utf8');
    } else {
      // 使用原始的console.log避免递归调用
      originalConsoleLog(message);
    }
  } catch (error) {
    // 如果UTF-8输出失败，回退到原始console.log
    originalConsoleLog(...args);
  }
}

// 设置控制台编码，修复中文乱码问题
function setupConsoleEncoding() {
  try {
    // 在Windows平台设置控制台编码为UTF-8
    if (process.platform === 'win32') {
      // 设置进程的标准输出编码
      if (process.stdout && process.stdout.setDefaultEncoding) {
        process.stdout.setDefaultEncoding('utf8');
      }
      if (process.stderr && process.stderr.setDefaultEncoding) {
        process.stderr.setDefaultEncoding('utf8');
      }

      // 尝试执行chcp命令设置控制台代码页为UTF-8
      const { exec } = require('child_process');
      exec('chcp 65001', (error) => {
        if (error) {
          logUTF8('设置控制台编码为UTF-8失败，但这不会影响应用运行');
        } else {
          logUTF8('控制台编码已设置为UTF-8');
        }
      });
    }

    // 设置Node.js的默认编码
    if (isDev) {
      process.env.LANG = 'zh_CN.UTF-8';
    }

    logUTF8('控制台编码设置完成');
  } catch (error) {
    logUTF8('控制台编码设置失败: ' + error.message);
  }
}

// 只在Windows平台重写console方法
if (process.platform === 'win32') {
  console.log = function(...args) {
    try {
      logUTF8(...args);
    } catch (error) {
      originalConsoleLog(...args);
    }
  };

  console.error = function(...args) {
    try {
      logUTF8('[ERROR]', ...args);
    } catch (error) {
      originalConsoleError(...args);
    }
  };

  console.warn = function(...args) {
    try {
      logUTF8('[WARN]', ...args);
    } catch (error) {
      originalConsoleWarn(...args);
    }
  };
}

// 应用准备好后创建窗口
app.whenReady().then(async () => {
  // 首先设置控制台编码
  setupConsoleEncoding();

  // 测试中文显示是否正常
  setTimeout(() => {
    console.log('=== 中文编码测试 ===');
    console.log('应用启动成功！');
    console.log('Cursor续杯工具初始化完成');
    console.log('如果您能看到这些中文字符，说明编码问题已修复');
    console.log('===================');
  }, 1000);

  // 初始化运行时保护 (已禁用，避免模块缺失错误)
  // try {
  //   protection = new RuntimeProtection();
  //   console.log('运行时保护已启动');
  // } catch (error) {
  //   console.error('运行时保护启动失败:', error);
  // }

  // 设置应用用户数据目录
  const userDataPath = app.getPath('userData');
  console.log(`应用数据目录: ${userDataPath}`);

  // 加载配置
  loadSettings();

  // 创建窗口
  createWindow();

  // 在macOS上点击应用图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // 添加关于菜单(macOS)
  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({
      applicationName: 'Cursor续杯工具',
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: '© 2023 All Rights Reserved'
    });
  }
});

// 所有窗口关闭时退出应用（macOS除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 定义默认设置
const defaultSettings = {
  autoCheckUpdate: true,
  autoActivateOnStartup: false,
  debugMode: false,
  forceModifyMode: false,
  customCursorPath: '' // 自定义Cursor安装路径
};

// 当前设置
let currentSettings = { ...defaultSettings };

// 设置文件路径
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// 加载设置
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      currentSettings = { ...defaultSettings, ...JSON.parse(data) };
      console.log('加载设置:', currentSettings);

      // 应用设置
      applySettings();
    } else {
      // 如果设置文件不存在，创建默认设置
      saveSettings(currentSettings);
    }
  } catch (error) {
    console.error('加载设置失败:', error);
  }
}

// 保存设置
function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    currentSettings = { ...settings };
    console.log('保存设置:', currentSettings);

    // 应用设置
    applySettings();
  } catch (error) {
    console.error('保存设置失败:', error);
  }
}

// 应用设置
function applySettings() {
  // 设置环境变量
  if (currentSettings.forceModifyMode) {
    process.env.FORCE_CURSOR_MODIFY = 'true';
    console.log('已启用强制修改模式');
  } else {
    process.env.FORCE_CURSOR_MODIFY = 'false';
  }

  // 设置调试模式
  if (currentSettings.debugMode) {
    process.env.DEBUG_MODE = 'true';
    console.log('已启用调试模式');
  } else {
    process.env.DEBUG_MODE = 'false';
  }
}

// IPC 处理程序：获取设置
ipcMain.handle('get-settings', () => {
  return currentSettings;
});

// IPC 处理程序：退出应用
ipcMain.handle('quit-app', () => {
  app.quit();
});

// IPC 处理程序：保存设置
ipcMain.handle('save-settings', (event, settings) => {
  try {
    console.log('收到保存设置请求:', settings);

    // 验证设置对象
    if (!settings || typeof settings !== 'object') {
      throw new Error('无效的设置对象');
    }

    // 确保所有必需的字段都存在
    const validatedSettings = {
      autoCheckUpdate: Boolean(settings.autoCheckUpdate),
      autoActivateOnStartup: Boolean(settings.autoActivateOnStartup),
      debugMode: Boolean(settings.debugMode),
      forceModifyMode: Boolean(settings.forceModifyMode),
      customCursorPath: String(settings.customCursorPath || '')
    };

    saveSettings(validatedSettings);
    console.log('设置保存成功');
    return true;
  } catch (error) {
    console.error('保存设置失败:', error);
    throw error;
  }
});

// IPC 处理程序：禁用Cursor自动更新
ipcMain.handle('disable-cursor-auto-update', async () => {
  try {
    console.log('正在禁用Cursor自动更新...');

    // 构建settings.json路径
    let settingsPath = '';
    if (process.platform === 'win32') {
      // Windows: %APPDATA%\Cursor\User\settings.json
      settingsPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'settings.json');
    } else if (process.platform === 'darwin') {
      // macOS: ~/Library/Application Support/Cursor/User/settings.json
      settingsPath = path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'settings.json');
    } else {
      // Linux: ~/.config/Cursor/User/settings.json
      settingsPath = path.join(os.homedir(), '.config', 'Cursor', 'User', 'settings.json');
    }

    console.log(`Cursor设置文件路径: ${settingsPath}`);

    // 确保目录存在
    const settingsDir = path.dirname(settingsPath);
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
      console.log(`已创建设置目录: ${settingsDir}`);
    }

    // 读取现有设置
    let currentSettings = {};
    if (fs.existsSync(settingsPath)) {
      try {
        const settingsContent = fs.readFileSync(settingsPath, 'utf8');
        currentSettings = JSON.parse(settingsContent);
        console.log('已读取现有设置');
      } catch (parseError) {
        console.warn('解析现有设置失败，将创建新设置:', parseError.message);
        currentSettings = {};
      }
    }

    // 添加禁用自动更新的设置
    currentSettings['update.enableWindowsBackgroundUpdates'] = false;
    currentSettings['update.mode'] = 'none';

    // 创建备份
    if (fs.existsSync(settingsPath)) {
      const backupPath = `${settingsPath}.bak`;
      fs.copyFileSync(settingsPath, backupPath);
      console.log(`已创建设置文件备份: ${backupPath}`);
    }

    // 写入新设置
    fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 2), 'utf8');
    console.log('已成功禁用Cursor自动更新');

    return {
      success: true,
      message: '已成功禁用Cursor自动更新',
      settingsPath,
      settings: currentSettings
    };

  } catch (error) {
    console.error('禁用Cursor自动更新失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取当前程序运行权限
ipcMain.handle('get-current-permissions', async () => {
  try {
    let permissionLevel = 'unknown';
    let permissionDesc = '未知';

    if (process.platform === 'win32') {
      // Windows: 检查是否以管理员身份运行
      try {
        const { exec } = require('child_process');

        // 使用Promise包装exec
        const checkAdmin = () => {
          return new Promise((resolve) => {
            exec('net session >nul 2>&1', (error) => {
              if (error) {
                resolve(false); // 不是管理员
              } else {
                resolve(true); // 是管理员
              }
            });
          });
        };

        const isAdmin = await checkAdmin();

        if (isAdmin) {
          permissionLevel = 'administrator';
          permissionDesc = '管理员';
        } else {
          permissionLevel = 'user';
          permissionDesc = '标准用户';
        }
      } catch (error) {
        console.error('检测Windows权限失败:', error);
        permissionLevel = 'user';
        permissionDesc = '标准用户';
      }
    } else if (process.platform === 'darwin') {
      // macOS: 检查是否以root或sudo运行
      const userId = process.getuid();
      const groupId = process.getgid();

      if (userId === 0) {
        permissionLevel = 'root';
        permissionDesc = 'Root用户';
      } else {
        // 检查是否在admin组中
        try {
          const os = require('os');
          const userInfo = os.userInfo();

          // 简单检查，实际可能需要更复杂的权限检测
          permissionLevel = 'user';
          permissionDesc = '标准用户';
        } catch (error) {
          permissionLevel = 'user';
          permissionDesc = '标准用户';
        }
      }
    } else {
      // Linux: 检查是否以root运行
      const userId = process.getuid();

      if (userId === 0) {
        permissionLevel = 'root';
        permissionDesc = 'Root用户';
      } else {
        // 检查是否在sudo组中
        try {
          const { exec } = require('child_process');

          const checkSudo = () => {
            return new Promise((resolve) => {
              exec('groups', (error, stdout) => {
                if (error) {
                  resolve(false);
                } else {
                  const groups = stdout.toLowerCase();
                  resolve(groups.includes('sudo') || groups.includes('wheel') || groups.includes('admin'));
                }
              });
            });
          };

          const hasSudo = await checkSudo();

          if (hasSudo) {
            permissionLevel = 'sudo';
            permissionDesc = 'Sudo用户';
          } else {
            permissionLevel = 'user';
            permissionDesc = '标准用户';
          }
        } catch (error) {
          permissionLevel = 'user';
          permissionDesc = '标准用户';
        }
      }
    }

    console.log(`当前权限级别: ${permissionLevel} (${permissionDesc})`);

    return {
      success: true,
      level: permissionLevel,
      description: permissionDesc,
      platform: process.platform,
      userId: process.getuid ? process.getuid() : 'N/A',
      groupId: process.getgid ? process.getgid() : 'N/A'
    };

  } catch (error) {
    console.error('获取权限信息失败:', error);
    return {
      success: false,
      error: error.message,
      level: 'unknown',
      description: '检测失败'
    };
  }
});

// 获取机器ID
ipcMain.handle('get-machine-id', async () => {
  try {
    let machineId = '';

    if (process.platform === 'win32') {
      // Windows: 使用WMIC获取UUID
      machineId = await new Promise((resolve, reject) => {
        exec('wmic csproduct get uuid', (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }
          const uuid = stdout.split('\n')[1].trim();
          resolve(uuid);
        });
      });
    } else if (process.platform === 'darwin') {
      // macOS: 使用ioreg获取IOPlatformUUID
      machineId = await new Promise((resolve, reject) => {
        exec('ioreg -rd1 -c IOPlatformExpertDevice | grep -i "IOPlatformUUID" | awk \'{print $3}\' | sed -e s/\\\"//g', (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(stdout.trim());
        });
      });
    } else {
      // Linux: 使用/etc/machine-id或/var/lib/dbus/machine-id
      const machineIdPath = fs.existsSync('/etc/machine-id') ? '/etc/machine-id' : '/var/lib/dbus/machine-id';
      machineId = fs.readFileSync(machineIdPath, 'utf8').trim();
    }

    return machineId;
  } catch (error) {
    console.error('获取机器ID失败:', error);
    // 如果获取失败，使用网络接口MAC地址作为备选
    const networkInterfaces = os.networkInterfaces();
    for (const name of Object.keys(networkInterfaces)) {
      for (const net of networkInterfaces[name]) {
        // 跳过内部IP和非物理接口
        if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
          return net.mac;
        }
      }
    }
    return 'unknown-device-id';
  }
});

// 获取Cursor用户数据路径
ipcMain.handle('get-user-data-path', async () => {
  try {
    let userDataPath = '';

    if (process.platform === 'win32') {
      // Windows: %APPDATA%\Cursor
      userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Cursor');
    } else if (process.platform === 'darwin') {
      // macOS: ~/Library/Application Support/Cursor
      userDataPath = path.join(os.homedir(), 'Library', 'Application Support', 'Cursor');
    } else {
      // Linux: ~/.config/Cursor
      userDataPath = path.join(os.homedir(), '.config', 'Cursor');
    }

    console.log(`Cursor用户数据路径: ${userDataPath}`);
    return userDataPath;
  } catch (error) {
    console.error('获取用户数据路径失败:', error);
    throw error;
  }
});

// 获取所有可用的驱动器列表（Windows专用）
function getAvailableDrives() {
  const drives = [];
  try {
    // 检查A-Z盘符
    for (let i = 65; i <= 90; i++) {
      const drive = String.fromCharCode(i) + ':';
      try {
        fs.accessSync(drive + '\\', fs.constants.F_OK);
        drives.push(drive);
        console.log(`发现可用驱动器: ${drive}`);
      } catch (error) {
        // 驱动器不存在或无法访问，跳过
      }
    }
  } catch (error) {
    console.warn('获取驱动器列表失败:', error.message);
    // 如果获取失败，至少返回C盘
    drives.push('C:');
  }
  return drives;
}

// 搜索所有用户目录中的state.vscdb数据库文件
ipcMain.handle('find-all-cursor-databases', async () => {
  try {
    console.log('开始全盘搜索所有可能的Cursor数据库...');
    const foundDatabases = [];

    if (process.platform === 'win32') {
      // Windows: 获取所有可用驱动器并搜索
      const availableDrives = getAvailableDrives();
      console.log(`检测到 ${availableDrives.length} 个可用驱动器:`, availableDrives);

      for (const drive of availableDrives) {
        console.log(`正在搜索驱动器 ${drive} 上的Cursor数据库...`);

        // 搜索该驱动器上的Users目录
        const usersDir = path.join(drive, '\\Users');

        if (fs.existsSync(usersDir)) {
          try {
            const userDirectories = fs.readdirSync(usersDir, { withFileTypes: true })
              .filter(dirent => dirent.isDirectory())
              .map(dirent => dirent.name);

            console.log(`驱动器 ${drive} 找到 ${userDirectories.length} 个用户目录:`, userDirectories);

            for (const username of userDirectories) {
              // 跳过系统用户目录
              if (['Public', 'Default', 'Default User', 'All Users'].includes(username)) {
                continue;
              }

              // 检查标准AppData路径
              const standardCursorPath = path.join(usersDir, username, 'AppData', 'Roaming', 'Cursor');
              const standardDbPath = path.join(standardCursorPath, 'User', 'globalStorage', 'state.vscdb');

              console.log(`检查用户 ${username} (${drive}) 的标准数据库路径: ${standardDbPath}`);

              if (fs.existsSync(standardDbPath)) {
                try {
                  const stats = fs.statSync(standardDbPath);
                  foundDatabases.push({
                    username: `${username}@${drive}`,
                    path: standardDbPath,
                    size: stats.size,
                    modified: stats.mtime,
                    userDataPath: standardCursorPath,
                    drive: drive
                  });
                  console.log(`✓ 找到用户 ${username} (${drive}) 的Cursor数据库: ${standardDbPath} (${stats.size} bytes)`);
                } catch (statError) {
                  console.warn(`用户 ${username} (${drive}) 的数据库存在但无法访问: ${statError.message}`);
                }
              }

              // 同时检查可能的本地AppData路径
              const localCursorPath = path.join(usersDir, username, 'AppData', 'Local', 'Cursor');
              const localDbPath = path.join(localCursorPath, 'User', 'globalStorage', 'state.vscdb');

              if (fs.existsSync(localDbPath)) {
                try {
                  const stats = fs.statSync(localDbPath);
                  foundDatabases.push({
                    username: `${username}@${drive} (Local)`,
                    path: localDbPath,
                    size: stats.size,
                    modified: stats.mtime,
                    userDataPath: localCursorPath,
                    drive: drive
                  });
                  console.log(`✓ 找到用户 ${username} (${drive}) 的本地Cursor数据库: ${localDbPath} (${stats.size} bytes)`);
                } catch (statError) {
                  console.warn(`用户 ${username} (${drive}) 的本地数据库存在但无法访问: ${statError.message}`);
                }
              }
            }
          } catch (readDirError) {
            console.warn(`读取驱动器 ${drive} 用户目录失败:`, readDirError.message);
          }
        }

        // 同时搜索一些常见的直接路径
        const commonPaths = [
          path.join(drive, '\\Cursor'),
          path.join(drive, '\\Program Files', 'Cursor'),
          path.join(drive, '\\Program Files (x86)', 'Cursor'),
          path.join(drive, '\\ProgramData', 'Cursor')
        ];

        for (const commonPath of commonPaths) {
          const commonDbPath = path.join(commonPath, 'User', 'globalStorage', 'state.vscdb');
          if (fs.existsSync(commonDbPath)) {
            try {
              const stats = fs.statSync(commonDbPath);
              foundDatabases.push({
                username: `System@${drive}`,
                path: commonDbPath,
                size: stats.size,
                modified: stats.mtime,
                userDataPath: commonPath,
                drive: drive
              });
              console.log(`✓ 找到系统级Cursor数据库 (${drive}): ${commonDbPath} (${stats.size} bytes)`);
            } catch (statError) {
              console.warn(`系统级数据库 (${drive}) 存在但无法访问: ${statError.message}`);
            }
          }
        }
      }

      // 如果没有找到任何数据库，使用降级方案
      if (foundDatabases.length === 0) {
        console.log('全盘搜索未找到数据库，尝试降级方案...');

        // 尝试当前用户的默认路径
        const currentUserPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Cursor');
        const currentDbPath = path.join(currentUserPath, 'User', 'globalStorage', 'state.vscdb');

        if (fs.existsSync(currentDbPath)) {
          const stats = fs.statSync(currentDbPath);
          foundDatabases.push({
            username: os.userInfo().username,
            path: currentDbPath,
            size: stats.size,
            modified: stats.mtime,
            userDataPath: currentUserPath
          });
          console.log(`✓ 降级方案找到当前用户数据库: ${currentDbPath}`);
        }

        // 尝试环境变量指向的路径
        const envPaths = [
          process.env.APPDATA ? path.join(process.env.APPDATA, 'Cursor') : null,
          process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Cursor') : null,
          process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming', 'Cursor') : null
        ].filter(Boolean);

        for (const envPath of envPaths) {
          const envDbPath = path.join(envPath, 'User', 'globalStorage', 'state.vscdb');
          if (fs.existsSync(envDbPath)) {
            // 检查是否已经添加过这个路径
            const alreadyFound = foundDatabases.some(db => db.path === envDbPath);
            if (!alreadyFound) {
              try {
                const stats = fs.statSync(envDbPath);
                foundDatabases.push({
                  username: `${os.userInfo().username} (Env)`,
                  path: envDbPath,
                  size: stats.size,
                  modified: stats.mtime,
                  userDataPath: envPath
                });
                console.log(`✓ 环境变量路径找到数据库: ${envDbPath}`);
              } catch (statError) {
                console.warn(`环境变量数据库存在但无法访问: ${statError.message}`);
              }
            }
          }
        }
      }

    } else if (process.platform === 'darwin') {
      // macOS: 搜索所有用户目录
      const usersDir = '/Users';

      try {
        const userDirectories = fs.readdirSync(usersDir, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);

        for (const username of userDirectories) {
          // 跳过系统用户目录
          if (['Shared', '.localized'].includes(username) || username.startsWith('.')) {
            continue;
          }

          const userCursorPath = path.join(usersDir, username, 'Library', 'Application Support', 'Cursor');
          const dbPath = path.join(userCursorPath, 'User', 'globalStorage', 'state.vscdb');

          if (fs.existsSync(dbPath)) {
            try {
              const stats = fs.statSync(dbPath);
              foundDatabases.push({
                username: username,
                path: dbPath,
                size: stats.size,
                modified: stats.mtime,
                userDataPath: userCursorPath
              });
              console.log(`✓ 找到用户 ${username} 的Cursor数据库: ${dbPath}`);
            } catch (statError) {
              console.warn(`用户 ${username} 的数据库存在但无法访问: ${statError.message}`);
            }
          }
        }
      } catch (readDirError) {
        console.warn('读取用户目录失败:', readDirError.message);
        // 降级到只检查当前用户
        const currentUserPath = path.join(os.homedir(), 'Library', 'Application Support', 'Cursor');
        const currentDbPath = path.join(currentUserPath, 'User', 'globalStorage', 'state.vscdb');

        if (fs.existsSync(currentDbPath)) {
          const stats = fs.statSync(currentDbPath);
          foundDatabases.push({
            username: os.userInfo().username,
            path: currentDbPath,
            size: stats.size,
            modified: stats.mtime,
            userDataPath: currentUserPath
          });
        }
      }

    } else {
      // Linux: 搜索所有用户目录
      const usersDir = '/home';

      try {
        const userDirectories = fs.readdirSync(usersDir, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);

        for (const username of userDirectories) {
          const userCursorPath = path.join(usersDir, username, '.config', 'Cursor');
          const dbPath = path.join(userCursorPath, 'User', 'globalStorage', 'state.vscdb');

          if (fs.existsSync(dbPath)) {
            try {
              const stats = fs.statSync(dbPath);
              foundDatabases.push({
                username: username,
                path: dbPath,
                size: stats.size,
                modified: stats.mtime,
                userDataPath: userCursorPath
              });
              console.log(`✓ 找到用户 ${username} 的Cursor数据库: ${dbPath}`);
            } catch (statError) {
              console.warn(`用户 ${username} 的数据库存在但无法访问: ${statError.message}`);
            }
          }
        }
      } catch (readDirError) {
        console.warn('读取用户目录失败:', readDirError.message);
        // 降级到只检查当前用户
        const currentUserPath = path.join(os.homedir(), '.config', 'Cursor');
        const currentDbPath = path.join(currentUserPath, 'User', 'globalStorage', 'state.vscdb');

        if (fs.existsSync(currentDbPath)) {
          const stats = fs.statSync(currentDbPath);
          foundDatabases.push({
            username: os.userInfo().username,
            path: currentDbPath,
            size: stats.size,
            modified: stats.mtime,
            userDataPath: currentUserPath
          });
        }
      }
    }

    // 按修改时间排序，最新的在前面
    foundDatabases.sort((a, b) => b.modified - a.modified);

    console.log(`搜索完成，找到 ${foundDatabases.length} 个Cursor数据库:`);
    foundDatabases.forEach((db, index) => {
      console.log(`  ${index + 1}. 用户: ${db.username}, 路径: ${db.path}, 大小: ${db.size} bytes, 修改时间: ${db.modified}`);
    });

    return {
      success: true,
      databases: foundDatabases
    };

  } catch (error) {
    console.error('搜索Cursor数据库失败:', error);
    return {
      success: false,
      error: error.message,
      databases: []
    };
  }
});

// 打开文件对话框
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Cursor配置文件', extensions: ['json'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// 打开文件夹对话框
ipcMain.handle('open-folder-dialog', async () => {
  try {
    // 确保主窗口存在
    if (!mainWindow || mainWindow.isDestroyed()) {
      console.error('主窗口不存在或已销毁，无法打开对话框');
      return null;
    }

    // 使用Promise.race添加超时处理
    const dialogPromise = dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择Cursor安装目录',
      defaultPath: app.getPath('desktop') // 默认路径为桌面，避免卡在特殊目录
    });

    // 25秒超时
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('对话框操作超时')), 25000);
    });

    const result = await Promise.race([dialogPromise, timeoutPromise]);

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  } catch (error) {
    console.error('打开文件夹对话框失败:', error);
    return null;
  }
});

// 手动搜索Cursor数据库
ipcMain.handle('manual-search-cursor-database', async (event, searchPath) => {
  try {
    console.log(`开始手动搜索Cursor数据库，路径: ${searchPath}`);
    const foundDatabases = [];

    if (!searchPath || !fs.existsSync(searchPath)) {
      return {
        success: false,
        error: '指定的搜索路径不存在',
        databases: []
      };
    }

    // 递归搜索指定路径下的所有state.vscdb文件
    function searchDatabaseRecursive(currentPath, maxDepth = 3) {
      if (maxDepth <= 0) return;

      try {
        const items = fs.readdirSync(currentPath, { withFileTypes: true });

        for (const item of items) {
          const fullPath = path.join(currentPath, item.name);

          if (item.isFile() && item.name === 'state.vscdb') {
            // 找到数据库文件
            try {
              const stats = fs.statSync(fullPath);
              const parentDir = path.dirname(path.dirname(path.dirname(fullPath))); // globalStorage的上三级目录

              foundDatabases.push({
                username: `手动搜索@${path.basename(parentDir)}`,
                path: fullPath,
                size: stats.size,
                modified: stats.mtime,
                userDataPath: parentDir,
                isManualSearch: true
              });
              console.log(`✓ 手动搜索找到数据库: ${fullPath} (${stats.size} bytes)`);
            } catch (statError) {
              console.warn(`数据库文件存在但无法访问: ${statError.message}`);
            }
          } else if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
            // 递归搜索子目录
            searchDatabaseRecursive(fullPath, maxDepth - 1);
          }
        }
      } catch (error) {
        console.warn(`搜索目录失败: ${currentPath}, 错误: ${error.message}`);
      }
    }

    // 开始递归搜索
    searchDatabaseRecursive(searchPath);

    console.log(`手动搜索完成，找到 ${foundDatabases.length} 个数据库文件`);

    return {
      success: true,
      databases: foundDatabases,
      searchPath: searchPath
    };

  } catch (error) {
    console.error('手动搜索Cursor数据库失败:', error);
    return {
      success: false,
      error: error.message,
      databases: []
    };
  }
});

// 获取最新公告
ipcMain.handle('get-latest-notice', async () => {
  try {
    console.log('正在获取最新公告...');

    // 构建API请求URL
    const apiUrl = 'https://www.xxdlzs.top/hou/csk/notice/latest'; // Spring Boot后端API地址

    // 首先尝试从真实API获取数据
    try {
      console.log('尝试连接后端API:', apiUrl);
      const result = await makeHttpRequest(apiUrl);
      if (result && result.success && result.data) {
        console.log('从API获取公告成功:', result.data);
        return result;
      } else if (result) {
        console.log('API返回数据格式异常:', result);
      }
    } catch (apiError) {
      console.log('API请求失败，使用模拟数据:', apiError.message);
    }

    // 如果API不可用，返回模拟数据
    console.log('返回模拟的公告数据');

    // 模拟最新公告数据
    return {
      success: true,
      data: {
        id: 1,
        title: '最新公告',
        content: '不要频繁进行换号，一天之内如果进行大量无效换号，本店会进行设备封禁，一天10-20个号足够使用！！',
        time: new Date().toISOString().replace('T', ' ').substring(0, 16),
        user: '系统管理员'
      }
    };


  } catch (error) {
    console.error('获取公告失败:', error);

    // 返回默认公告
    return {
      success: false,
      error: error.message,
      data: {
        id: 0,
        title: '系统公告',
        content: '不要频繁进行换号，一天之内如果进行大量无效换号，本店会进行设备封禁，一天10-20个号足够使用！！',
        time: '2024-07-06 17:10',
        user: '系统'
      }
    };
  }
});

// 获取最新续杯工具版本信息
// 用于检查版本更新
ipcMain.handle('get-latest-tool-version', async () => {
  try {
    console.log('正在获取最新续杯工具版本信息...');

    // 构建API请求URL - 获取最新续杯工具版本
    // 根据当前系统类型获取对应的版本
    const systemType = process.platform === 'win32' ? 'windows' : 'mac';
    const apiUrl = `https://www.xxdlzs.top/hou/csk/download/latest-tool?systemType=${systemType}`;

    // 尝试从后端API获取版本数据
    try {
      console.log('尝试连接后端API:', apiUrl);
      const result = await makeHttpRequest(apiUrl);

      // 检查返回结果
      if (result && result.success && result.data) {
        console.log('从API获取续杯工具版本成功:', result.data);
        return result;
      } else if (result && !result.success) {
        console.log('API返回失败:', result.message);
        return {
          success: false,
          message: result.message || '无法获取版本信息',
          data: null
        };
      }
    } catch (apiError) {
      console.log('API请求失败:', apiError.message);
      // API不可用时，返回失败状态
      return {
        success: false,
        message: '无法连接到服务器',
        data: null
      };
    }

    // 如果没有获取到数据，返回失败
    return {
      success: false,
      message: '暂无版本信息',
      data: null
    };

  } catch (error) {
    console.error('获取续杯工具版本失败:', error);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
});

// 获取最新启用的弹窗信息
// 用于应用启动时显示重要通知
ipcMain.handle('get-latest-popup', async () => {
  try {
    console.log('正在获取最新弹窗信息...');

    // 构建API请求URL - 获取最新启用的弹窗
    const apiUrl = 'https://www.xxdlzs.top/hou/csk/popup/latest';

    // 尝试从后端API获取弹窗数据
    try {
      console.log('尝试连接后端API:', apiUrl);
      const result = await makeHttpRequest(apiUrl);

      // 检查返回结果
      if (result && result.success && result.data) {
        console.log('从API获取弹窗成功:', result.data);
        return result;
      } else if (result && !result.success) {
        // API返回失败，可能是暂无弹窗
        console.log('API返回失败:', result.message);
        return {
          success: false,
          message: result.message || '暂无弹窗',
          data: null
        };
      }
    } catch (apiError) {
      console.log('API请求失败:', apiError.message);
      // API不可用时，返回失败状态，不显示弹窗
      return {
        success: false,
        message: '无法连接到服务器',
        data: null
      };
    }

    // 如果没有获取到数据，返回失败
    return {
      success: false,
      message: '暂无弹窗信息',
      data: null
    };

  } catch (error) {
    console.error('获取弹窗失败:', error);

    // 返回失败状态
    return {
      success: false,
      error: error.message,
      message: '获取弹窗信息失败',
      data: null
    };
  }
});

// 获取二维码图片
// 用于显示售后交流群等二维码
ipcMain.handle('get-qrcode-image', async () => {
  try {
    console.log('正在获取二维码图片...');

    // 构建API请求URL - 获取最新的二维码图片
    const apiUrl = 'https://www.xxdlzs.top/hou/csk/image/latest';

    // 尝试从后端API获取图片数据
    try {
      console.log('尝试连接后端API:', apiUrl);
      const result = await makeHttpRequest(apiUrl);

      // 检查返回结果
      if (result && result.success && result.data && result.data.imagePath) {
        console.log('从API获取二维码成功:', 'https://www.xxdlzs.top/csk/' + result.data.imagePath);
        return {
          success: true,
          imagePath: 'https://www.xxdlzs.top/csk/' + result.data.imagePath,
          message: '获取二维码成功'
        };
      } else if (result && !result.success) {
        // API返回失败
        console.log('API返回失败:', result.message);
        return {
          success: false,
          message: result.message || '暂无二维码',
          imagePath: null
        };
      }
    } catch (apiError) {
      console.log('API请求失败:', apiError.message);
      // API不可用时，返回失败状态
      return {
        success: false,
        message: '无法连接到服务器',
        imagePath: null
      };
    }

    // 如果没有获取到数据，返回失败
    return {
      success: false,
      message: '暂无二维码图片',
      imagePath: null
    };

  } catch (error) {
    console.error('获取二维码失败:', error);

    // 返回失败状态
    return {
      success: false,
      error: error.message,
      message: '获取二维码图片失败',
      imagePath: null
    };
  }
});

// 读取文件内容
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content;
  } catch (error) {
    console.error('读取文件失败:', error);
    return null;
  }
});

// 写入文件
ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content);
    console.log(`成功写入文件: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`写入文件失败 ${filePath}:`, error);
    return false;
  }
});

// 获取Cursor路径的内部函数
async function getCursorPaths() {
  // 添加超时处理
  const pathSearchTimeout = 10000; // 10秒超时
  let timeoutId;

  try {
    // 创建超时Promise
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('获取Cursor路径超时'));
      }, pathSearchTimeout);
    });

    // 创建实际的路径查找Promise
    const pathFindingPromise = new Promise(async (resolve) => {
      try {
        let basePath, packagePath, mainPath, workbenchPath;

        // 在Promise内部重新获取设置，避免作用域问题
        const settings = loadSettings ? loadSettings() : currentSettings;
        
        // 首先检查是否有自定义路径
        if (settings && settings.customCursorPath && settings.customCursorPath.trim()) {
          // 使用自定义路径
          let customPath = settings.customCursorPath.trim();
          
          // 自动去除用户输入的引号
          if ((customPath.startsWith("'") && customPath.endsWith("'")) ||
              (customPath.startsWith('"') && customPath.endsWith('"'))) {
            customPath = customPath.slice(1, -1);
            console.log('去除了路径中的引号');
          }
          
          console.log(`使用自定义Cursor路径: ${customPath}`);

          // macOS: 检查是否直接指定了.app目录
          const isMacApp = process.platform === 'darwin' && 
                          (customPath.endsWith('.app') || customPath.endsWith('.app/'));
          
          if (isMacApp) {
            // 直接指定了.app目录（如 /Applications/Cursor.app）
            customPath = customPath.replace(/\/$/, ''); // 移除末尾斜杠
            basePath = path.join(customPath, 'Contents', 'Resources', 'app');
            console.log('检测到直接指定.app目录，basePath:', basePath);
          } else if (fs.existsSync(path.join(customPath, 'Cursor.exe'))) {
            // Windows: 指定的是包含Cursor.exe的目录
            basePath = path.join(customPath, 'resources', 'app');
          } else if (fs.existsSync(path.join(customPath, 'Cursor.app'))) {
            // macOS: 指定的是包含Cursor.app的父目录（如 /Applications）
            basePath = path.join(customPath, 'Cursor.app', 'Contents', 'Resources', 'app');
          } else if (fs.existsSync(path.join(customPath, 'cursor'))) {
            // Linux
            basePath = path.join(customPath, 'resources', 'app');
          } else if (fs.existsSync(path.join(customPath, 'package.json'))) {
            // 这可能直接是resources/app目录
            basePath = customPath;
          } else {
            // 尝试在自定义路径下查找resources/app
            basePath = path.join(customPath, 'resources', 'app');
          }
        } else {
          // 使用默认路径
          if (process.platform === 'win32') {
            // Windows
            basePath = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Cursor', 'resources', 'app');

            // 备用路径1: 可能的程序文件安装路径
            if (!fs.existsSync(basePath)) {
              const programFilesPath = path.join(process.env['ProgramFiles'], 'Cursor', 'resources', 'app');
              if (fs.existsSync(programFilesPath)) {
                basePath = programFilesPath;
              }
            }

            // 备用路径2: 可能的x86程序文件安装路径
            if (!fs.existsSync(basePath) && process.env['ProgramFiles(x86)']) {
              const programFilesx86Path = path.join(process.env['ProgramFiles(x86)'], 'Cursor', 'resources', 'app');
              if (fs.existsSync(programFilesx86Path)) {
                basePath = programFilesx86Path;
              }
            }
          } else if (process.platform === 'darwin') {
            // macOS
            basePath = '/Applications/Cursor.app/Contents/Resources/app';
          } else {
            // Linux
            const possiblePaths = [
              '/opt/Cursor/resources/app',
              '/usr/share/cursor/resources/app'
            ];
            for (const p of possiblePaths) {
              if (fs.existsSync(p)) {
                basePath = p;
                break;
              }
            }
          }
        }

        if (!basePath || !fs.existsSync(basePath)) {
          resolve({ error: 'Cursor安装路径不存在' });
          return;
        }

        packagePath = path.join(basePath, 'package.json');
        mainPath = path.join(basePath, 'out', 'main.js');
        workbenchPath = path.join(basePath, 'out', 'vs', 'workbench', 'workbench.desktop.main.js');

        if (!fs.existsSync(packagePath) || !fs.existsSync(mainPath)) {
          resolve({ error: 'Cursor核心文件不存在' });
          return;
        }

        // 读取版本信息
        let version = '';
        try {
          const packageContent = fs.readFileSync(packagePath, 'utf8');
          version = JSON.parse(packageContent).version;
        } catch (err) {
          console.error('读取版本信息失败:', err);
        }

        resolve({
          basePath,
          packagePath,
          mainPath,
          workbenchPath,
          version,
        });
      } catch (error) {
        // 捕获内部错误并解析为错误结果，而不是抛出异常
        console.error('获取Cursor路径时发生错误:', error);
        resolve({ error: `获取Cursor路径失败: ${error.message}` });
      }
    });

    // 使用Promise.race竞争确保有超时保护
    const result = await Promise.race([pathFindingPromise, timeoutPromise]);
    clearTimeout(timeoutId); // 清除超时计时器
    return result;

  } catch (error) {
    clearTimeout(timeoutId); // 清除超时计时器
    console.error('getCursorPaths失败:', error);
    return { error: `获取Cursor路径失败: ${error.message}` };
  }
}

// 获取Cursor相关路径
ipcMain.handle('get-cursor-paths', async () => {
  return await getCursorPaths();
});

// 验证Cursor文件完整性的辅助函数
function validateCursorFile(filePath, content) {
  try {
    // 基本的语法检查
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;

    if (openBraces !== closeBraces) {
      return { valid: false, error: `大括号不匹配: ${openBraces} vs ${closeBraces}` };
    }

    if (openParens !== closeParens) {
      return { valid: false, error: `小括号不匹配: ${openParens} vs ${closeParens}` };
    }

    // 检查是否包含明显的语法错误
    const syntaxErrors = [
      /\!\s*\!/g,  // 双感叹号
      /\?\s*\?\s*\?/g,  // 三个问号
      /return\s*\?\?/g,  // return后直接跟??
      /\{\s*\?\?/g,  // 大括号后直接跟??
    ];

    for (const errorPattern of syntaxErrors) {
      if (errorPattern.test(content)) {
        return { valid: false, error: `检测到语法错误模式: ${errorPattern.source}` };
      }
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `验证过程出错: ${error.message}` };
  }
}

// 基于Python项目逻辑的简化版本 - 修改Cursor的main.js文件
ipcMain.handle('modify-cursor-main-js', async (event, mainPath) => {
  try {
    if (!fs.existsSync(mainPath)) {
      return { success: false, error: '文件不存在' };
    }

    // 创建备份
    const backupPath = `${mainPath}.bak`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(mainPath, backupPath);
      console.log(`已创建备份: ${backupPath}`);
    }

    // 读取文件内容
    const content = fs.readFileSync(mainPath, 'utf8');

    // 添加调试日志
    console.log('开始修改main.js文件...');
    console.log('文件大小:', content.length, '字节');

    // 检查是否启用强制模式
    const forceMode = process.env.FORCE_CURSOR_MODIFY === 'true';
    console.log('强制修改模式:', forceMode ? '已启用' : '未启用');

    let newContent = content;
    let modified = false;

    // 使用Python项目中的简化正则表达式模式
    const pythonStylePatterns = [
      {
        // 基于Python项目的模式1: async getMachineId(){return [^??]+??([^}]+)}
        regex: /async getMachineId\(\)\{return [^??]+\?\?([^}]+)\}/g,
        replacement: 'async getMachineId(){return $1}'
      },
      {
        // 基于Python项目的模式2: async getMacMachineId(){return [^??]+??([^}]+)}
        regex: /async getMacMachineId\(\)\{return [^??]+\?\?([^}]+)\}/g,
        replacement: 'async getMacMachineId(){return $1}'
      }
    ];

    // 检查文件内容是否包含getMachineId函数
    if (content.includes('getMachineId')) {
      console.log('文件包含getMachineId关键词');

      // 提取并记录getMachineId函数上下文
      const contextRegex = /[\s\S]{0,100}getMachineId[\s\S]{0,100}/g;
      const contexts = content.match(contextRegex);
      if (contexts && contexts.length > 0) {
        console.log('找到的getMachineId上下文:');
        contexts.forEach((ctx, i) => {
          console.log(`上下文 ${i + 1}:`, ctx.replace(/\n/g, '\\n'));
        });
      }
    } else {
      console.log('文件不包含getMachineId关键词');
    }

    // 应用Python项目风格的简单替换
    for (const pattern of pythonStylePatterns) {
      if (pattern.regex.test(newContent)) {
        console.log('匹配到Python风格模式:', pattern.regex.source);
        const beforeReplace = newContent;
        newContent = newContent.replace(pattern.regex, pattern.replacement);

        // 验证替换是否成功
        if (newContent !== beforeReplace) {
          console.log('Python风格模式替换成功');
          modified = true;
          break; // 只应用第一个匹配的模式
        }
      }
    }

    // 如果Python风格模式失败，尝试更宽松的模式（但仍然安全）
    if (!modified) {
      console.log('尝试宽松模式...');

      // 宽松模式：直接查找并替换??操作符
      const loosePattern = /(getMachineId[^{]*\{[^}]*?return\s+[^;]*?)(\?\?)([^;}]+)/g;

      if (loosePattern.test(newContent)) {
        const beforeReplace = newContent;
        newContent = newContent.replace(loosePattern, (match, prefix, nullOp, afterNull) => {
          console.log('匹配到宽松模式:', match.substring(0, 50) + '...');

          // 验证afterNull部分是否安全
          const cleanAfterNull = afterNull.trim();
          if (cleanAfterNull && !cleanAfterNull.includes('{') && !cleanAfterNull.includes('}')) {
            return `${prefix}${cleanAfterNull}`;
          } else {
            console.log('跳过不安全的替换');
            return match; // 保持原样
          }
        });

        if (newContent !== beforeReplace) {
          console.log('宽松模式替换成功');
          modified = true;
        }
      }
    }

    // 最后的安全检查：验证修改后的代码不包含明显的语法错误
    if (modified) {
      console.log('执行语法安全检查...');

      const validation = validateCursorFile(mainPath, newContent);
      if (!validation.valid) {
        console.error(`语法验证失败: ${validation.error}`);
        console.log('恢复原始内容...');
        newContent = content; // 恢复原始内容
        modified = false;
      } else {
        console.log('语法安全检查通过');
      }
    }

    // 如果所有尝试都失败，提供强制成功选项（但要更加谨慎）
    if (!modified && process.env.FORCE_CURSOR_MODIFY === 'true') {
      console.log('强制修改模式开启，尝试最小化修改...');

      // 在强制模式下，只进行最基本的替换，避免破坏语法
      const forcePattern = /(\?\?\s*[^;}]+)/g;
      const matches = newContent.match(forcePattern);

      if (matches && matches.length > 0) {
        console.log(`强制模式：找到${matches.length}个??操作符`);

        // 只替换明确包含getMachineId上下文的??操作符
        const contextPattern = /(getMachineId[^{]*\{[^}]*?)(\?\?\s*)([^;}]+)/g;
        const beforeForce = newContent;
        newContent = newContent.replace(contextPattern, (match, prefix, nullOp, fallback) => {
          console.log('强制模式替换:', match.substring(0, 30) + '...');
          return `${prefix}${fallback.trim()}`;
        });

        if (newContent !== beforeForce) {
          modified = true;
          console.log('强制模式替换成功');
        }
      }

      // 如果强制模式仍然失败，则不修改文件
      if (!modified) {
        console.log('强制模式也无法安全修改文件');
        return { success: false, error: '无法安全修改文件，建议手动修改或使用备份恢复' };
      }
    }

    if (!modified) {
      console.log('所有模式匹配失败');
      return { success: false, error: '未找到匹配的函数模式，建议启用强制修改模式或手动修改' };
    }

    // 最终写入前的安全检查
    try {
      // 尝试解析修改后的内容（简单的语法检查）
      const testContent = newContent.substring(0, Math.min(1000, newContent.length));
      if (testContent.includes('??')) {
        console.warn('警告：修改后的内容仍包含??操作符，可能修改不完整');
      }

      // 写入修改后的内容
      fs.writeFileSync(mainPath, newContent, 'utf8');
      console.log('文件修改完成');

      return { success: true, message: '文件修改成功' };
    } catch (writeError) {
      console.error('写入文件失败:', writeError);
      return { success: false, error: `写入文件失败: ${writeError.message}` };
    }
  } catch (error) {
    console.error('修改main.js文件失败:', error);
    return { success: false, error: error.message };
  }
});

// 分析Cursor文件内容
ipcMain.handle('analyze-cursor-file', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const analysis = {
      fileSize: content.length,
      containsGetMachineId: content.includes('getMachineId'),
      containsNullishCoalescing: content.includes('??'),
      patterns: []
    };

    // 查找所有可能的getMachineId函数模式
    const searchPatterns = [
      /getMachineId[^{]*\{[^}]*\?\?[^}]*\}/g,
      /async\s+getMachineId[^{]*\{[^}]*\?\?[^}]*\}/g,
      /getMachineId\s*=\s*async[^{]*\{[^}]*\?\?[^}]*\}/g,
      /getMachineId\s*:\s*async[^{]*\{[^}]*\?\?[^}]*\}/g
    ];

    for (let i = 0; i < searchPatterns.length; i++) {
      const matches = content.match(searchPatterns[i]);
      if (matches) {
        analysis.patterns.push({
          patternIndex: i,
          matches: matches.map(match => ({
            content: match.substring(0, 100) + (match.length > 100 ? '...' : ''),
            length: match.length
          }))
        });
      }
    }

    // 查找所有包含??的行
    const lines = content.split('\n');
    const nullishLines = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('??')) {
        nullishLines.push({
          lineNumber: i + 1,
          content: lines[i].trim().substring(0, 100)
        });
      }
    }
    analysis.nullishLines = nullishLines.slice(0, 10); // 只返回前10行

    return { success: true, analysis };
  } catch (error) {
    console.error('分析文件失败:', error);
    return { success: false, error: error.message };
  }
});

// 恢复Cursor文件备份
ipcMain.handle('restore-cursor-backup', async (event, filePath) => {
  try {
    const backupPath = `${filePath}.bak`;

    if (!fs.existsSync(backupPath)) {
      return { success: false, error: '备份文件不存在' };
    }

    if (!fs.existsSync(filePath)) {
      return { success: false, error: '原文件不存在' };
    }

    // 恢复备份
    fs.copyFileSync(backupPath, filePath);
    console.log(`已恢复备份: ${backupPath} -> ${filePath}`);

    return { success: true, message: '备份恢复成功' };
  } catch (error) {
    console.error('恢复备份失败:', error);
    return { success: false, error: error.message };
  }
});

// 修改workbench.desktop.main.js文件
ipcMain.handle('modify-cursor-workbench', async (event, workbenchPath, isValid, days) => {
  try {
    if (!fs.existsSync(workbenchPath)) {
      return { success: false, error: '文件不存在' };
    }

    // 创建备份
    const backupPath = `${workbenchPath}.bak`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(workbenchPath, backupPath);
      console.log(`已创建备份: ${backupPath}`);
    }

    // 读取文件内容
    const content = fs.readFileSync(workbenchPath, 'utf8');

    // 根据卡密状态构建替换模式
    const patterns = [];

    if (isValid) {
      // 启用专业版特权
      patterns.push({
        regex: /(isPro:function\(\)\{return )(.*?)(\})/g,
        replacement: '$1true$3'
      });

      // 设置使用天数
      patterns.push({
        regex: /(getCursorTeamInfo:function\(\)\{return\{)([^}]*?)(\}\})/g,
        replacement: `$1usageDays:${days}$3`
      });
    } else {
      // 禁用专业版特权
      patterns.push({
        regex: /(isPro:function\(\)\{return )(.*?)(\})/g,
        replacement: '$1false$3'
      });
    }

    let newContent = content;
    let modified = false;

    for (const pattern of patterns) {
      if (pattern.regex.test(newContent)) {
        newContent = newContent.replace(pattern.regex, pattern.replacement);
        modified = true;
      }
    }

    // 如果所有尝试都失败，提供强制成功选项
    if (!modified && process.env.FORCE_CURSOR_MODIFY === 'true') {
      console.log('强制修改模式开启，跳过workbench.desktop.main.js模式匹配检查');
      modified = true;

      // 在强制模式下，尝试直接注入代码
      if (isValid) {
        // 尝试找到函数并替换
        const proFunctionRegex = /isPro\s*:\s*function\s*\(\s*\)\s*\{[^}]*\}/g;
        if (proFunctionRegex.test(newContent)) {
          newContent = newContent.replace(proFunctionRegex, 'isPro:function(){return true}');
          console.log('强制修改isPro函数成功');
        } else {
          // 尝试在文件末尾注入代码
          newContent = newContent + '\n// 强制启用专业版\nwindow.isPro = function() { return true; };\n';
          console.log('注入isPro函数成功');
        }
      }
    }

    if (!modified) {
      return { success: false, error: '未找到匹配的函数模式' };
    }

    // 写入修改后的内容
    fs.writeFileSync(workbenchPath, newContent, 'utf8');

    return { success: true };
  } catch (error) {
    console.error('修改workbench文件失败:', error);
    return { success: false, error: error.message };
  }
});

// 生成新的ID
function generateNewIds() {
  const machineId = uuidv4();
  const anonymousId = uuidv4();
  const machineIdHash = crypto.createHash('md5').update(uuidv4()).digest('hex');

  return {
    machineId,
    anonymousId,
    machineIdHash
  };
}

// 更新SQLite数据库中的ID
ipcMain.handle('update-cursor-sqlite-db', async (event, dbPath) => {
  try {
    if (!fs.existsSync(dbPath)) {
      return { success: true, message: '数据库文件不存在，跳过更新' };
    }

    // 生成新的ID
    const newIds = generateNewIds();

    // 创建备份
    const backupPath = `${dbPath}.bak`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(dbPath, backupPath);
      console.log(`已创建数据库备份: ${backupPath}`);
    }

    const db = new Database(dbPath);

      // 检查表是否存在
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'").get();
      if (!tableCheck) {
        db.close();
        return { success: true, message: 'ItemTable表不存在，跳过更新' };
      }

      // 开始更新
      const updatedKeys = [];
      const updateStmt = db.prepare("UPDATE ItemTable SET value = ? WHERE key = ?");
      const insertStmt = db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)");
      const countStmt = db.prepare("SELECT COUNT(*) as count FROM ItemTable WHERE key = ?");

      // 开始事务
      const transaction = db.transaction(() => {
        // 对每个ID进行更新或插入
        Object.entries(newIds).forEach(([key, value]) => {
          try {
            const row = countStmt.get(key);

            if (row && row.count > 0) {
              updateStmt.run(value, key);
              updatedKeys.push(key);
              console.log(`更新键${key} -> ${value}`);
            } else {
              insertStmt.run(key, value);
              updatedKeys.push(key);
              console.log(`插入键${key} -> ${value}`);
            }
          } catch (err) {
            console.error(`处理键${key}失败:`, err);
          }
        });
      });

      transaction();
      db.close();

    return {
      success: true,
      message: '数据库更新成功',
      updatedKeys,
      newIds
    };
  } catch (error) {
    console.error('更新SQLite数据库失败:', error);
    return { success: false, error: error.message };
  }
});

// 重置机器ID文件 - 修复版本，基于参考代码
ipcMain.handle('reset-cursor-machine-id', async () => {
  return await resetStorageMachineIds();
});

// 保存Cursor当前工作区路径
async function saveCurrentWorkspace(dbPath) {
  try {
    console.log('正在保存当前Cursor工作区路径...');

    // 确保数据库存在
    if (!fs.existsSync(dbPath)) {
      console.warn('数据库文件不存在，无法保存工作区');
      return { success: false, error: '数据库文件不存在' };
    }

    // 连接数据库读取工作区信息
    const db = new Database(dbPath, { readonly: true });

    // 查询最近打开的文件夹/工作区
    const workspaceQuery = db.prepare("SELECT value FROM ItemTable WHERE key = ?");

    // 尝试多个可能的键
    const possibleKeys = [
      'workbench.panel.recentlyOpenedPathsList',
      'history.recentlyOpenedPathsList',
      'openedPathsList.entries',
      'workspaces.recentlyOpened'
    ];

    let workspaceData = null;
    let usedKey = null;

    for (const key of possibleKeys) {
      const result = workspaceQuery.get(key);
      if (result && result.value) {
        workspaceData = result.value;
        usedKey = key;
        console.log(`✓ 找到工作区数据，使用键: ${key}`);
        break;
      }
    }

    db.close();

    if (!workspaceData) {
      console.warn('未找到工作区信息');
      return { success: false, error: '未找到工作区信息' };
    }

    // 解析工作区数据
    let workspace = null;
    try {
      const parsed = JSON.parse(workspaceData);

      // 提取第一个工作区路径（最近使用的）
      if (parsed.entries && Array.isArray(parsed.entries) && parsed.entries.length > 0) {
        const firstEntry = parsed.entries[0];
        let rawPath = null;

        if (firstEntry.folderUri) {
          rawPath = firstEntry.folderUri;
        } else if (firstEntry.workspace && firstEntry.workspace.configPath) {
          rawPath = firstEntry.workspace.configPath;
        }

        if (rawPath) {
          // 处理 file:/// 格式的路径
          if (rawPath.startsWith('file:///')) {
            rawPath = rawPath.substring(8); // 去掉 file:///
          } else if (rawPath.startsWith('file://')) {
            rawPath = rawPath.substring(7); // 去掉 file://
          }

          // URL解码（处理中文和特殊字符，如 d%3A -> d:, %E5%8D%A1 -> 卡）
          try {
            workspace = decodeURIComponent(rawPath);
          } catch (decodeError) {
            console.warn('URL解码失败，使用原始路径:', decodeError);
            workspace = rawPath;
          }

          // 统一路径分隔符为反斜杠（Windows）
          if (process.platform === 'win32') {
            workspace = workspace.replace(/\//g, '\\');
            // 确保盘符是大写
            if (workspace.length > 1 && workspace[1] === ':') {
              workspace = workspace[0].toUpperCase() + workspace.substring(1);
            }
          }

          console.log(`✓ 原始URI: ${firstEntry.folderUri || firstEntry.workspace?.configPath}`);
          console.log(`✓ 解码后路径: ${workspace}`);
        }
      }
    } catch (parseError) {
      console.warn('⚠ 解析工作区数据失败:', parseError);
    }

    if (!workspace) {
      console.warn('⚠ 无法提取工作区路径');
      return { success: false, error: '无法提取工作区路径' };
    }

    // 保存到globalStorage文件夹
    const globalStoragePath = path.join(path.dirname(dbPath), 'workspace-backup.json');
    const backupData = {
      workspace: workspace,
      timestamp: new Date().toISOString(),
      dbPath: dbPath
    };

    fs.writeFileSync(globalStoragePath, JSON.stringify(backupData, null, 2), 'utf8');
    console.log(`✓ 工作区路径已保存到: ${globalStoragePath}`);
    console.log(`✓ 保存的工作区: ${workspace}`);

    return {
      success: true,
      workspace: workspace,
      backupPath: globalStoragePath
    };

  } catch (error) {
    console.error('保存工作区路径失败:', error);
    return { success: false, error: error.message };
  }
}

// 读取保存的工作区路径
async function loadSavedWorkspace(dbPath) {
  try {
    const globalStoragePath = path.join(path.dirname(dbPath), 'workspace-backup.json');

    if (!fs.existsSync(globalStoragePath)) {
      console.log('未找到保存的工作区备份文件');
      return { success: false, workspace: null };
    }

    const backupData = JSON.parse(fs.readFileSync(globalStoragePath, 'utf8'));
    let workspace = backupData.workspace;

    // 检查是否包含URL编码（如 %3A, %E5 等）
    if (workspace && workspace.includes('%')) {
      console.log(`检测到URL编码格式，正在解码: ${workspace}`);
      try {
        // URL解码
        workspace = decodeURIComponent(workspace);
        console.log(`✓ 解码后: ${workspace}`);
      } catch (decodeError) {
        console.warn('⚠ URL解码失败，使用原始路径:', decodeError);
      }
    }

    // 确保路径分隔符正确（Windows使用反斜杠）
    if (workspace && process.platform === 'win32') {
      workspace = workspace.replace(/\//g, '\\');
      // 确保盘符是大写
      if (workspace.length > 1 && workspace[1] === ':') {
        workspace = workspace[0].toUpperCase() + workspace.substring(1);
      }
    }

    console.log(`✓ 读取保存的工作区: ${workspace}`);

    return {
      success: true,
      workspace: workspace,
      timestamp: backupData.timestamp
    };

  } catch (error) {
    console.error('✗ 读取工作区路径失败:', error);
    return { success: false, workspace: null };
  }
}

// 检查Cursor是否正在运行（增强版 - 多种检测方法）
ipcMain.handle('check-cursor-running', async () => {
  try {
    const { exec } = require('child_process');

    return new Promise((resolve) => {
      if (process.platform === 'win32') {
        // Windows系统 - 使用多种方法检测
        console.log('开始检测Cursor进程...');
        
        // 方法1: 使用tasklist（常规方法）
        exec('tasklist /FI "IMAGENAME eq Cursor.exe"', { encoding: 'utf8' }, (error, stdout, stderr) => {
          console.log('tasklist命令执行结果:');
          console.log('- error:', error ? error.message : 'null');
          console.log('- stdout长度:', stdout ? stdout.length : 0);
          console.log('- stdout内容:', stdout);
          
          if (!error && stdout && stdout.includes('Cursor.exe')) {
            console.log('✓ 方法1检测: Cursor正在运行');
            resolve(true);
            return;
          }
          
          // 方法2: 使用WMIC（备用方法，更可靠）
          console.log('方法1未检测到，尝试方法2...');
          exec('wmic process where "name=\'Cursor.exe\'" get ProcessId', { encoding: 'utf8' }, (error2, stdout2, stderr2) => {
            console.log('WMIC命令执行结果:');
            console.log('- error:', error2 ? error2.message : 'null');
            console.log('- stdout:', stdout2);
            
            if (!error2 && stdout2) {
              // 检查是否有ProcessId（排除标题行）
              const lines = stdout2.split('\n').filter(line => line.trim() && !line.includes('ProcessId'));
              console.log('- 找到的进程数:', lines.length);
              
              if (lines.length > 0) {
                console.log('✓ 方法2检测: Cursor正在运行');
                resolve(true);
                return;
              }
            }
            
            // 方法3: 使用PowerShell（最可靠的方法）
            console.log('方法2未检测到，尝试方法3（PowerShell）...');
            const psCommand = 'powershell -Command "Get-Process -Name Cursor -ErrorAction SilentlyContinue | Select-Object -First 1"';
            exec(psCommand, { encoding: 'utf8' }, (error3, stdout3, stderr3) => {
              console.log('PowerShell命令执行结果:');
              console.log('- error:', error3 ? error3.message : 'null');
              console.log('- stdout:', stdout3);
              
              if (!error3 && stdout3 && stdout3.trim().length > 0) {
                console.log('✓ 方法3检测: Cursor正在运行');
                resolve(true);
                return;
              }
              
              // 所有方法都未检测到
              console.log('✗ 所有检测方法均未发现Cursor进程');
              resolve(false);
            });
          });
        });
      } else if (process.platform === 'darwin') {
        // macOS系统 - 使用精确路径匹配，排除系统CursorUIViewService和续杯工具自身
        const cursorPath = getMacCursorAppPath();
        exec(`ps aux | grep '${cursorPath}' | grep -v grep | grep -v 'cursor-renewal'`, (error, stdout) => {
          const isRunning = !error && stdout.trim().length > 0;
          console.log(`Cursor运行状态: ${isRunning ? '运行中' : '未运行'}`);
          resolve(isRunning);
        });
      } else {
        // Linux系统
        exec('pgrep -f cursor', (error, stdout) => {
          if (error) {
            console.log('Cursor运行状态: 未运行');
            resolve(false);
            return;
          }
          const isRunning = stdout.trim().length > 0;
          console.log(`Cursor运行状态: ${isRunning ? '运行中' : '未运行'}`);
          resolve(isRunning);
        });
      }
    });
  } catch (error) {
    console.error('检查Cursor运行状态失败:', error);
    return false;
  }
});

// 延迟等待函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 获取 macOS 上 Cursor 的安装路径（从设置中读取或使用默认路径）
function getMacCursorAppPath() {
  const defaultPath = '/Applications/Cursor.app';
  try {
    // 尝试从设置中读取自定义路径
    if (currentSettings && currentSettings.customCursorPath) {
      let customPath = currentSettings.customCursorPath.trim();
      // 去除可能的引号
      if ((customPath.startsWith("'") && customPath.endsWith("'")) ||
          (customPath.startsWith('"') && customPath.endsWith('"'))) {
        customPath = customPath.slice(1, -1);
      }
      // 确保路径以 .app 结尾
      if (customPath && (customPath.endsWith('.app') || customPath.endsWith('.app/'))) {
        // 移除末尾的斜杠
        customPath = customPath.replace(/\/$/, '');
        console.log('使用自定义Cursor路径:', customPath);
        return customPath;
      }
    }
  } catch (e) {
    console.warn('读取自定义Cursor路径失败:', e.message);
  }
  console.log('使用默认Cursor路径:', defaultPath);
  return defaultPath;
}

// 检查Cursor进程是否还在运行（增强版 - 用于验证关闭）
function checkCursorRunning() {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    if (process.platform === 'win32') {
      // Windows - 优先使用PowerShell（更可靠）
      const psCommand = 'powershell -Command "Get-Process -Name Cursor -ErrorAction SilentlyContinue | Select-Object -First 1"';
      exec(psCommand, { encoding: 'utf8' }, (error, stdout) => {
        if (!error && stdout && stdout.trim().length > 0) {
          resolve(true);
          return;
        }
        
        // Windows备用方法：使用tasklist
        exec('tasklist /FI "IMAGENAME eq Cursor.exe"', { encoding: 'utf8' }, (error2, stdout2) => {
          if (!error2 && stdout2) {
            const lines = stdout2.split('\n').filter(line => line.includes('Cursor.exe'));
            resolve(lines.length > 0);
          } else {
            resolve(false);
          }
        });
      });
    } else if (process.platform === 'darwin') {
      // 检测自定义或默认Cursor.app路径的相关进程，排除续杯工具
      const cursorPath = getMacCursorAppPath();
      exec(`ps aux | grep '${cursorPath}' | grep -v grep | grep -v CursorRenewal | grep -v 'cursor-renewal'`, (error, stdout) => {
        resolve(!error && stdout.trim().length > 0);
      });
    } else {
      exec('pgrep -f cursor', (error, stdout) => {
        resolve(!error && stdout.trim().length > 0);
      });
    }
  });
}

// 强制关闭Cursor（确保所有进程完全关闭）
ipcMain.handle('force-close-cursor', async () => {
  try {
    console.log('正在强制关闭Cursor...');
    const { exec } = require('child_process');
    
    // 第一步：检查Cursor是否正在运行
    const isRunning = await checkCursorRunning();
    if (!isRunning) {
      console.log('✓ Cursor未运行，无需关闭');
      return { success: true, message: 'Cursor未运行或已关闭' };
    }

    console.log('✓ 检测到Cursor正在运行，开始关闭进程...');

    // 第二步：执行关闭命令
    return new Promise((resolve) => {
      // macOS: 分别关闭Cursor主进程和Helper进程，但不会影响CursorRenewal
      let killCommand;
      if (process.platform === 'win32') {
        killCommand = 'taskkill /F /IM Cursor.exe';
      } else if (process.platform === 'darwin') {
        // 先尝试优雅关闭，再强制关闭所有Cursor.app相关进程（使用动态路径）
        const cursorPath = getMacCursorAppPath();
        killCommand = `osascript -e 'quit app "Cursor"' 2>/dev/null; sleep 1; pkill -9 -f '${cursorPath}' 2>/dev/null; true`;
      } else {
        killCommand = 'pkill -9 cursor';
      }
      
      exec(killCommand, async (error, stdout, stderr) => {
        if (error) {
          console.log('⚠ 执行关闭命令时出错，但可能进程已关闭');
        } else {
          console.log('✓ 关闭命令执行成功');
        }

        // 第三步：循环检测确保所有进程完全关闭
        console.log('开始验证所有Cursor进程是否完全关闭...');
        const maxAttempts = 30; // 最多检测30次
        const checkInterval = 500; // 每500毫秒检测一次
        let attempts = 0;

        const verifyInterval = setInterval(async () => {
          attempts++;
          const stillRunning = await checkCursorRunning();
          
          if (!stillRunning) {
            // 所有进程已关闭
            clearInterval(verifyInterval);
            console.log(`✓ 验证完成：所有Cursor进程已完全关闭 (检测次数: ${attempts})`);
            resolve({ success: true, message: '所有Cursor进程已确认关闭' });
          } else if (attempts >= maxAttempts) {
            // 超时，但仍有进程在运行
            clearInterval(verifyInterval);
            console.log(`⚠ 警告：达到最大检测次数(${maxAttempts})，但仍检测到Cursor进程`);
            
            // 再次尝试强制关闭
            console.log('尝试再次强制关闭残留进程...');
            exec(killCommand, async (retryError) => {
              if (retryError) {
                console.log('⚠ 再次关闭失败，可能存在顽固进程');
              }
              
              // 再等待2秒后最终检测
              await delay(2000);
              const finalCheck = await checkCursorRunning();
              
              if (finalCheck) {
                console.log('✗ 仍有Cursor进程未能关闭，可能需要手动处理');
                resolve({ 
                  success: false, 
                  error: '部分Cursor进程未能关闭，请手动关闭后重试',
                  warning: true
                });
              } else {
                console.log('✓ 再次关闭后验证通过，所有进程已关闭');
                resolve({ success: true, message: '所有Cursor进程已确认关闭（重试后成功）' });
              }
            });
          } else {
            // 继续等待
            console.log(`→ 检测中... (${attempts}/${maxAttempts}) - 仍有Cursor进程在运行`);
          }
        }, checkInterval);
      });
    });
  } catch (error) {
    console.error('强制关闭Cursor失败:', error);
    return { success: false, error: error.message };
  }
});

// 完整的Cursor重启流程（关闭->等待->启动）
ipcMain.handle('restart-cursor-complete', async () => {
  try {
    console.log('开始完整的Cursor重启流程...');

    // 1. 检查Cursor是否运行
    const isRunning = await new Promise((resolve) => {
      const { exec } = require('child_process');
      if (process.platform === 'win32') {
        exec('tasklist /FI "IMAGENAME eq Cursor.exe"', (error, stdout) => {
          resolve(!error && stdout.includes('Cursor.exe'));
        });
      } else if (process.platform === 'darwin') {
        // macOS - 使用动态路径匹配，排除系统CursorUIViewService和续杯工具
        const cursorPath = getMacCursorAppPath();
        exec(`ps aux | grep '${cursorPath}' | grep -v grep | grep -v 'cursor-renewal'`, (error, stdout) => {
          resolve(!error && stdout.trim().length > 0);
        });
      } else {
        exec('pgrep -f cursor', (error, stdout) => {
          resolve(!error && stdout.trim().length > 0);
        });
      }
    });

    // 2. 如果运行中，强制关闭
    if (isRunning) {
      console.log('检测到Cursor正在运行，正在强制关闭...');
      const closeResult = await new Promise((resolve) => {
        const { exec } = require('child_process');
        if (process.platform === 'win32') {
          exec('taskkill /F /IM Cursor.exe', (error) => {
            resolve({ success: !error });
          });
        } else if (process.platform === 'darwin') {
          // 先优雅关闭，再强制关闭所有Cursor.app相关进程（使用动态路径）
          const cursorPath = getMacCursorAppPath();
          exec(`osascript -e 'quit app "Cursor"' 2>/dev/null; sleep 1; pkill -9 -f '${cursorPath}' 2>/dev/null; true`, (error) => {
            resolve({ success: true }); // 忽略错误，因为进程可能不存在
          });
        } else {
          exec('pkill -9 cursor', (error) => {
            resolve({ success: !error });
          });
        }
      });

      if (closeResult.success) {
        console.log('Cursor已强制关闭');
      } else {
        console.log('关闭Cursor时出现问题，但继续执行');
      }

      // 等待进程完全关闭
      console.log('等待进程完全关闭...');
      await delay(2000);
    } else {
      console.log('Cursor未运行，直接启动');
    }

    // 3. 启动Cursor
    console.log('正在启动Cursor...');
    const launchResult = await new Promise(async (resolve) => {
      try {
        // 获取Cursor路径
        const pathsResult = await getCursorPaths();
        if (pathsResult.error) {
          resolve({ success: false, error: pathsResult.error });
          return;
        }

        const { spawn } = require('child_process');
        let executablePath;
        let cursorInstallPath;

        if (process.platform === 'win32') {
          // Windows: 从resources/app路径推导出安装路径
          cursorInstallPath = path.dirname(path.dirname(pathsResult.basePath)); // 去掉resources/app
          executablePath = path.join(cursorInstallPath, 'Cursor.exe');
        } else if (process.platform === 'darwin') {
          // macOS: 从Contents/Resources/app路径推导出.app路径
          cursorInstallPath = path.dirname(path.dirname(path.dirname(pathsResult.basePath))); // 去掉Contents/Resources/app
          executablePath = cursorInstallPath; // .app路径
        } else {
          // Linux: 从resources/app路径推导出安装路径
          cursorInstallPath = path.dirname(path.dirname(pathsResult.basePath));
          executablePath = path.join(cursorInstallPath, 'cursor');
        }

        console.log(`Cursor安装路径: ${cursorInstallPath}`);
        console.log(`Cursor可执行文件: ${executablePath}`);

        // 检查可执行文件是否存在
        if (!fs.existsSync(executablePath)) {
          resolve({ success: false, error: `Cursor可执行文件不存在: ${executablePath}` });
          return;
        }

        // 启动进程
        let cursorProcess;
        if (process.platform === 'darwin') {
          cursorProcess = spawn('open', ['-a', executablePath], {
            detached: true,
            stdio: 'ignore'
          });
        } else {
          cursorProcess = spawn(executablePath, [], {
            detached: true,
            stdio: 'ignore'
          });
        }

        cursorProcess.unref();
        console.log(`Cursor已启动: ${executablePath}`);
        resolve({ success: true, message: 'Cursor启动成功' });

      } catch (error) {
        resolve({ success: false, error: error.message });
      }
    });

    if (launchResult.success) {
      console.log('Cursor重启流程完成');
      return { success: true, message: 'Cursor重启成功' };
    } else {
      console.error('启动Cursor失败:', launchResult.error);
      return { success: false, error: `启动Cursor失败: ${launchResult.error}` };
    }

  } catch (error) {
    console.error('Cursor重启流程失败:', error);
    return { success: false, error: error.message };
  }
});

// 保存当前工作区路径（IPC处理器）
ipcMain.handle('save-current-workspace', async (event, dbPath) => {
  return await saveCurrentWorkspace(dbPath);
});

// 读取保存的工作区路径（IPC处理器）
ipcMain.handle('load-saved-workspace', async (event, dbPath) => {
  return await loadSavedWorkspace(dbPath);
});

// 启动Cursor（支持工作区路径参数）
ipcMain.handle('launch-cursor', async (event, workspacePath = null) => {
  try {
    console.log('正在启动Cursor...');
    if (workspacePath) {
      console.log(`使用工作区路径: ${workspacePath}`);
    }

    // 获取Cursor路径
    const pathsResult = await getCursorPaths();
    if (pathsResult.error) {
      throw new Error(pathsResult.error);
    }

    let executablePath;
    let cursorInstallPath;

    if (process.platform === 'win32') {
      // Windows: 从resources/app路径推导出安装路径
      cursorInstallPath = path.dirname(path.dirname(pathsResult.basePath)); // 去掉resources/app
      executablePath = path.join(cursorInstallPath, 'Cursor.exe');
    } else if (process.platform === 'darwin') {
      // macOS: 从Contents/Resources/app路径推导出.app路径
      cursorInstallPath = path.dirname(path.dirname(path.dirname(pathsResult.basePath))); // 去掉Contents/Resources/app
      executablePath = cursorInstallPath; // .app路径
    } else {
      // Linux: 从resources/app路径推导出安装路径
      cursorInstallPath = path.dirname(path.dirname(pathsResult.basePath));
      executablePath = path.join(cursorInstallPath, 'cursor');
    }

    console.log(`Cursor安装路径: ${cursorInstallPath}`);
    console.log(`Cursor可执行文件: ${executablePath}`);

    // 检查可执行文件是否存在
    if (!fs.existsSync(executablePath)) {
      throw new Error(`Cursor可执行文件不存在: ${executablePath}`);
    }

    const { spawn } = require('child_process');

    // 构建启动参数
    const launchArgs = [];
    if (workspacePath && fs.existsSync(workspacePath)) {
      launchArgs.push(workspacePath);
      console.log(`✓ 将使用工作区路径启动: ${workspacePath}`);
    } else if (workspacePath) {
      console.warn(`⚠ 工作区路径不存在，将不使用工作区启动: ${workspacePath}`);
    }

    if (process.platform === 'win32') {
      // Windows
      const cursorProcess = spawn(executablePath, launchArgs, {
        detached: true,
        stdio: 'ignore'
      });
      cursorProcess.unref();
    } else if (process.platform === 'darwin') {
      // macOS - 使用open命令启动.app
      const openArgs = ['-a', executablePath];
      if (launchArgs.length > 0) {
        openArgs.push('--args', ...launchArgs);
      }
      const cursorProcess = spawn('open', openArgs, {
        detached: true,
        stdio: 'ignore'
      });
      cursorProcess.unref();
    } else {
      // Linux
      const cursorProcess = spawn(executablePath, launchArgs, {
        detached: true,
        stdio: 'ignore'
      });
      cursorProcess.unref();
    }

    console.log('✓ Cursor启动成功');
    return { success: true, message: 'Cursor启动成功', workspace: workspacePath };

  } catch (error) {
    console.error('✗ 启动Cursor失败:', error);
    return { success: false, error: error.message };
  }
});

// 探索Cursor配置结构函数已移除

// 检查Cursor数据库中的模型设置函数已移除

// 设置Cursor默认AI模型 (改进版)
ipcMain.handle('set-cursor-default-model', async (event, model = 'claude-3.5-sonnet') => {
  try {
    console.log(`正在设置Cursor默认AI模型为: ${model}`);

    const results = {
      settingsFile: { attempted: false, success: false, path: '', error: null },
      database: { attempted: false, success: false, path: '', error: null, updatedKeys: [] }
    };

    // 方法1: 尝试修改settings.json文件
    try {
      let settingsPath = '';
      if (process.platform === 'win32') {
        settingsPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'settings.json');
      } else if (process.platform === 'darwin') {
        settingsPath = path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'settings.json');
      } else {
        settingsPath = path.join(os.homedir(), '.config', 'Cursor', 'User', 'settings.json');
      }

      results.settingsFile.attempted = true;
      results.settingsFile.path = settingsPath;

      console.log(`尝试修改设置文件: ${settingsPath}`);

      // 确保目录存在
      const settingsDir = path.dirname(settingsPath);
      if (!fs.existsSync(settingsDir)) {
        fs.mkdirSync(settingsDir, { recursive: true });
        console.log(`已创建设置目录: ${settingsDir}`);
      }

      // 读取现有设置
      let cursorSettings = {};
      if (fs.existsSync(settingsPath)) {
        try {
          const settingsContent = fs.readFileSync(settingsPath, 'utf8');
          cursorSettings = JSON.parse(settingsContent);
          console.log('已读取现有设置文件');
        } catch (parseError) {
          console.warn('解析现有设置失败，将创建新设置:', parseError.message);
          cursorSettings = {};
        }
      }

      // 设置默认AI模型的多种可能键名
      const modelKeys = [
        'cursor.chat.defaultModel',
        'cursor.general.defaultModel',
        'cursor.defaultModel',
        'chat.defaultModel',
        'ai.defaultModel',
        'workbench.chat.defaultModel'
      ];

      for (const key of modelKeys) {
        cursorSettings[key] = model;
      }

      // 创建备份
      if (fs.existsSync(settingsPath)) {
        const backupPath = `${settingsPath}.bak`;
        fs.copyFileSync(settingsPath, backupPath);
        console.log(`已创建设置文件备份: ${backupPath}`);
      }

      // 写入新设置
      fs.writeFileSync(settingsPath, JSON.stringify(cursorSettings, null, 2), 'utf8');
      console.log(`已成功修改设置文件，设置模型为: ${model}`);

      results.settingsFile.success = true;

    } catch (settingsError) {
      console.error('修改设置文件失败:', settingsError);
      results.settingsFile.error = settingsError.message;
    }

    // 方法2: 尝试修改数据库
    try {
      let dbPath = '';
      if (process.platform === 'win32') {
        dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
      } else if (process.platform === 'darwin') {
        dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
      } else {
        dbPath = path.join(os.homedir(), '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
      }

      results.database.attempted = true;
      results.database.path = dbPath;

      if (fs.existsSync(dbPath) && Database) {
        console.log(`尝试修改数据库: ${dbPath}`);

        const dbResult = (() => {
          try {
            const db = new Database(dbPath);

            // 检查表是否存在
            const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'").get();
            if (!tableCheck) {
              db.close();
              return { success: false, error: 'ItemTable表不存在' };
            }

            // 尝试设置多种可能的模型键
            const modelKeys = [
              'cursor.chat.defaultModel',
              'cursor.general.defaultModel',
              'cursor.defaultModel',
              'chat.defaultModel',
              'ai.defaultModel',
              'workbench.chat.defaultModel',
              'vscode.chat.defaultModel'
            ];

            const updatedKeys = [];
            const countStmt = db.prepare("SELECT COUNT(*) as count FROM ItemTable WHERE key = ?");
            const updateStmt = db.prepare("UPDATE ItemTable SET value = ? WHERE key = ?");
            const insertStmt = db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)");

            // 开始事务
            const transaction = db.transaction(() => {
              for (const key of modelKeys) {
                try {
                  const row = countStmt.get(key);

                  if (row && row.count > 0) {
                    // 更新现有键
                    updateStmt.run(model, key);
                    updatedKeys.push(key);
                    console.log(`更新键${key} -> ${model}`);
                  } else {
                    // 插入新键
                    insertStmt.run(key, model);
                    updatedKeys.push(key);
                    console.log(`插入键${key} -> ${model}`);
                  }
                } catch (err) {
                  console.error(`处理键${key}失败:`, err);
                }
              }
            });

            transaction();
            db.close();

            return {
              success: true,
              updatedKeys,
              message: `数据库更新成功，更新了${updatedKeys.length}个键`
            };
          } catch (error) {
            return { success: false, error: `数据库操作失败: ${error.message}` };
          }
        })();

        results.database.success = dbResult.success;
        results.database.error = dbResult.error;
        results.database.updatedKeys = dbResult.updatedKeys || [];

      } else {
        results.database.error = '数据库文件不存在或better-sqlite3模块未加载';
      }

    } catch (dbError) {
      console.error('修改数据库失败:', dbError);
      results.database.error = dbError.message;
    }

    // 判断整体成功状态
    const overallSuccess = results.settingsFile.success || results.database.success;

    return {
      success: overallSuccess,
      message: overallSuccess ? `已成功设置默认AI模型为: ${model}` : '设置默认模型失败',
      model,
      details: results
    };

  } catch (error) {
    console.error('设置默认AI模型失败:', error);
    return { success: false, error: error.message };
  }
});

// 重启Cursor
ipcMain.handle('restart-cursor', async (event, cursorPath) => {
  try {
    // 获取Cursor可执行文件路径
    let executablePath;

    if (process.platform === 'win32') {
      executablePath = path.join(cursorPath, 'Cursor.exe');

      // 先关闭现有的Cursor进程
      const { exec } = require('child_process');
      exec('taskkill /F /IM Cursor.exe', (error) => {
        if (error) {
          console.log('没有运行中的Cursor进程或无法关闭进程');
        } else {
          console.log('成功关闭Cursor进程');
        }

        // 延迟1秒后启动新进程
        setTimeout(() => {
          // 启动Cursor进程
          const { spawn } = require('child_process');
          const cursorProcess = spawn(executablePath, [], {
            detached: true,
            stdio: 'ignore'
          });

          // 分离进程
          cursorProcess.unref();
          console.log(`Cursor已重启: ${executablePath}`);
        }, 1000);
      });
    } else if (process.platform === 'darwin') {
      executablePath = path.join(cursorPath, 'Contents', 'MacOS', 'Cursor');

      // 先关闭现有的Cursor进程
      const { exec } = require('child_process');
      exec("killall -9 'Cursor' 2>/dev/null; killall -9 'Cursor Helper' 2>/dev/null; true", (error) => {
        if (error) {
          console.log('没有运行中的Cursor进程或无法关闭进程');
        } else {
          console.log('成功关闭Cursor进程');
        }

        // 延迟1秒后启动新进程
        setTimeout(() => {
          // 启动Cursor进程
          const { spawn } = require('child_process');
          const cursorProcess = spawn('open', ['-a', executablePath], {
            detached: true,
            stdio: 'ignore'
          });

          // 分离进程
          cursorProcess.unref();
          console.log(`Cursor已重启: ${executablePath}`);
        }, 1000);
      });
    } else {
      executablePath = path.join(cursorPath, 'cursor');

      // 先关闭现有的Cursor进程
      const { exec } = require('child_process');
      exec('pkill -9 -x cursor', (error) => {
        if (error) {
          console.log('没有运行中的Cursor进程或无法关闭进程');
        } else {
          console.log('成功关闭Cursor进程');
        }

        // 延迟1秒后启动新进程
        setTimeout(() => {
          // 启动Cursor进程
          const { spawn } = require('child_process');
          const cursorProcess = spawn(executablePath, [], {
            detached: true,
            stdio: 'ignore'
          });

          // 分离进程
          cursorProcess.unref();
          console.log(`Cursor已重启: ${executablePath}`);
        }, 1000);
      });
    }

    return true;
  } catch (error) {
    console.error(`重启Cursor失败: ${error.message}`);
    return false;
  }
});

// 退出当前Cursor登录账号
ipcMain.handle('logout-current-cursor-account', async (event, dbPath) => {
  try {
    console.log('=== 开始退出当前Cursor登录账号 ===');
    console.log(`数据库路径: ${dbPath}`);

    if (!dbPath) {
      return { success: false, error: '数据库路径不能为空' };
    }

    if (!fs.existsSync(dbPath)) {
      return { success: false, error: `数据库文件不存在: ${dbPath}` };
    }

    // 确保better-sqlite3模块已加载
    if (!Database) {
      return { success: false, error: 'better-sqlite3模块未正确加载，请检查依赖安装' };
    }

    try {
      // 连接数据库
      console.log('正在连接数据库...');
      const db = new Database(dbPath);
      console.log('已成功连接到数据库');

      // 检查表是否存在
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'").get();
      if (!tableCheck) {
        db.close();
        return { success: false, error: 'ItemTable表不存在' };
      }

      // 要清除的认证相关键值
      const keysToDelete = [
        'cursorAuth/cachedEmail',
        'cursorAuth/accessToken',
        'cursorAuth/refreshToken',
        'cursorAuth/cachedSignUpType',
        'cursorai/featureStatusCache',
        'cursorai/featureConfigCache',
        'cursorAuth/stripeMembershipType',
        'cursorai/serverConfig',
        'auth/user',
        'auth/session',
        'vscode.chat.access-token'
      ];

      const deletedKeys = [];
      const deleteStmt = db.prepare("DELETE FROM ItemTable WHERE key = ?");

      // 开始事务
      const transaction = db.transaction(() => {
        for (const key of keysToDelete) {
          try {
            const result = deleteStmt.run(key);
            if (result.changes > 0) {
              deletedKeys.push(key);
              console.log(`已删除登录信息键: ${key}`);
            }
          } catch (err) {
            console.warn(`删除键${key}失败:`, err);
          }
        }
      });

      transaction();
      db.close();

      console.log(`退出登录完成，共清除${deletedKeys.length}个登录信息键`);

      return {
        success: true,
        message: '成功退出当前登录账号',
        deletedKeys
      };
    } catch (error) {
      console.error('数据库操作失败:', error);
      return { success: false, error: `数据库操作失败: ${error.message}` };
    }
  } catch (error) {
    console.error('退出登录失败:', error);
    return { success: false, error: error.message };
  }
});

// 基于Python项目逻辑的账号切换功能
ipcMain.handle('python-style-account-switch', async (event, dbPath, email, access_token, refresh_token) => {
  try {
    console.log('========================================');
    console.log('=== Python风格账号切换开始 ===');
    console.log('========================================');
    console.log(`数据库路径: ${dbPath}`);
    console.log(`用户邮箱: ${email}`);
    console.log(`access_token长度: ${access_token ? access_token.length : 0}`);
    console.log(`refresh_token长度: ${refresh_token ? refresh_token.length : 0}`);

    // 参数验证
    if (!dbPath) {
      return { success: false, error: '数据库路径不能为空' };
    }

    if (!email) {
      return { success: false, error: '邮箱不能为空' };
    }

    if (!access_token) {
      return { success: false, error: 'access_token不能为空' };
    }

    if (!refresh_token) {
      return { success: false, error: 'refresh_token不能为空' };
    }

    if (!fs.existsSync(dbPath)) {
      return { success: false, error: `数据库文件不存在: ${dbPath}` };
    }

    // 确保better-sqlite3模块已加载
    if (!Database) {
      return { success: false, error: 'better-sqlite3模块未正确加载，请检查依赖安装' };
    }

    // 创建数据库备份
    const backupPath = `${dbPath}.bak`;
    if (!fs.existsSync(backupPath)) {
      try {
        fs.copyFileSync(dbPath, backupPath);
        console.log(`已创建数据库备份: ${backupPath}`);
      } catch (backupError) {
        console.warn(`创建备份失败，但将继续执行: ${backupError.message}`);
      }
    }

    // ========== 子步骤1：重置机器ID（重要：每次刷新Cursor时都要重置机器码）==========
    try {
      console.log('');
      console.log('---------- 子步骤1：重置机器ID ----------');
      console.log('开始重置机器ID...');

      // 获取正确的Cursor目录路径（支持自定义路径）
      let cursorDir;

      // 首先尝试从设置中获取自定义路径
      try {
        const settings = loadSettings();
        console.log('加载设置:', settings);
        if (settings && settings.customCursorPath && fs.existsSync(settings.customCursorPath)) {
          cursorDir = settings.customCursorPath;
          console.log(`✓ 使用自定义Cursor路径: ${cursorDir}`);
        } else {
          // 使用默认路径
          if (process.platform === 'win32') {
            cursorDir = path.join(process.env.APPDATA, 'Cursor');
          } else if (process.platform === 'darwin') {
            cursorDir = path.join(process.env.HOME, 'Library', 'Application Support', 'Cursor');
          } else {
            cursorDir = path.join(process.env.HOME, '.config', 'Cursor');
          }
          console.log(`✓ 使用默认Cursor路径: ${cursorDir}`);
        }
      } catch (settingsError) {
        console.warn(`⚠ 读取设置失败，使用默认路径: ${settingsError.message}`);
        // 使用默认路径
        if (process.platform === 'win32') {
          cursorDir = path.join(process.env.APPDATA, 'Cursor');
        } else if (process.platform === 'darwin') {
          cursorDir = path.join(process.env.HOME, 'Library', 'Application Support', 'Cursor');
        } else {
          cursorDir = path.join(process.env.HOME, '.config', 'Cursor');
        }
        console.log(`✓ 使用默认Cursor路径: ${cursorDir}`);
      }

      console.log(`Cursor目录路径: ${cursorDir}`);

      // 1.1 重置storage.json中的机器码（重要：按照用户要求的格式）
      console.log('正在重置storage.json中的机器码...');
      try {
        const storageResetResult = await resetStorageMachineIds();
        if (storageResetResult.success) {
          console.log('✓ storage.json机器码重置成功');
          console.log('新的机器码:', storageResetResult.newIds);
        } else {
          console.warn('⚠ storage.json重置失败:', storageResetResult.error);
        }
      } catch (storageError) {
        console.warn('⚠ storage.json重置过程中出错:', storageError.message);
      }

      // 1.2 同时保留原有的机器ID文件重置（兼容性）
      await resetMachineIds(cursorDir);
      console.log('✓ 机器ID文件重置成功');

      // 1.3 注册表操作已禁用（避免跨平台崩溃问题）
      console.log('注册表操作已禁用，跳过MachineGuid重置');

      console.log('✓ 机器ID重置完成');
    } catch (resetError) {
      console.warn(`⚠ 重置机器ID过程中出错: ${resetError.message}`);
      // 不中断流程，继续执行
    }

    try {
      // ========== 子步骤2：更新数据库认证信息 ==========
      console.log('');
      console.log('---------- 子步骤2：更新数据库认证信息 ----------');
      console.log('正在连接数据库...');
      const db = new Database(dbPath);
      console.log('✓ 已成功连接到数据库');

      // 检查表是否存在
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'").get();
      if (!tableCheck) {
        db.close();
        return { success: false, error: 'ItemTable表不存在' };
      }

      // 注意：serverConfig等登录信息的清理已经在logout-current-cursor-account中完成

      // 设置要更新的键值对（基于Python项目的逻辑）
      const updates = [];
      if (email) {
        updates.push(["cursorAuth/cachedEmail", email]);
      }
      if (access_token) {
        updates.push(["cursorAuth/accessToken", access_token]);
      }
      if (refresh_token) {
        updates.push(["cursorAuth/refreshToken", refresh_token]);
        updates.push(["cursorAuth/cachedSignUpType", "Auth_0"]);
      }

      const updatedKeys = [];
      const countStmt = db.prepare("SELECT COUNT(*) as count FROM ItemTable WHERE key = ?");
      const updateStmt = db.prepare("UPDATE ItemTable SET value = ? WHERE key = ?");
      const insertStmt = db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)");

      // 开始事务
      const transaction = db.transaction(() => {
        for (const [key, value] of updates) {
          try {
            const row = countStmt.get(key);

            if (row && row.count > 0) {
              updateStmt.run(value, key);
              updatedKeys.push(key);
              console.log(`✓ 更新键${key} -> ${value}`);
            } else {
              insertStmt.run(key, value);
              updatedKeys.push(key);
              console.log(`✓ 插入键${key} -> ${value}`);
            }
          } catch (err) {
            console.error(`✗ 处理键${key}失败:`, err);
            throw err; // 让事务回滚
          }
        }
      });

      transaction();
      db.close();

      console.log('✓ 数据库更新完成');
      console.log('========================================');
      console.log('=== Python风格账号切换完成 ===');
      console.log('========================================');
      
      return {
        success: true,
        message: 'Python风格账号切换成功',
        updatedKeys,
        activationSuccess: true
      };
    } catch (dbError) {
      console.error('数据库操作失败:', dbError);
      return { success: false, error: dbError.message };
    }
  } catch (error) {
    console.error('✗ Python风格账号切换失败:', error);
    return { success: false, error: error.message };
  }
});

// 更新Cursor的认证信息
ipcMain.handle('update-cursor-auth', async (event, dbPath, email, access_token, refresh_token, machineIdReset = true) => {
  try {
    if (!fs.existsSync(dbPath)) {
      return { success: false, error: '数据库文件不存在' };
    }

    console.log('正在更新Cursor认证信息...');
    console.log(`数据库路径: ${dbPath}`);
    console.log(`用户邮箱: ${email}`);

    // 确保better-sqlite3模块已加载
    if (!Database) {
      return { success: false, error: 'better-sqlite3模块未正确加载' };
    }

    // 创建数据库备份
    const backupPath = `${dbPath}.bak`;
    if (!fs.existsSync(backupPath)) {
      try {
        fs.copyFileSync(dbPath, backupPath);
        console.log(`已创建数据库备份: ${backupPath}`);
      } catch (backupError) {
        console.warn(`创建备份失败，但将继续执行: ${backupError.message}`);
        // 不中断流程，继续执行
      }
    }

    // 重置机器ID部分
    if (machineIdReset) {
      try {
        console.log('开始重置机器ID...');
        await resetMachineIds(path.dirname(path.dirname(dbPath)));
      } catch (resetError) {
        console.warn(`重置机器ID过程中出错: ${resetError.message}`);
        // 不中断流程，继续执行
      }
    }

    try {
      // 连接数据库
      const db = new Database(dbPath);
      console.log('已连接到数据库');

      // 检查表是否存在
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'").get();
      if (!tableCheck) {
        db.close();
        return { success: false, error: 'ItemTable表不存在' };
      }

      // 设置要更新的键值对
      const updates = [];
      if (email) {
        updates.push(["cursorAuth/cachedEmail", email]);
      }
      if (access_token) {
        updates.push(["cursorAuth/accessToken", access_token]);
      }
      if (refresh_token) {
        updates.push(["cursorAuth/refreshToken", refresh_token]);
        updates.push(["cursorAuth/cachedSignUpType", "Auth_0"]);
      }

      // 首先尝试删除serverConfig配置，这是激活新账号所必需的
      try {
        const deleteStmt = db.prepare("DELETE FROM ItemTable WHERE key = ?");
        deleteStmt.run("cursorai/serverConfig");
        console.log('尝试删除cursorai/serverConfig，准备激活新账号');
      } catch (err) {
        console.log('删除cursorai/serverConfig失败或记录不存在，继续执行');
      }

      const updatedKeys = [];
      const countStmt = db.prepare("SELECT COUNT(*) as count FROM ItemTable WHERE key = ?");
      const updateStmt = db.prepare("UPDATE ItemTable SET value = ? WHERE key = ?");
      const insertStmt = db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)");

      // 开始事务
      const transaction = db.transaction(() => {
        for (const [key, value] of updates) {
          try {
            const row = countStmt.get(key);

            if (row && row.count > 0) {
              updateStmt.run(value, key);
              updatedKeys.push(key);
              console.log(`更新键${key} -> ${value}`);
            } else {
              insertStmt.run(key, value);
              updatedKeys.push(key);
              console.log(`插入键${key} -> ${value}`);
            }
          } catch (err) {
            console.error(`处理键${key}失败:`, err);
            throw err; // 让事务回滚
          }
        }
      });

      transaction();
      db.close();

      return {
        success: true,
        message: '认证信息更新成功',
        updatedKeys
      };
    } catch (error) {
      console.error('数据库操作失败:', error);
      return { success: false, error: `数据库操作失败: ${error.message}` };
    }
  } catch (error) {
    console.error('更新认证信息失败:', error);
    return { success: false, error: error.message };
  }
});

// 重置storage.json中的机器码 - 按照用户要求的格式
async function resetStorageMachineIds() {
  try {
    const { v4: uuidv4 } = require('uuid');
    const crypto = require('crypto');

    let storageFilePath = '';
    let backupDir = '';

    // 根据操作系统设置路径
    if (process.platform === 'win32') {
      // Windows
      const appData = process.env.APPDATA;
      storageFilePath = path.join(appData, 'Cursor', 'User', 'globalStorage', 'storage.json');
      backupDir = path.join(appData, 'Cursor', 'User', 'globalStorage', 'backups');
    } else if (process.platform === 'darwin') {
      // macOS
      const appSupport = path.join(os.homedir(), 'Library', 'Application Support');
      storageFilePath = path.join(appSupport, 'Cursor', 'User', 'globalStorage', 'storage.json');
      backupDir = path.join(appSupport, 'Cursor', 'User', 'globalStorage', 'backups');
    } else {
      // Linux
      const configDir = path.join(os.homedir(), '.config');
      storageFilePath = path.join(configDir, 'Cursor', 'User', 'globalStorage', 'storage.json');
      backupDir = path.join(configDir, 'Cursor', 'User', 'globalStorage', 'backups');
    }

    console.log('重置机器码 - 目标文件:', storageFilePath);

    // 检查storage.json文件是否存在
    if (!fs.existsSync(storageFilePath)) {
      return {
        success: false,
        error: `未找到配置文件: ${storageFilePath}。请先运行一次Cursor后再使用此功能。`
      };
    }

    // 创建备份目录
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // 备份现有配置
    const backupName = `storage.json.backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const backupPath = path.join(backupDir, backupName);
    fs.copyFileSync(storageFilePath, backupPath);
    console.log('配置文件已备份到:', backupPath);

    // 按照用户提供的参考代码生成机器码
    function generateMachineIds() {
      const machineId = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
      const devDeviceId = uuidv4();
      const sqmId = '{' + uuidv4().toUpperCase() + '}';

      return {
        machineId,
        devDeviceId,
        sqmId
      };
    }

    // 生成新的ID值
    const newIds = generateMachineIds();

    console.log('生成新的机器码（严格按照用户要求的三个字段）:');
    console.log('- telemetry.machineId:', newIds.machineId, '(64位字符)');
    console.log('- telemetry.devDeviceId:', newIds.devDeviceId, '(随机UUID)');
    console.log('- telemetry.sqmId:', newIds.sqmId, '(拼接{UUID转大写})');

    // 使用安全的文件修改方法（自动处理只读属性）
    const modifySuccess = await safeModifyFile(storageFilePath, async () => {
      // 读取并更新配置文件
      const originalContent = fs.readFileSync(storageFilePath, 'utf8');
      const config = JSON.parse(originalContent);

      // 记录修改前的值
      console.log('修改前的值:');
      console.log('- telemetry.machineId:', config['telemetry.machineId'] || '不存在');
      console.log('- telemetry.devDeviceId:', config['telemetry.devDeviceId'] || '不存在');
      console.log('- telemetry.sqmId:', config['telemetry.sqmId'] || '不存在');

      // 更新机器ID相关字段（严格按照用户要求的三个字段）
      config['telemetry.machineId'] = newIds.machineId;
      config['telemetry.devDeviceId'] = newIds.devDeviceId;
      config['telemetry.sqmId'] = newIds.sqmId;
      // 移除额外的macMachineId更新，只更新用户要求的三个字段

      // 记录修改后的值
      console.log('修改后的值:');
      console.log('- telemetry.machineId:', config['telemetry.machineId']);
      console.log('- telemetry.devDeviceId:', config['telemetry.devDeviceId']);
      console.log('- telemetry.sqmId:', config['telemetry.sqmId']);

      // 写入更新后的配置
      const updatedJson = JSON.stringify(config, null, 2);
      fs.writeFileSync(storageFilePath, updatedJson, 'utf8');
    });

    if (!modifySuccess) {
      throw new Error('文件修改失败：可能由于权限问题无法写入storage.json');
    }

    console.log('storage.json机器码重置成功');

    return {
      success: true,
      message: 'storage.json机器码重置成功',
      storageFile: storageFilePath,
      backupFile: backupPath,
      newIds: {
        'telemetry.machineId': newIds.machineId,
        'telemetry.devDeviceId': newIds.devDeviceId,
        'telemetry.sqmId': newIds.sqmId
      }
    };
  } catch (error) {
    console.error('重置storage.json机器ID失败:', error);
    return { success: false, error: error.message };
  }
}

// 添加重置机器ID的函数
async function resetMachineIds(cursorDir) {
  const { v4: uuidv4 } = require('uuid');
  const machineGuid = uuidv4();
  const deviceId = uuidv4();
  const anonymousId = uuidv4();

  console.log(`生成新的设备ID: ${deviceId}`);
  console.log(`生成新的匿名ID: ${anonymousId}`);

  try {
    // 更新所有Cursor的machine ID文件
    const machineIdFiles = [
      path.join(cursorDir, 'machineid.json'),
      path.join(cursorDir, 'machineid'),
      path.join(cursorDir, 'User', 'globalStorage', 'machine-id'),
      path.join(cursorDir, 'User', 'globalStorage', 'anonymousid')
    ];

    for (const filePath of machineIdFiles) {
      try {
        // 确保目录存在
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`创建目录: ${dir}`);
        }

        const fileExtension = path.extname(filePath);
        const fileExists = fs.existsSync(filePath);

        if (fileExtension === '.json') {
          // JSON格式文件
          const data = { machineId: deviceId };
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
          console.log(`${fileExists ? '更新' : '创建'}JSON机器ID文件: ${filePath}`);
        } else {
          // 纯文本文件
          const idToWrite = path.basename(filePath) === 'anonymousid' ? anonymousId : deviceId;
          fs.writeFileSync(filePath, idToWrite);
          console.log(`${fileExists ? '更新' : '创建'}文本机器ID文件: ${filePath}`);
        }
      } catch (e) {
        console.warn(`处理文件失败: ${filePath}, 错误: ${e.message}`);
      }
    }

    // 更新Windows注册表中的MachineGUID (仅在Windows上)
    if (process.platform === 'win32') {
      try {
        const { exec } = require('child_process');
        const regCommand = `reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid /t REG_SZ /d "${machineGuid}" /f`;

        exec(regCommand, (error, stdout, stderr) => {
          if (error) {
            console.warn(`更新Windows注册表失败: ${error.message}`);
          } else {
            console.log('成功更新Windows注册表MachineGUID');
          }
        });
      } catch (regError) {
        console.warn(`尝试更新注册表时出错: ${regError.message}`);
      }
    }

    // 成功更新所有ID文件
    console.log('机器ID重置成功');
    return true;
  } catch (error) {
    console.error(`重置机器ID失败: ${error.message}`);
    return false;
  }
}

// 获取用户数据路径 (已移除重复定义，使用上面更完整的版本)

// 添加验证卡密的处理器（用于校验，不更新数据库）
ipcMain.handle('verify-card-only', async (event, cardCode) => {
  try {
    console.log(`验证卡密（仅校验）: ${cardCode}`);

    // 获取设备ID
    const machineId = generateMachineId();

    // 构建API请求参数
    const apiUrl = 'https://www.xxdlzs.top/hou/csk/card/verify'; // 使用验证接口，不更新数据库
    const params = {
      card: cardCode,
      machine_id: machineId
    };

    // 开发模式代码已移除，始终使用真实API

    // 发送API请求
    try {
      const response = await axios.post(apiUrl, {
        cardCode: cardCode,
        deviceId: machineId
      });

      // 检查API响应
      if (response.status !== 200) {
        return {
          success: false,
          error: `API请求失败: HTTP状态码 ${response.status}`
        };
      }

      const data = response.data;

      // 处理API响应
      if (data.success === false) {
        return {
          success: false,
          error: data.message || '卡密验证失败'
        };
      }

      // 计算剩余天数
      let remainingDays = 31;
      const endDate = data.card_info?.end;
      const currentTime = data.account_info?.current_time || new Date().toISOString().replace('T', ' ').substring(0, 19);

      if (endDate) {
        const endTimeMs = new Date(endDate).getTime();
        const currentTimeMs = new Date(currentTime).getTime();
        const remainingMs = endTimeMs - currentTimeMs;

        if (remainingMs > 0) {
          remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
        }
      }

      // 将SpringBoot后端返回的扁平数据结构转换为前端期望的嵌套结构
      // 构造卡密信息对象
      const cardInfo = {
        card: data.cardCode || '',
        address: data.cardType || '专用',
        start: data.startTime || '',
        end: data.endTime || '',
        usetime: data.useDays ? data.useDays.toString() : '31'
      };

      // 构造账号信息对象
      const accountInfo = {
        userid: data.userId || '',
        email: data.email || '',
        token: data.token || '',
        current_time: new Date().toISOString().replace('T', ' ').substring(0, 19)
      };

      // 保存卡密信息到JSON文件（不包含token）
      const saveData = {
        cardCode: data.cardCode || cardCode,
        cardType: data.cardType || '专用',
        startTime: data.startTime || '',
        endTime: data.endTime || '',
        useDays: data.useDays || 31,
        email: data.email || ''
        // 不保存token，提高安全性
      };
      saveCardInfoToFile(saveData);

      // 返回处理后的数据
      return {
        success: true,
        data: {
          card_info: cardInfo,
          account_info: accountInfo,
          remaining_days: remainingDays
        }
      };
    } catch (apiError) {
      console.error('API请求失败:', apiError);
      return {
        success: false,
        error: `API请求失败: ${apiError.message}`
      };
    }
  } catch (error) {
    console.error('验证卡密时出错:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 保存卡密信息到JSON文件
ipcMain.handle('save-card-info', async (event, cardInfo) => {
  return saveCardInfoToFile(cardInfo);
});

// 从JSON文件加载卡密信息
ipcMain.handle('load-card-info', async () => {
  return loadCardInfoFromFile();
});

// 清除卡密信息文件
ipcMain.handle('clear-card-info', async () => {
  return clearCardInfoFile();
});

// 生成设备ID - 使用缓存确保稳定性
function generateMachineId() {
  const deviceIdFile = path.join(app.getPath('userData'), 'device_id.txt');

  // 首先检查是否已有缓存的设备ID
  if (fs.existsSync(deviceIdFile)) {
    try {
      const cachedId = fs.readFileSync(deviceIdFile, 'utf8').trim();
      if (cachedId && cachedId.length > 10) {
        console.log('使用缓存的设备ID:', cachedId);
        return cachedId;
      }
    } catch (error) {
      console.warn('读取缓存设备ID失败:', error.message);
    }
  }

  // 生成新的设备ID
  let deviceId = null;

  try {
    const { machineIdSync } = require('node-machine-id');
    deviceId = machineIdSync();
    console.log('获取到真实机器ID:', deviceId);
  } catch (error) {
    console.warn('无法获取真实的机器ID，使用备用方案:', error.message);
    deviceId = generateStableMachineId();
  }

  // 缓存设备ID到文件
  try {
    fs.writeFileSync(deviceIdFile, deviceId, 'utf8');
    console.log('设备ID已缓存到:', deviceIdFile);
  } catch (error) {
    console.warn('缓存设备ID失败:', error.message);
  }

  return deviceId;
}

// 生成稳定的设备ID（备用方案）
function generateStableMachineId() {
  const crypto = require('crypto');
  const os = require('os');
  const { execSync } = require('child_process');

  try {
    let uniqueIdentifiers = [];

    // 方案1: 尝试获取主板序列号或CPU ID
    if (process.platform === 'win32') {
      try {
        // Windows: 获取主板序列号
        const motherboardSerial = execSync('wmic baseboard get serialnumber', { encoding: 'utf8' })
          .split('\n')[1]?.trim();
        if (motherboardSerial && motherboardSerial !== 'SerialNumber') {
          uniqueIdentifiers.push(`mb:${motherboardSerial}`);
        }

        // Windows: 获取CPU ID
        const cpuId = execSync('wmic cpu get processorid', { encoding: 'utf8' })
          .split('\n')[1]?.trim();
        if (cpuId && cpuId !== 'ProcessorId') {
          uniqueIdentifiers.push(`cpu:${cpuId}`);
        }
      } catch (error) {
        console.warn('获取Windows硬件信息失败:', error.message);
      }
    } else if (process.platform === 'darwin') {
      try {
        // macOS: 获取硬件UUID
        const hwUuid = execSync('system_profiler SPHardwareDataType | grep "Hardware UUID"', { encoding: 'utf8' })
          .split(':')[1]?.trim();
        if (hwUuid) {
          uniqueIdentifiers.push(`hw:${hwUuid}`);
        }
      } catch (error) {
        console.warn('获取macOS硬件信息失败:', error.message);
      }
    } else {
      try {
        // Linux: 尝试获取DMI信息
        const productUuid = execSync('cat /sys/class/dmi/id/product_uuid 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
        if (productUuid) {
          uniqueIdentifiers.push(`dmi:${productUuid}`);
        }
      } catch (error) {
        console.warn('获取Linux硬件信息失败:', error.message);
      }
    }

    // 方案2: 收集稳定的系统信息
    const systemInfo = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      userDir: os.homedir(),
      // 获取第一个有效的MAC地址
      primaryMac: Object.values(os.networkInterfaces())
        .flat()
        .filter(iface => !iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00')
        .sort((a, b) => a.mac.localeCompare(b.mac))[0]?.mac || 'no-mac'
    };

    // 组合所有标识符
    const allIdentifiers = [
      ...uniqueIdentifiers,
      `sys:${JSON.stringify(systemInfo)}`
    ].join('|');

    // 生成稳定的哈希值
    const hash = crypto.createHash('sha256').update(allIdentifiers).digest('hex');
    const stableId = hash.substring(0, 32);

    console.log('生成稳定设备ID:', stableId);
    console.log('基于标识符:', uniqueIdentifiers.length > 0 ? uniqueIdentifiers : '系统信息');

    return stableId;
  } catch (error) {
    console.error('生成稳定设备ID失败:', error);

    // 最终备用方案：基于用户目录和主机名
    const crypto = require('crypto');
    const os = require('os');
    const fallbackString = `${os.homedir()}|${os.hostname()}|${os.platform()}|${os.arch()}`;
    const fallbackHash = crypto.createHash('sha256').update(fallbackString).digest('hex').substring(0, 32);

    console.log('使用最终备用方案生成设备ID:', fallbackHash);
    return fallbackHash;
  }
}

// 卡密信息JSON文件管理
const CARD_INFO_FILE = path.join(app.getPath('userData'), 'card_info.json');

// 保存卡密信息到JSON文件
function saveCardInfoToFile(cardInfo) {
  try {
    const data = {
      cardCode: cardInfo.cardCode,
      cardType: cardInfo.cardType,
      startTime: cardInfo.startTime,
      endTime: cardInfo.endTime,
      useDays: cardInfo.useDays,
      email: cardInfo.email,
      // 不保存token信息，提高安全性
      savedAt: new Date().toISOString(),
      machineId: generateMachineId()
    };

    fs.writeFileSync(CARD_INFO_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log(`卡密信息已保存到: ${CARD_INFO_FILE}`);
    return true;
  } catch (error) {
    console.error('保存卡密信息失败:', error);
    return false;
  }
}

// 从JSON文件加载卡密信息
function loadCardInfoFromFile() {
  try {
    if (!fs.existsSync(CARD_INFO_FILE)) {
      console.log('卡密信息文件不存在');
      return null;
    }

    const data = fs.readFileSync(CARD_INFO_FILE, 'utf8');
    const cardInfo = JSON.parse(data);

    // 验证数据完整性
    if (!cardInfo.cardCode || !cardInfo.endTime) {
      console.log('卡密信息文件数据不完整');
      return null;
    }

    // 检查是否过期
    const endDate = new Date(cardInfo.endTime);
    const now = new Date();
    if (endDate <= now) {
      console.log('卡密已过期，清除文件');
      fs.unlinkSync(CARD_INFO_FILE);
      return null;
    }

    console.log(`从文件加载卡密信息: ${cardInfo.cardCode}`);
    return cardInfo;
  } catch (error) {
    console.error('加载卡密信息失败:', error);
    return null;
  }
}

// 清除卡密信息文件
function clearCardInfoFile() {
  try {
    if (fs.existsSync(CARD_INFO_FILE)) {
      fs.unlinkSync(CARD_INFO_FILE);
      console.log('卡密信息文件已清除');
      return true;
    }
    return true;
  } catch (error) {
    console.error('清除卡密信息文件失败:', error);
    return false;
  }
}



// 添加续杯卡密的处理器（会更新数据库）
ipcMain.handle('verify-card', async (event, cardCode) => {
  try {
    console.log(`续杯卡密: ${cardCode}`);

    // 获取设备ID
    const machineId = generateMachineId();

    // 构建API请求参数
    const apiUrl = 'https://www.xxdlzs.top/hou/csk/card/renew'; // 使用续杯接口，会更新数据库
    const params = {
      card: cardCode,
      machine_id: machineId
    };

    // 开发模式代码已移除，始终使用真实API

    // 发送API请求
    try {
      const response = await axios.post(apiUrl, {
        cardCode: cardCode,
        deviceId: machineId
      });

      // 检查API响应
      if (response.status !== 200) {
        return {
          success: false,
          error: `API请求失败: HTTP状态码 ${response.status}`
        };
      }

      const data = response.data;

      // 检查后端返回的成功状态
      if (!data.success) {
        return {
          success: false,
          error: data.message || '续杯失败'
        };
      }

      // 计算剩余天数
      let remainingDays = 31;
      if (data.endTime) {
        const endDate = new Date(data.endTime);
        const now = new Date();
        const diffTime = endDate - now;
        remainingDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      }

      // 将SpringBoot后端返回的扁平数据结构转换为前端期望的格式
      const cardInfo = {
        card: data.cardCode || '',
        address: data.cardType || '专用',
        start: data.startTime || '',
        end: data.endTime || '',
        usetime: (data.useDays || 31).toString()
      };

      const accountInfo = {
        userid: data.userId || '',
        email: data.email || '',
        token: data.token || '',
        current_time: new Date().toISOString().replace('T', ' ').substring(0, 19)
      };

      return {
        success: data.success,
        data: {
          card_info: cardInfo,
          account_info: accountInfo,
          remaining_days: remainingDays
        }
      };
    } catch (apiError) {
      console.error('API请求失败:', apiError);
      return {
        success: false,
        error: `API请求失败: ${apiError.message}`
      };
    }
  } catch (error) {
    console.error('续杯卡密时出错:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 记录卡密使用情况
ipcMain.handle('record-usage', async (event, cardCode) => {
  try {
    console.log(`记录卡密使用: ${cardCode}`);

    // 这里可以添加使用记录逻辑，比如：
    // 1. 记录到本地文件
    // 2. 发送到服务器
    // 3. 更新使用次数等

    // 目前只是简单记录日志
    const timestamp = new Date().toISOString();
    const logEntry = {
      cardCode: cardCode,
      timestamp: timestamp,
      action: 'renewal_completed'
    };

    console.log('使用记录:', logEntry);

    return { success: true, message: '使用记录已保存' };
  } catch (error) {
    console.error('记录使用失败:', error);
    return { success: false, error: error.message };
  }
});

// 添加查询卡密信息的处理器
ipcMain.handle('get-card-info', async (event, cardCode) => {
  try {
    console.log(`查询卡密信息: ${cardCode}`);

    // 获取设备ID
    const machineId = generateMachineId();

    // 构建API请求参数
    const apiUrl = `https://www.xxdlzs.top/hou/csk/card/info/${cardCode}`; // 使用本地SpringBoot服务API地址

    // 开发模式代码已移除，始终使用真实API

    // 发送API请求
    try {
      const response = await axios.get(apiUrl);

      // 检查API响应
      if (response.status !== 200) {
        return {
          success: false,
          error: `API请求失败: HTTP状态码 ${response.status}`
        };
      }

      const data = response.data;

      // 将SpringBoot后端返回的扁平数据结构转换为前端期望的格式
      return {
        success: data.success,
        cardCode: data.cardCode || '',
        cardType: data.cardType || '专用',
        startTime: data.startTime || '',
        endTime: data.endTime || '',
        useDays: data.useDays || 31
      };
    } catch (apiError) {
      console.error('API请求失败:', apiError);
      return {
        success: false,
        error: `API请求失败: ${apiError.message}`
      };
    }
  } catch (error) {
    console.error('查询卡密信息时出错:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 打开外部链接
ipcMain.handle('open-external-url', async (event, url) => {
  try {
    const { shell } = require('electron');
    await shell.openExternal(url);
    console.log(`已打开外部链接: ${url}`);
    return { success: true };
  } catch (error) {
    console.error('打开外部链接失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 缓存settings.json路径，避免重复搜索
let cachedSettingsPath = null;

// 搜索Cursor settings.json文件
function findCursorSettingsPath() {
  // 如果已经缓存了路径，直接返回
  if (cachedSettingsPath && fs.existsSync(cachedSettingsPath)) {
    console.log(`使用缓存的settings.json路径: ${cachedSettingsPath}`);
    return cachedSettingsPath;
  }

  console.log('开始全盘搜索Cursor settings.json文件...');

  // 获取所有驱动器（Windows）
  const drives = [];
  if (process.platform === 'win32') {
    // 扫描A-Z所有可能的驱动器
    for (let i = 65; i <= 90; i++) {
      const drive = String.fromCharCode(i) + ':';
      try {
        if (fs.existsSync(drive + '\\')) {
          drives.push(drive);
        }
      } catch (e) {
        // 跳过无法访问的驱动器
      }
    }
  } else {
    // Linux/Mac使用home目录
    drives.push(os.homedir());
  }

  console.log(`找到可用驱动器: ${drives.join(', ')}`);

  // 可能的路径模式
  const possiblePaths = [];

  // 1. 标准用户目录路径
  if (process.platform === 'win32') {
    for (const drive of drives) {
      // 遍历Users下的所有用户目录
      const usersDir = path.join(drive + '\\', 'Users');
      if (fs.existsSync(usersDir)) {
        try {
          const userDirs = fs.readdirSync(usersDir);
          for (const userDir of userDirs) {
            possiblePaths.push(
              path.join(usersDir, userDir, 'AppData', 'Roaming', 'Cursor', 'User', 'settings.json')
            );
          }
        } catch (e) {
          console.log(`无法访问 ${usersDir}: ${e.message}`);
        }
      }
    }
  } else if (process.platform === 'darwin') {
    // macOS路径
    possiblePaths.push(
      path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'settings.json')
    );
  } else {
    // Linux路径
    possiblePaths.push(
      path.join(os.homedir(), '.config', 'Cursor', 'User', 'settings.json')
    );
  }

  // 2. 当前用户目录（优先级最高）
  if (process.platform === 'win32') {
    possiblePaths.unshift(
      path.join(os.homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'settings.json')
    );
  }

  console.log(`开始检查 ${possiblePaths.length} 个可能的路径...`);

  // 搜索存在的settings.json
  for (const settingsPath of possiblePaths) {
    if (fs.existsSync(settingsPath)) {
      console.log(`✓ 找到settings.json: ${settingsPath}`);
      cachedSettingsPath = settingsPath;
      return settingsPath;
    }
  }

  console.log('✗ 未找到settings.json文件');
  return null;
}

// 从后端API获取当前代理配置
async function fetchCurrentProxyConfig() {
  try {
    const apiUrl = 'https://www.xxdlzs.top/hou/csk/proxy-config/current';
    console.log('从后端获取当前代理配置...');

    const response = await axios.get(apiUrl, { timeout: 5000 });

    if (response.data.success && response.data.data) {
      console.log('成功获取代理配置');
      return response.data.data;
    } else {
      console.warn('获取代理配置失败:', response.data.message);
      return null;
    }
  } catch (error) {
    console.error('获取代理配置出错:', error.message);
    return null;
  }
}

// 检查Cursor Settings.json当前状态
ipcMain.handle('check-cursor-settings-status', async () => {
  try {
    console.log('检查Cursor settings.json当前状态...');

    // 搜索settings.json文件
    const settingsPath = findCursorSettingsPath();

    if (!settingsPath) {
      console.log('未找到settings.json文件');
      return {
        success: true,
        enabled: false,
        message: '未找到配置文件'
      };
    }

    // 读取文件内容
    const fileContent = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(fileContent);

    // 检查是否包含代理基础字段
    if (!settings['http.proxy'] ||
        !settings['http.proxySupport'] ||
        !settings['cursor.general.disableHttp2']) {
      console.log('settings.json中没有完整的代理配置');
      return {
        success: true,
        enabled: false,
        message: '未配置代理',
        proxyUrl: null
      };
    }

    const currentProxy = settings['http.proxy'];
    console.log(`settings.json中的代理地址: ${currentProxy}`);

    // 从数据库获取所有启用的代理地址
    try {
      const apiUrl = 'https://www.xxdlzs.top/hou/csk/proxy-config/proxy-urls';
      console.log('正在从数据库获取所有代理地址...');

      const response = await axios.get(apiUrl, { timeout: 5000 });

      if (response.data.success && response.data.data) {
        const proxyUrls = response.data.data;
        console.log(`数据库中有${proxyUrls.length}个启用的代理地址:`, proxyUrls);

        // 检查当前代理是否在数据库列表中
        const isInDatabase = proxyUrls.includes(currentProxy);

        console.log(`当前代理${isInDatabase ? '在' : '不在'}数据库列表中`);

        return {
          success: true,
          enabled: isInDatabase,
          message: isInDatabase ? '代理已开启' : '当前代理不在数据库中，视为已关闭',
          proxyUrl: isInDatabase ? currentProxy : null
        };
      } else {
        console.warn('获取数据库代理列表失败，使用fallback逻辑');
        // Fallback：如果API失败，只要有代理就认为是开启的
        const hasProxy = settings['http.proxy'] &&
                         settings['http.proxy'].length > 0 &&
                         settings['http.proxySupport'] === 'override' &&
                         settings['cursor.general.disableHttp2'] === true;

        return {
          success: true,
          enabled: hasProxy,
          message: hasProxy ? '代理已开启（未验证数据库）' : '代理已关闭',
          proxyUrl: hasProxy ? settings['http.proxy'] : null
        };
      }
    } catch (apiError) {
      console.warn('无法连接到数据库API，使用fallback逻辑:', apiError.message);
      // Fallback：如果API失败，只要有代理就认为是开启的
      const hasProxy = settings['http.proxy'] &&
                       settings['http.proxy'].length > 0 &&
                       settings['http.proxySupport'] === 'override' &&
                       settings['cursor.general.disableHttp2'] === true;

      return {
        success: true,
        enabled: hasProxy,
        message: hasProxy ? '代理已开启（未验证数据库）' : '代理已关闭',
        proxyUrl: hasProxy ? settings['http.proxy'] : null
      };
    }
  } catch (error) {
    console.error('检查Cursor设置状态失败:', error);
    return {
      success: true,
      enabled: false,
      message: '检查失败，默认关闭'
    };
  }
});

// 更新Cursor Settings.json（突破地区限制）
ipcMain.handle('update-cursor-settings', async (event, enabled) => {
  try {
    console.log(`更新Cursor设置: ${enabled ? '开启' : '关闭'}地区限制突破`);

    // 搜索settings.json文件
    const settingsPath = findCursorSettingsPath();

    if (!settingsPath) {
      console.error('未找到Cursor settings.json文件');
      return {
        success: false,
        error: '未找到Cursor配置文件',
        message: '请先打开Cursor进入首页，确保Cursor已正确初始化后再使用此功能'
      };
    }

    console.log(`设置文件路径: ${settingsPath}`);

    // 再次确认文件存在（双重检查）
    if (!fs.existsSync(settingsPath)) {
      console.error('settings.json文件不存在，无法修改');
      return {
        success: false,
        error: '配置文件不存在',
        message: '请先打开Cursor进入首页，确保Cursor已正确初始化后再使用此功能'
      };
    }

    if (enabled) {
      // ===== 开启地区限制：从后端获取配置并写入 =====
      const proxyConfig = await fetchCurrentProxyConfig();
      let settingsContent;

      if (proxyConfig) {
        // 使用从数据库获取的配置
        settingsContent = proxyConfig;
        console.log('使用数据库配置:', proxyConfig['http.proxy']);
      } else {
        // 如果获取失败，使用默认配置作为fallback
        console.warn('无法从数据库获取配置，使用默认配置');
        settingsContent = {
          "database-client.autoSync": true,
          "update.enableWindowsBackgroundUpdates": false,
          "update.mode": "none",
          "http.proxyAuthorization": null,
          "json.schemas": [],
          "window.commandCenter": true,
          "http.proxy": "socks5://xc999:xc123@154.201.91.204:38999",
          "http.systemCertificates": false,
          "http.proxySupport": "override",
          "http.experimental.systemCertificatesV2": false,
          "http.experimental.systemCertificates": false,
          "cursor.general.disableHttp2": true
        };
      }

      // 写入新配置
      fs.writeFileSync(settingsPath, JSON.stringify(settingsContent, null, 4), 'utf8');
      console.log('✓ 已开启地区限制突破，代理配置已写入');

      return {
        success: true,
        message: '已开启地区限制突破',
        config: settingsContent['http.proxy'] || null
      };
    } else {
      // ===== 关闭地区限制：使用固定的基础配置 =====
      console.log('准备关闭地区限制突破，使用基础配置...');
      
      const basicSettings = {
        "database-client.autoSync": true,
        "update.enableWindowsBackgroundUpdates": false,
        "update.mode": "none",
        "http.proxyAuthorization": null,
        "json.schemas": []
      };
      
      fs.writeFileSync(settingsPath, JSON.stringify(basicSettings, null, 4), 'utf8');
      console.log('✓ 已写入基础配置');
      
      return {
        success: true,
        message: '已关闭地区限制突破',
        config: null
      };
    }
  } catch (error) {
    console.error('更新Cursor设置失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 窗口控制事件
ipcMain.on('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});


