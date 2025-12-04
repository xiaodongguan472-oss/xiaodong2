#!/bin/bash

echo "========================================"
echo "📦 准备上传到 GitHub xiaodong2 仓库"
echo "========================================"

# 设置颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 git 是否可用
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git 未安装或 Xcode 命令行工具未完成安装${NC}"
    echo -e "${YELLOW}请运行: xcode-select --install${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Git 已就绪${NC}"

# 配置 Git 用户信息（如果未配置）
if [ -z "$(git config --global user.name)" ]; then
    echo -e "${YELLOW}请输入你的 GitHub 用户名:${NC}"
    read username
    git config --global user.name "$username"
    echo -e "${GREEN}✅ 已设置用户名: $username${NC}"
fi

if [ -z "$(git config --global user.email)" ]; then
    echo -e "${YELLOW}请输入你的 GitHub 邮箱:${NC}"
    read email
    git config --global user.email "$email"
    echo -e "${GREEN}✅ 已设置邮箱: $email${NC}"
fi

# 显示当前状态
echo ""
echo -e "${YELLOW}📊 当前 Git 状态:${NC}"
git status --short

# 添加所有更改
echo ""
echo -e "${GREEN}📝 添加所有更改...${NC}"
git add .

# 提交更改
echo ""
echo -e "${YELLOW}请输入提交信息 (默认: Update cursor-renewal-client):${NC}"
read commit_msg
if [ -z "$commit_msg" ]; then
    commit_msg="Update cursor-renewal-client"
fi

git commit -m "$commit_msg"

# 推送到 xiaodong2 仓库
echo ""
echo -e "${GREEN}🚀 推送到 xiaodong2 仓库...${NC}"
echo -e "${YELLOW}仓库地址: https://github.com/xiaodongguan472-oss/xiaodong2.git${NC}"

# 确保远程仓库配置正确
git remote set-url xiaodong2 https://github.com/xiaodongguan472-oss/xiaodong2.git

# 推送代码
if git push xiaodong2 main; then
    echo ""
    echo -e "${GREEN}✅ 成功上传到 GitHub!${NC}"
    echo -e "${GREEN}访问: https://github.com/xiaodongguan472-oss/xiaodong2${NC}"
    echo ""
    echo -e "${YELLOW}📦 GitHub Actions 构建说明:${NC}"
    echo "1. 访问: https://github.com/xiaodongguan472-oss/xiaodong2/actions"
    echo "2. 选择 'Build Cursor Renewal Client' 工作流程"
    echo "3. 点击 'Run workflow' 按钮开始构建"
    echo "4. 等待构建完成后下载产物"
else
    echo ""
    echo -e "${RED}❌ 推送失败${NC}"
    echo -e "${YELLOW}可能需要输入 GitHub 用户名和密码/令牌${NC}"
    echo -e "${YELLOW}建议使用 Personal Access Token 代替密码${NC}"
    echo "创建令牌: https://github.com/settings/tokens"
fi

echo ""
echo "========================================"
