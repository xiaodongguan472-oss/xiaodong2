# Cursor自动启动和模型设置功能

## 功能概述

在刷新Cursor账号成功后，系统会自动：

1. **检查Cursor运行状态** - 判断Cursor是否已经在运行
2. **自动启动Cursor** - 如果Cursor未运行，则自动启动
3. **设置默认AI模型** - 将默认AI模型设置为claude-3.5-sonnet

## 实现细节

### 后端新增的IPC处理函数

#### 1. `check-cursor-running`
- **功能**: 检查Cursor是否正在运行
- **实现**: 
  - Windows: 使用`tasklist`命令检查Cursor.exe进程
  - macOS: 使用`pgrep -f Cursor`检查进程
  - Linux: 使用`pgrep -f cursor`检查进程
- **返回**: boolean值，true表示运行中，false表示未运行

#### 2. `launch-cursor`
- **功能**: 启动Cursor应用程序
- **实现**: 
  - 自动获取Cursor安装路径
  - Windows: 直接启动Cursor.exe
  - macOS: 使用`open -a`命令启动.app
  - Linux: 直接启动cursor可执行文件
- **返回**: 成功/失败状态和消息

#### 3. `set-cursor-default-model`
- **功能**: 设置Cursor的默认AI模型
- **实现**: 
  - 修改Cursor的settings.json文件
  - 设置`cursor.chat.defaultModel`和`cursor.general.defaultModel`
  - 自动创建备份文件
- **参数**: model (默认为'claude-3.5-sonnet')
- **返回**: 成功/失败状态和消息

#### 4. `get-user-data-path`
- **功能**: 获取Cursor用户数据目录路径
- **实现**: 
  - Windows: `%APPDATA%\Cursor`
  - macOS: `~/Library/Application Support/Cursor`
  - Linux: `~/.config/Cursor`
- **返回**: 用户数据路径字符串

### 前端流程改进

在`pythonStyleRenewal()`函数中，账号切换成功后会执行以下步骤：

1. **检查Cursor运行状态**
   ```javascript
   const isRunning = await ipcRenderer.invoke('check-cursor-running');
   ```

2. **条件启动Cursor**
   - 如果未运行：启动Cursor并等待3秒后设置默认模型
   - 如果已运行：直接设置默认模型

3. **设置默认模型**
   ```javascript
   const modelResult = await ipcRenderer.invoke('set-cursor-default-model', 'claude-3.5-sonnet');
   ```

### 用户体验改进

- **智能启动**: 只在Cursor未运行时才启动，避免重复启动
- **自动配置**: 自动设置最优的AI模型（Claude-3.5-Sonnet）
- **友好提示**: 根据不同情况显示相应的成功/警告消息
- **错误处理**: 完善的错误处理，即使某个步骤失败也不影响整体流程

### 消息提示

- Cursor未运行且启动成功：`续杯成功！Cursor已启动并设置默认模型为Claude-3.5-Sonnet`
- Cursor已运行：`续杯成功！默认模型已设置为Claude-3.5-Sonnet，请重启Cursor生效`
- 启动失败：`续杯成功！但启动Cursor失败，请手动启动`
- 模型设置失败：`续杯成功！但设置默认模型失败，请手动设置`

## 技术特点

1. **跨平台支持**: 支持Windows、macOS和Linux
2. **安全性**: 自动创建配置文件备份
3. **容错性**: 即使某个步骤失败，也不影响主要的续杯功能
4. **用户友好**: 提供详细的状态反馈和错误信息

## 使用方法

用户只需要点击"刷新Cursor"按钮，系统会自动完成所有操作，无需手动干预。
