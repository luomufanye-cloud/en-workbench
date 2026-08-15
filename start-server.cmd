@echo off
rem 英语学习工作台 · 局域网服务器启动脚本（双击运行）
rem 手机连同一 WiFi 后访问 http://电脑IP:8866
cd /d "%~dp0"
python -m http.server 8866 --bind 0.0.0.0
