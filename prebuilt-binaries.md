# 预编译二进制文件方案

## 如果你想预编译 better-sqlite3

### 目录结构：
```
cursor-renewal-client/
├── prebuilt/
│   ├── win32-x64/
│   │   └── better_sqlite3.node  (Windows 编译的)
│   ├── darwin-x64/
│   │   └── better_sqlite3.node  (Intel Mac 编译的)
│   ├── darwin-arm64/
│   │   └── better_sqlite3.node  (M1/M2 Mac 编译的)
│   └── linux-x64/
│       └── better_sqlite3.node  (Linux 编译的)
└── scripts/
    └── copy-prebuilt.js
```

### 步骤：

1. **在 Windows 上编译**：
```bash
npm install better-sqlite3
# 找到编译好的文件：
# node_modules/better-sqlite3/build/Release/better_sqlite3.node
# 复制到 prebuilt/win32-x64/
```

2. **创建复制脚本** `scripts/copy-prebuilt.js`：
```javascript
const fs = require('fs');
const path = require('path');

const platform = process.platform;
const arch = process.arch;
const prebuiltPath = path.join(__dirname, '..', 'prebuilt', `${platform}-${arch}`, 'better_sqlite3.node');
const targetPath = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');

if (fs.existsSync(prebuiltPath)) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(prebuiltPath, targetPath);
    console.log(`✅ 使用预编译的 better-sqlite3: ${platform}-${arch}`);
} else {
    console.log(`⚠️ 未找到预编译文件，将使用标准编译流程`);
}
```

3. **修改 package.json**：
```json
{
  "scripts": {
    "postinstall": "node scripts/copy-prebuilt.js || electron-rebuild"
  }
}
```

### 这样的好处：
- ✅ Windows 构建可以使用你预编译的版本
- ✅ 其他平台如果没有预编译文件，会自动编译
- ✅ 所有编译好的二进制文件都在版本控制中

### 但是注意：
- 📦 会增加仓库大小（每个 .node 文件约 5-10MB）
- 🔄 需要为每个平台预编译
- 📌 需要确保 Node.js 和 Electron 版本匹配
