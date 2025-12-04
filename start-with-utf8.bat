@echo off
echo 正在设置UTF-8编码...
chcp 65001 >nul
echo UTF-8编码设置完成

echo 正在启动Cursor续杯工具...
set NODE_OPTIONS=--max-old-space-size=4096
npm start

pause
