# 多用户数据库支持修复

## 问题描述

原程序在多用户电脑环境下，只会查询当前用户的 `state.vscdb` 数据库文件，但在某些情况下，Cursor 数据库可能存在于其他用户目录中，导致程序提示"数据库文件不存在"。

## 解决方案

### 1. 后端修改 (main.js)

添加了新的 IPC 处理器 `find-all-cursor-databases`，该功能：

- **Windows**: 搜索 `C:\Users\[用户名]\AppData\Roaming\Cursor\User\globalStorage\state.vscdb`
- **macOS**: 搜索 `/Users/[用户名]/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
- **Linux**: 搜索 `/home/[用户名]/.config/Cursor/User/globalStorage/state.vscdb`

#### 特性：
- 自动跳过系统用户目录 (Public, Default, Shared 等)
- 验证文件可访问性
- 按修改时间排序（最新的在前）
- 提供降级支持（如果权限不足，回退到当前用户）
- 返回详细信息：用户名、路径、文件大小、修改时间

### 2. 前端修改 (index.html)

#### 数据结构添加：
```javascript
// 数据库选择对话框
showDatabaseDialog: false,
availableDatabases: [],
selectedDatabaseIndex: 0
```

#### 新增方法：
- `selectDatabase()`: 处理多数据库选择逻辑
- `confirmDatabaseSelection()`: 确认选择
- `cancelDatabaseSelection()`: 取消选择
- `formatFileSize()`: 格式化文件大小显示
- `formatModifiedTime()`: 格式化修改时间显示

#### 修改的主要逻辑：
- `pythonStyleRenewal()`: 使用新的数据库搜索功能
- 如果只有一个数据库，自动使用
- 如果有多个数据库，显示选择对话框

### 3. 用户界面改进

添加了数据库选择对话框，包含：
- 用户友好的数据库列表显示
- 显示用户名、路径、文件大小、修改时间
- 推荐最新修改的数据库
- 清晰的选择指示器
- 提示信息

## 使用流程

1. 用户点击"刷新Cursor"
2. 系统自动搜索所有用户目录中的数据库
3. 如果找到一个数据库：自动使用
4. 如果找到多个数据库：显示选择对话框
5. 用户选择后继续正常的续杯流程

## 安全性考虑

- 仅读取数据库文件信息，不会访问敏感数据
- 自动跳过系统和无权限访问的目录
- 提供降级支持，确保程序在权限受限时仍能工作

## 兼容性

- 完全向后兼容现有功能
- 支持 Windows、macOS、Linux
- 在单用户环境下行为保持不变
- 新功能仅在多用户环境且存在多个数据库时激活

## 错误处理

- 如果没有找到任何数据库：显示友好的错误信息
- 如果用户取消选择：中止操作
- 如果数据库访问失败：提供详细的错误信息
- 权限不足时自动降级到当前用户检查

## 测试建议

1. 在单用户环境测试正常功能
2. 在多用户环境测试数据库选择功能
3. 测试权限受限情况下的降级行为
4. 验证不同操作系统的路径解析
