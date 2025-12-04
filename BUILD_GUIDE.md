# 构建指南 - Cursor Renewal Client

## 📦 关于 better-sqlite3 原生模块

`better-sqlite3` 是一个原生模块，需要为每个平台单独编译。**不能**使用一个平台编译的二进制文件在其他平台上运行。

## 🚀 推荐构建方式

### 方案 1：GitHub Actions 自动构建（推荐）

1. **提交代码到 GitHub**
   ```bash
   git add .
   git commit -m "Update code"
   git push xiaodong2 main
   ```

2. **触发 GitHub Actions 构建**
   - 访问: https://github.com/xiaodongguan472-oss/xiaodong2/actions
   - 选择 "Build Cursor Renewal Client"
   - 点击 "Run workflow"
   - 等待构建完成（约 10-15 分钟）

3. **下载构建产物**
   - Windows: `.exe` 文件
   - macOS: `.dmg` 文件
   - Linux: `.AppImage` 文件

**优点：**
- ✅ 自动为每个平台正确编译
- ✅ 不需要本地配置环境
- ✅ 确保二进制文件兼容性

### 方案 2：本地构建

#### Windows 构建
```bash
# 安装依赖
npm install

# 重建原生模块
npm run postinstall

# 构建 Windows 应用
npm run build:win
```

**需要：**
- Node.js 18+
- Visual Studio 2022 或 Build Tools
- Python 3.x

#### macOS 构建
```bash
# 安装依赖
npm install

# 重建原生模块  
npm rebuild better-sqlite3

# 构建 macOS 应用
npm run build:mac
```

**需要：**
- Node.js 18+
- Xcode Command Line Tools

#### Linux 构建
```bash
# 安装依赖
npm install --ignore-scripts

# 重建原生模块
npm rebuild better-sqlite3

# 构建 Linux 应用
npm run build:linux
```

**需要：**
- Node.js 18+
- build-essential
- Python 3.x

## 🔧 处理 better-sqlite3 编译问题

### 常见问题

1. **Windows: 缺少编译工具**
   ```bash
   # 安装 windows-build-tools
   npm install --global windows-build-tools
   ```

2. **macOS: 缺少 Xcode Command Line Tools**
   ```bash
   xcode-select --install
   ```

3. **Linux: 缺少构建工具**
   ```bash
   sudo apt-get install build-essential python3
   ```

### 使用预编译二进制文件（可选）

如果编译失败，可以尝试下载预编译的二进制文件：

```bash
# 为 Electron 28 下载预编译版本
cd node_modules/better-sqlite3
npx prebuild-install --runtime=electron --target=28.0.0
```

## 📝 重要提示

### ⚠️ 不要做的事情：
- ❌ 不要将 Windows 编译的 `node_modules` 提交到 Git
- ❌ 不要将任何平台的 `.node` 文件提交到仓库
- ❌ 不要尝试在一个平台上为另一个平台编译

### ✅ 应该做的事情：
- ✅ 让 GitHub Actions 为每个平台自动编译
- ✅ 在 `.gitignore` 中排除 `node_modules` 和 `dist`
- ✅ 每个平台独立构建

## 🎯 最佳实践

1. **开发阶段**：在本地平台上开发和测试
2. **构建阶段**：使用 GitHub Actions 为所有平台构建
3. **发布阶段**：从 GitHub Actions 下载所有平台的构建产物

## 📊 构建矩阵

| 平台 | 运行环境 | Node ABI | Electron ABI | 架构 |
|------|---------|----------|--------------|------|
| Windows | windows-latest | 108 | 119 | x64 |
| macOS | macos-latest | 108 | 119 | x64/arm64 |
| Linux | ubuntu-latest | 108 | 119 | x64 |

## 🆘 需要帮助？

如果遇到构建问题：
1. 检查 GitHub Actions 日志
2. 确保所有依赖都是最新的
3. 查看 better-sqlite3 官方文档：https://github.com/WiseLibs/better-sqlite3
