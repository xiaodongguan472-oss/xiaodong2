# Cursor续杯工具

一款基于Electron+Vue和SpringBoot的Cursor AI编辑器续期工具，用于替代原有的Python和PHP实现。

## 项目架构

本项目采用前后端分离架构：

### 后端部分 (SpringBoot)

- **实体类**：
  - `CardKey`：卡密信息
  - `DeviceBinding`：设备绑定信息
  - `CursorAccount`：账号信息

- **数据库**：使用MySQL或H2数据库存储卡密、设备绑定和账号信息

- **主要功能**：
  - 卡密验证
  - 设备绑定管理（每个卡密最多5台设备）
  - 生成授权Token

### 前端部分 (Electron + Vue)

- **技术栈**：
  - Electron：跨平台桌面应用框架
  - Vue.js：前端界面
  - Element Plus：UI组件库

- **主要功能**：
  - 验证卡密
  - 一键续杯（修改Cursor的关键文件）
  - 重启Cursor应用

## 功能说明

### 卡密验证和续期

1. 根据卡密类型设置不同有效期：
   - 日卡：1天
   - 周卡：7天
   - 月卡：31天

2. 设备绑定限制：
   - 每个卡密最多绑定5台设备
   - 超出限制后，需要解绑或使用新卡密

### 一键续杯实现原理

1. **修改Cursor认证信息**：
   - 在用户配置目录创建或修改`cursor-auth.json`文件
   - 写入有效的access_token和refresh_token

2. **修改getMachineId函数**：
   - 修改Cursor的`main.js`文件中的`getMachineId`和`getMacMachineId`函数
   - 绕过Cursor的机器ID校验机制

3. **修改专业版权限**：
   - 修改`workbench.desktop.main.js`文件中的关键函数
   - 设置专业版状态为true
   - 设置使用天数

4. **重置设备标识**：
   - 删除Cursor存储的机器ID文件
   - 清除设备绑定信息

5. **重启Cursor应用**：
   - 自动重启Cursor以应用所有修改

## 使用方法

### 服务端部署

1. 确保已安装Java 8或更高版本
2. 创建MySQL数据库并导入提供的SQL脚本
3. 修改`application.properties`中的数据库连接信息
4. 运行SpringBoot应用：
   ```
   ./mvnw spring-boot:run
   ```

### 客户端使用

1. 运行Electron客户端应用：
   ```
   npm start
   ```

2. 在界面中输入卡密点击"一键续杯"

3. 验证成功后，点击"应用设置并重启Cursor"

4. 等待程序完成以下步骤：
   - 获取Cursor安装路径
   - 修改Cursor认证信息
   - 修改getMachineId函数
   - 修改专业版权限
   - 重置设备标识
   - 重启Cursor应用

5. 所有步骤完成后，Cursor将自动重启并应用新的设置

## 开发指南

### 开发环境设置

1. **后端**：
   ```
   cd 后端目录
   ./mvnw spring-boot:run -Dspring.profiles.active=dev
   ```

2. **前端**：
   ```
   cd 新开发的项目/electron/cursor-renewal-client
   npm install
   npm run dev
   ```

### 编译打包

1. **Windows**:
   ```
   npm run build:win
   ```

2. **macOS**:
   ```
   npm run build:mac
   ```

3. **Linux**:
   ```
   npm run build:linux
   ```

编译后的安装包将位于`dist`目录下。

## 常见问题

1. **缓存权限错误**：
   - 问题：启动应用时出现缓存权限错误
   - 解决方案：应用已设置自定义缓存路径和禁用GPU加速，这应该可以解决大多数权限相关问题

2. **无法找到Cursor**：
   - 问题：应用无法找到Cursor安装路径
   - 解决方案：确保Cursor已正确安装在默认位置，或手动指定Cursor安装路径

3. **修改文件失败**：
   - 问题：无法修改Cursor的关键文件
   - 解决方案：请确保应用有足够的权限，可能需要以管理员身份运行

## 版本更新

### v1.0.0
- 初始版本发布
- 实现基本的卡密验证和一键续杯功能
- 支持设备绑定限制
- 自动应用设置并重启Cursor

## 注意事项

- 本工具仅供学习和研究使用
- 请尊重软件版权，支持正版软件
- 使用前请备份重要数据，以防意外情况 