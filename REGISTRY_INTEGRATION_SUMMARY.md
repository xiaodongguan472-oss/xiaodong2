# Windows注册表机器码重置功能集成

## 功能概述

已成功在Cursor续杯客户端中集成Windows注册表机器码重置功能，现在点击"刷新Cursor"按钮时，不仅会重置Cursor应用内的机器ID文件，还会同时重置Windows注册表中的MachineGuid值。

## 实现的功能

### 1. 依赖包管理
- ✅ 安装了`regedit@5.1.4`依赖包
- ✅ 在package.json的build配置中添加了regedit到asarUnpack列表

### 2. 注册表操作模块 (regedit-utils.js)
- ✅ 创建了独立的注册表操作模块
- ✅ 实现了getMachineGuid()函数 - 读取当前注册表MachineGuid值
- ✅ 实现了setMachineGuid()函数 - 写入新的MachineGuid值
- ✅ 实现了resetMachineGuid()函数 - 完整的重置流程
- ✅ 配置了Electron打包环境的VBS脚本路径
- ✅ 添加了完善的错误处理和日志记录

### 3. 主进程集成 (main.js)
- ✅ 导入了regedit-utils模块
- ✅ 在刷新流程中集成了注册表重置功能
- ✅ 添加了平台检测，仅在Windows系统执行注册表操作
- ✅ 实现了友好的错误处理，不会中断主流程

## 实现细节

### 注册表路径
```
HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography\MachineGuid
```

### 集成位置
在`main.js`的`ipcMain.handle('python-style-renewal')`处理函数中，机器ID重置之后立即执行注册表重置：

```javascript
// 重置机器ID文件
await resetMachineIds(cursorDir);

// 重置Windows注册表中的MachineGuid（仅在Windows平台）
if (process.platform === 'win32') {
  const registryResult = await resetMachineGuid();
  if (registryResult.success) {
    console.log(`注册表MachineGuid重置成功: ${registryResult.oldValue} -> ${registryResult.newValue}`);
  }
}
```

### 权限要求
- 应用需要以管理员权限运行才能修改注册表
- package.json中已配置`"requestedExecutionLevel": "requireAdministrator"`

## 工作流程

1. 用户点击"刷新Cursor"按钮
2. 验证授权码成功后，开始重置机器码流程
3. 首先重置Cursor应用内的机器ID文件
4. 然后重置Windows注册表中的MachineGuid（仅Windows）
5. 继续执行后续的账号切换和Cursor重启流程

## 日志输出示例

```
正在重置Windows注册表MachineGuid...
正在读取注册表MachineGuid...
当前注册表MachineGuid: 12345678-1234-1234-1234-123456789012
正在设置新的注册表MachineGuid: 87654321-4321-4321-4321-210987654321
注册表MachineGuid设置成功
注册表MachineGuid重置成功: 12345678-1234-1234-1234-123456789012 -> 87654321-4321-4321-4321-210987654321
```

## 错误处理

- 如果注册表操作失败，会记录错误日志但不会中断整个刷新流程
- 非Windows平台会自动跳过注册表操作
- 权限不足时会友好提示错误信息

## 文件清单

### 新增文件
- `regedit-utils.js` - 注册表操作模块

### 修改文件
- `package.json` - 添加regedit依赖和asarUnpack配置
- `main.js` - 集成注册表重置功能

## 使用说明

现在用户只需要：
1. 输入有效的授权码
2. 点击"刷新Cursor"按钮
3. 系统会自动重置所有机器码标识（包括注册表）
4. 完成账号切换和Cursor重启

这样可以确保机器码重置的完整性，提高续杯功能的成功率。 