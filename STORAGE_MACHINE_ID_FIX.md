# Storage.json 机器码重置功能修复

## 问题描述

原有的刷新Cursor按钮没有正确重置`storage.json`文件中的机器码，导致重置失败。用户提供了正确的字段要求和生成逻辑。

## 修复内容

### 1. 问题分析
- 原来的`resetMachineIds`函数只处理了一些机器ID文件，但没有处理关键的`storage.json`文件
- `storage.json`文件位于`C:\Users\用户名\AppData\Roaming\Cursor\User\globalStorage\storage.json`
- 该文件包含了Cursor的遥测相关机器码字段

### 2. 需要重置的字段

根据用户提供的参考代码和要求，需要正确重置以下字段：

```json
{
  "telemetry.machineId": "64位字符（SHA256哈希）",
  "telemetry.devDeviceId": "随机UUID", 
  "telemetry.sqmId": "{随机UUID转大写}",
  "telemetry.macMachineId": "随机UUID"
}
```

### 3. 生成逻辑

按照用户提供的参考代码实现：

```javascript
function generateMachineIds() {
  const machineId = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex')
  const devDeviceId = uuidv4()
  const sqmId = '{' + uuidv4().toUpperCase() + '}'

  return {
    machineId,
    devDeviceId,
    sqmId
  }
}
```

### 4. 修复实现

#### 创建新函数 `resetStorageMachineIds`
- 自动检测操作系统并找到正确的storage.json路径
- 备份原始配置文件到backups目录
- 按照用户要求的格式生成新的机器码
- 更新storage.json文件中的相关字段

#### 集成到刷新流程
在`python-style-renewal`处理函数中添加了storage.json重置：

```javascript
// 重置storage.json中的机器码（重要：按照用户要求的格式）
console.log('正在重置storage.json中的机器码...');
try {
  const storageResetResult = await resetStorageMachineIds();
  if (storageResetResult.success) {
    console.log('storage.json机器码重置成功');
    console.log('新的机器码:', storageResetResult.newIds);
  } else {
    console.warn('storage.json重置失败:', storageResetResult.error);
  }
} catch (storageError) {
  console.warn('storage.json重置过程中出错:', storageError.message);
}
```

#### 更新IPC处理器
简化了`ipcMain.handle('reset-cursor-machine-id')`处理器，直接调用新的`resetStorageMachineIds`函数。

### 5. 功能特性

#### 跨平台支持
- **Windows**: `%APPDATA%\Cursor\User\globalStorage\storage.json`
- **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/storage.json`
- **Linux**: `~/.config/Cursor/User/globalStorage/storage.json`

#### 安全备份
- 每次重置前自动备份原始配置
- 备份文件命名：`storage.json.backup_2024-01-01T12-00-00-000Z`
- 备份保存在同目录下的`backups`文件夹

#### 详细日志
```
重置机器码 - 目标文件: C:\Users\用户名\AppData\Roaming\Cursor\User\globalStorage\storage.json
配置文件已备份到: C:\Users\用户名\AppData\Roaming\Cursor\User\globalStorage\backups\storage.json.backup_2024-01-01T12-00-00-000Z
生成新的机器码（按照用户要求的格式）:
- telemetry.machineId: a1b2c3d4e5f6... (64位字符)
- telemetry.devDeviceId: 12345678-1234-1234-1234-123456789012 (随机UUID)
- telemetry.sqmId: {87654321-4321-4321-4321-210987654321} (拼接{UUID转大写})
- telemetry.macMachineId: abcdefgh-ijkl-mnop-qrst-uvwxyz123456
storage.json机器码重置成功
```

## 测试验证

### 手动测试步骤
1. 启动Cursor续杯客户端
2. 输入有效的授权码
3. 点击"刷新Cursor"按钮
4. 查看控制台日志确认storage.json重置成功
5. 检查Cursor\User\globalStorage\backups目录确认备份文件存在

### 预期结果
- storage.json文件中的机器码字段被正确更新
- 原始配置文件被安全备份
- 同时保留原有的机器ID文件重置功能（兼容性）
- Windows注册表MachineGuid也会被重置

## 总结

现在的刷新功能会完整地重置：
1. ✅ **storage.json中的机器码**（新增修复）
2. ✅ **传统的机器ID文件**（原有功能）
3. ✅ **Windows注册表MachineGuid**（原有功能）

这确保了机器码重置的完整性，显著提高了续杯功能的成功率。 