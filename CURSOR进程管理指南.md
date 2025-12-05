# Cursor编辑器进程管理指南

## 一、Cursor进程识别

### 1.1 Cursor编辑器进程特征
Cursor编辑器运行时会产生以下进程：

| 进程类型 | 进程路径/名称 | 说明 |
|---------|--------------|------|
| 主进程 | `/Applications/Cursor.app/Contents/MacOS/Cursor` | Cursor编辑器主程序 |
| GPU进程 | `Cursor Helper (GPU)` | 图形渲染加速 |
| 渲染进程 | `Cursor Helper (Renderer)` | UI界面渲染 |
| 网络进程 | `Cursor Helper` | 网络服务 |
| 共享进程 | `Cursor Helper: shared-process` | 共享服务进程 |
| 文件监视 | `Cursor Helper: fileWatcher` | 文件变化监控 |
| 插件进程 | `Cursor Helper (Plugin)` | 扩展插件宿主 |
| 崩溃处理 | `chrome_crashpad_handler` | 崩溃报告服务 |

### 1.2 需要排除的无关进程
以下进程名称中虽然包含"cursor"，但与Cursor编辑器无关：

| 进程名称 | 说明 | 位置 |
|---------|-----|------|
| `CursorUIViewService` | macOS系统光标UI服务 | `/System/Library/PrivateFrameworks/` |
| `cursor-renewal-client` | 续杯助手项目进程 | 用户项目目录 |

## 二、查找Cursor进程

### 2.1 基础查找命令

```bash
# 方法1：查找所有Cursor.app相关进程（推荐）
ps aux | grep "/Applications/Cursor.app" | grep -v grep

# 方法2：只查找主进程
ps aux | grep "/Applications/Cursor.app/Contents/MacOS/Cursor" | grep -v grep

# 方法3：使用pgrep（返回PID）
pgrep -f "/Applications/Cursor.app/Contents/MacOS/Cursor"

# 方法4：查找所有Helper进程
ps aux | grep "Cursor Helper" | grep -v grep

# 方法5：统计Cursor进程数量
ps aux | grep "/Applications/Cursor.app" | grep -v grep | wc -l
```

### 2.2 JavaScript实现

```javascript
const { execSync } = require('child_process');

// 检查Cursor是否在运行
function isCursorRunning() {
    try {
        const result = execSync('ps aux | grep "/Applications/Cursor.app" | grep -v grep', 
                               { encoding: 'utf8' });
        return result.trim().length > 0;
    } catch (e) {
        // 没有找到进程时grep返回错误，这是正常的
        return false;
    }
}

// 获取Cursor主进程PID
function getCursorMainPID() {
    try {
        const result = execSync('pgrep -f "/Applications/Cursor.app/Contents/MacOS/Cursor"', 
                               { encoding: 'utf8' });
        const pids = result.trim().split('\n');
        return pids[0] ? parseInt(pids[0]) : null;
    } catch (e) {
        return null;
    }
}

// 获取所有Cursor相关进程
function getAllCursorProcesses() {
    try {
        const result = execSync('ps aux | grep "/Applications/Cursor.app" | grep -v grep', 
                               { encoding: 'utf8' });
        return result.split('\n')
                    .filter(line => line.trim())
                    .map(line => {
                        const parts = line.trim().split(/\s+/);
                        return {
                            user: parts[0],
                            pid: parseInt(parts[1]),
                            cpu: parseFloat(parts[2]),
                            mem: parseFloat(parts[3]),
                            command: parts.slice(10).join(' ')
                        };
                    });
    } catch (e) {
        return [];
    }
}
```

## 三、关闭Cursor进程

### 3.1 关闭策略

#### 优先级顺序（从温和到强制）：
1. **优雅关闭**：通过AppleScript发送退出命令
2. **信号关闭**：发送SIGTERM信号给主进程
3. **强制终止**：发送SIGKILL信号强制结束

### 3.2 命令行关闭方法

```bash
# 方法1：优雅关闭（推荐首选）
osascript -e 'quit app "Cursor"'

# 方法2：通过进程名关闭主进程
pkill -f "/Applications/Cursor.app/Contents/MacOS/Cursor"

# 方法3：强制关闭所有相关进程
pkill -9 -f "/Applications/Cursor.app"

# 方法4：通过PID关闭（需要先获取PID）
kill $(pgrep -f "/Applications/Cursor.app/Contents/MacOS/Cursor")

# 方法5：强制关闭指定PID
kill -9 $(pgrep -f "/Applications/Cursor.app/Contents/MacOS/Cursor")
```

### 3.3 JavaScript实现

```javascript
const { execSync } = require('child_process');

function closeCursor() {
    const steps = [];
    
    try {
        // 步骤1：尝试优雅关闭
        steps.push('尝试优雅关闭...');
        try {
            execSync('osascript -e \'quit app "Cursor"\'', { stdio: 'ignore' });
            steps.push('✓ 发送退出命令');
        } catch (e) {
            steps.push('✗ 优雅关闭失败');
        }
        
        // 步骤2：等待进程退出
        execSync('sleep 2');
        
        // 步骤3：检查是否还有进程
        try {
            const pids = execSync('pgrep -f "/Applications/Cursor.app/Contents/MacOS/Cursor"', 
                                 { encoding: 'utf8' }).trim();
            if (pids) {
                steps.push('进程仍在运行，尝试强制关闭...');
                
                // 步骤4：强制关闭
                execSync('pkill -9 -f "/Applications/Cursor.app"', { stdio: 'ignore' });
                steps.push('✓ 强制关闭执行');
            }
        } catch (e) {
            // pgrep没有找到进程，说明已经关闭
            steps.push('✓ 进程已退出');
        }
        
        // 步骤5：最终验证
        execSync('sleep 1');
        const stillRunning = isCursorRunning();
        
        return {
            success: !stillRunning,
            steps: steps,
            message: stillRunning ? '关闭失败' : '关闭成功'
        };
        
    } catch (error) {
        return {
            success: false,
            steps: steps,
            message: '关闭过程出错: ' + error.message
        };
    }
}
```

