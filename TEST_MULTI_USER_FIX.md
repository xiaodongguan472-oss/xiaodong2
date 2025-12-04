# 多用户数据库修复测试指南

## 如何测试修复是否生效

### 测试场景 1：单个数据库（正常情况）
1. 确保只有当前用户使用过Cursor
2. 运行程序，点击"刷新Cursor"
3. **预期结果**：正常工作，无选择对话框，直接使用当前用户数据库

### 测试场景 2：多个数据库（修复目标）
1. 确保电脑上有多个用户都使用过Cursor
2. 运行程序，点击"刷新Cursor" 
3. **预期结果**：显示数据库选择对话框，列出所有找到的用户数据库

### 测试场景 3：无数据库（错误处理）
1. 在没有安装或运行过Cursor的环境中测试
2. 运行程序，点击"刷新Cursor"
3. **预期结果**：显示友好错误消息"未找到任何Cursor数据库文件"

## 验证数据库搜索功能

### 手动验证数据库位置
**Windows:**
检查以下路径是否存在 `state.vscdb` 文件：
```
C:\Users\[用户名1]\AppData\Roaming\Cursor\User\globalStorage\state.vscdb
C:\Users\[用户名2]\AppData\Roaming\Cursor\User\globalStorage\state.vscdb
```

**macOS:**
```
/Users/[用户名1]/Library/Application Support/Cursor/User/globalStorage/state.vscdb
/Users/[用户名2]/Library/Application Support/Cursor/User/globalStorage/state.vscdb
```

**Linux:**
```
/home/[用户名1]/.config/Cursor/User/globalStorage/state.vscdb
/home/[用户名2]/.config/Cursor/User/globalStorage/state.vscdb
```

## 日志检查

打开开发者控制台（如果是开发模式），查看日志输出：

### 成功日志示例：
```
开始搜索所有用户目录中的Cursor数据库...
找到 2 个用户目录: ['user1', 'user2'] 
检查用户 user1 的数据库路径: C:\Users\user1\AppData\Roaming\Cursor\User\globalStorage\state.vscdb
✓ 找到用户 user1 的Cursor数据库: (xxx bytes)
检查用户 user2 的数据库路径: C:\Users\user2\AppData\Roaming\Cursor\User\globalStorage\state.vscdb
✓ 找到用户 user2 的Cursor数据库: (xxx bytes)
搜索完成，找到 2 个Cursor数据库
```

### 修复前的错误日志：
```
数据库路径: C:\Users\[当前用户]\AppData\Roaming\Cursor\User\globalStorage\state.vscdb
账号切换失败: 数据库文件不存在
```

### 修复后的成功日志：
```
找到 2 个Cursor数据库
用户选择的数据库: user2 (C:\Users\user2\AppData\Roaming\Cursor\User\globalStorage\state.vscdb)
正在执行Python风格账号切换...
目标数据库: C:\Users\user2\AppData\Roaming\Cursor\User\globalStorage\state.vscdb
Python风格账号切换成功！
```

## 功能验证清单

- [ ] 程序能够找到所有用户的Cursor数据库
- [ ] 数据库选择对话框正确显示用户信息
- [ ] 选择数据库后能够成功执行续杯操作
- [ ] 单个数据库时自动选择，无需用户干预
- [ ] 无数据库时显示合适的错误信息
- [ ] 权限不足时能够降级到当前用户检查

## 问题排查

### 如果仍然提示"数据库文件不存在"：
1. 检查是否有足够权限访问其他用户目录
2. 确认其他用户确实使用过Cursor（存在数据库文件）
3. 检查控制台日志，确认搜索过程

### 如果选择对话框不出现：
1. 检查是否真的有多个用户的数据库
2. 确认所有数据库文件都可以访问
3. 查看控制台日志中的搜索结果

### 如果选择数据库后仍然失败：
1. 检查选择的数据库文件是否损坏
2. 确认有足够权限修改该数据库
3. 尝试选择其他用户的数据库
