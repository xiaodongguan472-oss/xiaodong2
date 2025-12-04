# 工作区恢复功能说明

## 🎯 功能目标
点击"刷新Cursor"按钮后，Cursor重启时能够自动打开刚才关闭时的项目（工作区），而不是之前打开的项目。

## 📋 实现流程

### 1️⃣ **搜索数据库**
- 搜索所有可用的Cursor数据库
- 选择要使用的数据库

### 2️⃣ **保存工作区并关闭Cursor**
```
✓ 检测Cursor是否运行
✓ 如果运行，从数据库读取当前工作区路径
✓ 保存工作区路径到 globalStorage/workspace-backup.json
✓ 强制关闭Cursor进程
✓ 等待3秒确保进程完全关闭
```

### 3️⃣ **退出当前登录账号**
```
✓ 清除数据库中的登录信息键值
```

### 4️⃣ **账号切换+重置机器ID+修改注册表**
```
✓ 重置storage.json中的机器码
✓ 重置机器ID文件
✓ 重置Windows注册表MachineGuid
✓ 写入新的email、token等信息
```

### 5️⃣ **启动Cursor并恢复工作区**
```
✓ 从 workspace-backup.json 读取保存的工作区路径
✓ 使用工作区路径作为启动参数启动Cursor
✓ Cursor自动打开之前的项目
```

## 📁 保存的文件格式

**文件位置：** `C:\Users\<用户名>\AppData\Roaming\Cursor\User\globalStorage\workspace-backup.json`

**文件内容：**
```json
{
  "workspace": "D:\\Projects\\my-project",
  "timestamp": "2025-10-04T12:30:00.000Z",
  "dbPath": "C:\\Users\\Administrator\\AppData\\Roaming\\Cursor\\User\\globalStorage\\state.vscdb"
}
```

## 🔧 技术实现细节

### 后端函数（main.js）

#### `saveCurrentWorkspace(dbPath)`
- 连接Cursor数据库（只读模式）
- 查询工作区相关的键值：
  - `workbench.panel.recentlyOpenedPathsList`
  - `history.recentlyOpenedPathsList`
  - `openedPathsList.entries`
  - `workspaces.recentlyOpened`
- 解析JSON数据提取最近使用的工作区路径
- 保存到 `workspace-backup.json` 文件

#### `loadSavedWorkspace(dbPath)`
- 读取 `workspace-backup.json` 文件
- 返回保存的工作区路径和时间戳

#### `launch-cursor` (修改版)
- 接受可选的 `workspacePath` 参数
- 验证工作区路径是否存在
- 构建启动参数：
  - **Windows:** `Cursor.exe <workspacePath>`
  - **macOS:** `open -a Cursor.app --args <workspacePath>`
  - **Linux:** `cursor <workspacePath>`

### 前端流程（index.html）

```javascript
// 1. 定义工作区变量
let savedWorkspace = null;

// 2. 选择数据库后保存工作区
const saveResult = await ipcRenderer.invoke('save-current-workspace', selectedDatabase.path);
if (saveResult.success) {
  savedWorkspace = saveResult.workspace;
}

// 3. 关闭Cursor...

// 4. 执行账号切换...

// 5. 启动时使用保存的工作区
const launchResult = await ipcRenderer.invoke('launch-cursor', savedWorkspace);
```

## ✨ 用户体验

### 成功场景：
```
用户在项目A中点击"刷新Cursor"
↓
系统提示：已保存当前工作区: project-A
↓
Cursor关闭
↓
执行账号切换和机器ID重置
↓
Cursor启动
↓
系统提示：🎉 续杯成功！Cursor已启动并恢复到项目: project-A
↓
Cursor自动打开项目A
```

### 异常处理：
- 如果无法读取工作区：继续执行，启动时不使用工作区参数
- 如果工作区路径不存在：启动时不使用工作区参数
- 如果Cursor未运行：尝试从备份文件读取上次保存的工作区

## 🔍 调试信息

控制台会显示详细的日志：
```
✓ 找到工作区数据，使用键: history.recentlyOpenedPathsList
✓ 工作区路径已保存: D:\Projects\my-project
✓ 工作区路径已保存到: C:\Users\...\workspace-backup.json
✓ 从备份读取到工作区: D:\Projects\my-project
✓ 将使用工作区路径启动: D:\Projects\my-project
✓ Cursor启动成功（已恢复工作区）
```

## 🎉 功能优势

1. **无缝体验**：用户无需重新打开项目
2. **智能保存**：自动从数据库读取当前工作区
3. **容错性强**：失败时不影响续杯流程
4. **持久化存储**：保存在本地JSON文件，可跨会话使用
5. **多平台支持**：Windows、macOS、Linux全平台支持

## 📝 注意事项

1. 工作区路径必须存在才会使用
2. 保存的是最近使用的第一个工作区
3. 备份文件保存在数据库同目录的 `globalStorage` 文件夹
4. 每次刷新都会更新备份文件

---

**实现日期：** 2025-10-04  
**版本：** 1.0.0