## 四、完整示例代码

```javascript
// cursor-manager.js
const { execSync } = require('child_process');

class CursorManager {
    constructor() {
        this.mainProcessPath = '/Applications/Cursor.app/Contents/MacOS/Cursor';
        this.appPath = '/Applications/Cursor.app';
    }
    
    // 检查Cursor是否运行
    isRunning() {
        try {
            execSync(`pgrep -f "${this.mainProcessPath}"`, { encoding: 'utf8' });
            return true;
        } catch (e) {
            return false;
        }
    }
    
    // 获取进程信息
    getProcessInfo() {
        if (!this.isRunning()) {
            return { running: false, processes: [] };
        }
        
        try {
            const result = execSync(`ps aux | grep "${this.appPath}" | grep -v grep`, 
                                   { encoding: 'utf8' });
            const processes = result.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const parts = line.trim().split(/\s+/);
                    return {
                        pid: parseInt(parts[1]),
                        cpu: parseFloat(parts[2]),
                        mem: parseFloat(parts[3]),
                        type: this.identifyProcessType(line)
                    };
                });
            
            return {
                running: true,
                mainPID: processes.find(p => p.type === 'main')?.pid,
                processCount: processes.length,
                processes: processes
            };
        } catch (e) {
            return { running: false, processes: [] };
        }
    }
    
    // 识别进程类型
    identifyProcessType(processLine) {
        if (processLine.includes('/MacOS/Cursor')) return 'main';
        if (processLine.includes('Helper (GPU)')) return 'gpu';
        if (processLine.includes('Helper (Renderer)')) return 'renderer';
        if (processLine.includes('Helper (Plugin)')) return 'plugin';
        if (processLine.includes('fileWatcher')) return 'fileWatcher';
        if (processLine.includes('shared-process')) return 'shared';
        if (processLine.includes('crashpad')) return 'crashpad';
        return 'other';
    }
    
    // 关闭Cursor
    close(force = false) {
        if (!this.isRunning()) {
            return { success: true, message: 'Cursor未运行' };
        }
        
        try {
            if (!force) {
                // 优雅关闭
                execSync('osascript -e \'quit app "Cursor"\'', { stdio: 'ignore' });
                execSync('sleep 2');
                
                // 检查是否关闭
                if (!this.isRunning()) {
                    return { success: true, message: '优雅关闭成功' };
                }
            }
            
            // 强制关闭
            execSync(`pkill -9 -f "${this.appPath}"`, { stdio: 'ignore' });
            execSync('sleep 1');
            
            // 验证
            if (!this.isRunning()) {
                return { success: true, message: force ? '强制关闭成功' : '关闭成功' };
            } else {
                return { success: false, message: '关闭失败，进程仍在运行' };
            }
            
        } catch (error) {
            return { success: false, message: '关闭出错: ' + error.message };
        }
    }
    
    // 启动Cursor
    open() {
        try {
            execSync('open -a Cursor', { stdio: 'ignore' });
            return { success: true, message: 'Cursor已启动' };
        } catch (error) {
            return { success: false, message: '启动失败: ' + error.message };
        }
    }
}

// 使用示例
const cursor = new CursorManager();

// 检查状态
console.log('Cursor运行状态:', cursor.isRunning());

// 获取详细信息
console.log('进程信息:', cursor.getProcessInfo());

// 关闭Cursor
console.log('关闭结果:', cursor.close());

// 强制关闭
// console.log('强制关闭:', cursor.close(true));

module.exports = CursorManager;
```

## 五、注意事项

### 5.1 关键原则
1. **主进程是关键**：关闭主进程后，所有Helper进程会自动退出
2. **优先优雅关闭**：先尝试正常退出，避免数据丢失
3. **验证关闭结果**：关闭后需要验证确认进程已完全退出
4. **排除系统进程**：不要误关闭系统的CursorUIViewService

### 5.2 常见问题

#### Q: 为什么关闭主进程后还有Helper进程？
A: 正常情况下不会，如果出现说明进程异常，需要强制关闭

#### Q: CursorUIViewService需要关闭吗？
A: 不需要，这是macOS系统进程，与Cursor编辑器无关

#### Q: 如何判断是Cursor编辑器还是其他包含cursor的进程？
A: 检查进程路径是否包含`/Applications/Cursor.app`

#### Q: 关闭后如何重新启动？
A: 使用命令 `open -a Cursor` 或双击应用图标

### 5.3 最佳实践
1. 集成到续杯助手时，建议使用CursorManager类
2. 提供用户选择：正常关闭或强制关闭
3. 关闭前保存用户工作（如果可能）
4. 记录操作日志便于问题排查

## 六、快速参考

```bash
# 检查是否运行
ps aux | grep "/Applications/Cursor.app" | grep -v grep

# 优雅关闭
osascript -e 'quit app "Cursor"'

# 强制关闭
pkill -9 -f "/Applications/Cursor.app"

# 重新启动
open -a Cursor
```
