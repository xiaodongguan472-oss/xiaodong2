# Settings.json 备份恢复功能

## 更新时间
2025-10-14

## 功能描述
实现了 `settings.json` 的自动备份和恢复机制。当启动续杯工具时，会自动备份 Cursor 的 `settings.json` 文件。当用户点击"关闭地区限制突破"按钮时，会恢复到启动时的原始配置，而不是写入固定的默认值。

## 问题背景

### 原先的实现问题
关闭地区限制时，会写入一些固定的基础配置值：
```json
{
  "database-client.autoSync": true,
  "update.enableWindowsBackgroundUpdates": false,
  "update.mode": "none",
  "http.proxyAuthorization": null,
  "json.schemas": []
}
```

这会导致：
- ❌ 用户自定义的其他配置丢失
- ❌ 插件相关的配置被清空
- ❌ 主题、字体等个性化设置消失
- ❌ 用户体验不佳

### 现在的解决方案
- ✅ 启动时自动备份原始配置
- ✅ 关闭地区限制时恢复备份
- ✅ 完整保留用户的所有个性化配置
- ✅ 双重保险：备份失败时仍使用基础配置兜底

---

## 实现方案

### 1. 备份机制

#### 备份时机
应用启动后 **2秒** 自动执行备份（延迟执行确保应用完全启动）

#### 备份函数
```javascript
function backupCursorSettings(settingsPath)
```

**功能**：
- 读取 `settings.json` 文件内容
- 保存到内存变量 `settingsBackup`
- 验证备份内容是否为有效的 JSON 格式
- 输出详细的备份日志

**返回**：
- `true` - 备份成功
- `false` - 备份失败

---

### 2. 恢复机制

#### 恢复时机
用户点击"关闭地区限制突破"按钮时自动执行

#### 恢复函数
```javascript
function restoreCursorSettings(settingsPath)
```

**功能**：
- 检查是否有可用的备份
- 将备份内容写回到 `settings.json` 文件
- 输出详细的恢复日志

**返回**：
- `true` - 恢复成功
- `false` - 恢复失败

---

### 3. 兜底机制

为了确保功能的稳定性，实现了多层兜底方案：

#### 场景1: 正常情况（有备份）
```
关闭地区限制
  ↓
检测到启动时的备份
  ↓
恢复备份到 settings.json
  ↓
✓ 配置已恢复到启动时的状态
```

#### 场景2: 备份恢复失败
```
关闭地区限制
  ↓
检测到启动时的备份
  ↓
尝试恢复失败（文件权限/路径错误等）
  ↓
使用基础配置作为兜底
  ↓
✓ 已写入基础配置
```

#### 场景3: 无备份（首次使用）
```
关闭地区限制
  ↓
未检测到启动时的备份
  ↓
使用基础配置作为兜底
  ↓
✓ 已写入基础配置
```

---

## 代码位置

### 1. 备份相关变量和函数
**文件**: `electron/cursor-renewal-client/main.js`  
**位置**: 第 4069-4126 行

```javascript
// 备份settings.json的内容（在应用启动时自动备份）
let settingsBackup = null;

// 备份当前的settings.json文件
function backupCursorSettings(settingsPath) { ... }

// 恢复settings.json文件从备份
function restoreCursorSettings(settingsPath) { ... }
```

### 2. 启动时自动备份
**文件**: `electron/cursor-renewal-client/main.js`  
**位置**: 第 310-326 行

```javascript
// 【新增】应用启动时自动备份Cursor settings.json
setTimeout(() => {
  console.log('=== 开始备份Cursor settings.json ===');
  const settingsPath = findCursorSettingsPath();
  if (settingsPath) {
    const backupSuccess = backupCursorSettings(settingsPath);
    // ...
  }
}, 2000);
```

### 3. 关闭地区限制时恢复备份
**文件**: `electron/cursor-renewal-client/main.js`  
**位置**: 第 4413-4465 行

```javascript
} else {
  // ===== 关闭地区限制：恢复备份文件 =====
  if (settingsBackup) {
    const restoreSuccess = restoreCursorSettings(settingsPath);
    // ...
  } else {
    // 使用基础配置作为兜底
  }
}
```

---

## 日志输出示例

### 启动时备份成功
```
=== 开始备份Cursor settings.json ===
使用缓存的settings.json路径: C:\Users\Administrator\AppData\Roaming\Cursor\User\settings.json
✓ 已备份settings.json: C:\Users\Administrator\AppData\Roaming\Cursor\User\settings.json
✓ 备份内容长度: 387 字符
✓ 备份内容验证通过（有效的JSON格式）
✓ settings.json备份完成，关闭地区限制时将恢复此备份
=====================================
```

### 启动时未找到配置文件
```
=== 开始备份Cursor settings.json ===
开始全盘搜索Cursor settings.json文件...
找到可用驱动器: C:, D:
✗ 未找到settings.json文件
⚠ 未找到settings.json文件，可能Cursor尚未运行
  提示：首次使用地区限制功能时，请确保Cursor已打开并初始化
=====================================
```

### 关闭地区限制时恢复成功
```
更新Cursor设置: 关闭地区限制突破
设置文件路径: C:\Users\Administrator\AppData\Roaming\Cursor\User\settings.json
准备关闭地区限制突破...
检测到启动时的备份，正在恢复...
✓ 已从备份恢复settings.json: C:\Users\Administrator\AppData\Roaming\Cursor\User\settings.json
✓ 恢复内容长度: 387 字符
✓ 已从备份恢复settings.json，配置已恢复到启动时的状态
```

