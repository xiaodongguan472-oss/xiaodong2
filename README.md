# Kiro 续杯客户端

## 项目结构

```
cursor-renewal-client/
├── main.js                 # Electron 主进程
├── index.html              # 前端页面 (Vue 3 + Element Plus)
├── kiro-auth.js            # Kiro 认证模块
├── regedit-utils.js        # 注册表工具
├── file-permission-utils.js # 文件权限工具
├── package.json            # 项目配置
├── assets/                 # 静态资源（图标等）
├── scripts/                # 构建脚本
└── dist/                   # 构建输出目录
```

## 开发

```bash
# 安装依赖
npm install

# 启动开发模式
npm run dev

# 构建 Windows 版本
npm run build:win
```

## 技术栈

- **Electron**: 桌面应用框架
- **Vue 3**: 前端框架
- **Element Plus**: UI 组件库
- **better-sqlite3**: SQLite 数据库
- **win-dpapi**: Windows 数据保护 API