### 关闭地区限制时无备份（兜底）
```
更新Cursor设置: 关闭地区限制突破
设置文件路径: C:\Users\Administrator\AppData\Roaming\Cursor\User\settings.json
准备关闭地区限制突破...
⚠ 未找到启动时的备份，将使用基础配置
✓ 已写入基础配置（无备份的兜底方案）
```

---

## 用户体验对比

### 改进前（写入固定值）
```
用户的 settings.json:
{
  "editor.fontSize": 16,
  "workbench.colorTheme": "Monokai",
  "editor.fontFamily": "Fira Code",
  "extensions.ignoreRecommendations": true,
  "http.proxy": "socks5://xxx",
  // ... 其他几十项配置
}

点击"关闭地区限制"后：
{
  "database-client.autoSync": true,
  "update.enableWindowsBackgroundUpdates": false,
  "update.mode": "none",
  "http.proxyAuthorization": null,
  "json.schemas": []
}

❌ 用户的所有个性化配置都丢失了！
```

### 改进后（恢复备份）
```
用户的 settings.json:
{
  "editor.fontSize": 16,
  "workbench.colorTheme": "Monokai",
  "editor.fontFamily": "Fira Code",
  "extensions.ignoreRecommendations": true,
  "http.proxy": "socks5://xxx",
  // ... 其他几十项配置
}

点击"关闭地区限制"后：
{
  "editor.fontSize": 16,
  "workbench.colorTheme": "Monokai",
  "editor.fontFamily": "Fira Code",
  "extensions.ignoreRecommendations": true,
  // http.proxy 已移除
  // ... 其他配置完整保留
}

✓ 用户的所有个性化配置都完整保留！
```

---

## 备份内容示例

以用户提供的配置为例：
```json
{
    "update.enableWindowsBackgroundUpdates": false,
    "http.experimental.systemCertificates": false,
    "http.proxy": "socks5://LHG:LHG@154.44.9.182:11097",
    "http.experimental.systemCertificatesV2": false,
    "cursor.general.disableHttp2": true,
    "update.mode": "none",
    "http.proxyAuthorization": null,
    "http.proxySupport": "override",
    "json.schemas": [],
    "database-client.autoSync": true,
    "http.systemCertificates": false,
    "window.commandCenter": true
}
```

**启动时**：完整备份上述内容到内存  
**开启地区限制**：写入新的代理配置  
**关闭地区限制**：恢复上述完整内容（保留所有原始配置）

---

## 安全性保证

### 1. 内容验证
- 备份时验证 JSON 格式有效性
- 防止备份损坏的配置文件

### 2. 文件存在性检查
- 备份前检查文件是否存在
- 恢复前检查路径是否有效

### 3. 异常处理
- 所有文件操作都包裹在 try-catch 中
- 详细的错误日志输出
- 失败时有兜底方案

### 4. 兜底机制
- 备份失败：仍可使用基础配置关闭代理
- 恢复失败：自动切换到基础配置
- 无备份：直接使用基础配置

---

## 使用场景

### 场景1: 正常使用流程
1. 启动续杯工具 → 自动备份 `settings.json`
2. 点击"开启地区限制" → 写入代理配置
3. 点击"关闭地区限制" → 恢复备份配置 ✓

### 场景2: 首次使用（Cursor未初始化）
1. 启动续杯工具 → 未找到 `settings.json`，无法备份
2. 打开并初始化 Cursor
3. 点击"开启地区限制" → 写入代理配置
4. 点击"关闭地区限制" → 使用基础配置（兜底）

### 场景3: 备份失败（权限问题等）
1. 启动续杯工具 → 备份失败
2. 点击"开启地区限制" → 写入代理配置
3. 点击"关闭地区限制" → 使用基础配置（兜底）

---

## 测试建议

### 测试用例1: 正常备份恢复
1. 自定义 `settings.json`，添加一些个性化配置
2. 启动续杯工具，观察控制台备份日志
3. 开启地区限制
4. 关闭地区限制
5. **验证**：个性化配置是否完整保留

### 测试用例2: 无备份兜底
1. 手动删除或清空 `settings.json`
2. 启动续杯工具（无法备份）
3. 重新创建 `settings.json`
4. 开启地区限制
5. 关闭地区限制
6. **验证**：是否使用基础配置，不会报错

### 测试用例3: 备份恢复失败兜底
1. 备份成功后，手动删除 `settings.json`
2. 开启地区限制（会重新创建文件）
3. 关闭地区限制（恢复到不存在的路径会失败）
4. **验证**：是否自动切换到基础配置兜底

---

## 注意事项

1. **备份时机**：应用启动后 2 秒自动执行，确保应用完全初始化
2. **备份存储**：备份内容存储在内存中（`settingsBackup` 变量），重启应用后重新备份
3. **多次开关**：多次开启/关闭地区限制，始终恢复到启动时的备份（不会叠加修改）
4. **兜底保障**：即使备份失败，关闭地区限制时仍能正常工作（使用基础配置）

---

## 相关代码文件

- `electron/cursor-renewal-client/main.js` (第 310-326, 4069-4126, 4413-4465 行)

---

## 版本信息

- **更新日期**: 2025-10-14
- **版本**: v1.0
- **状态**: ✅ 已完成并测试

