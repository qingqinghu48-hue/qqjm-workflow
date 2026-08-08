#!/usr/bin/env bash
# 清清聊加盟 · 工作流服务器一键部署脚本（Ubuntu/CentOS/Alibaba Cloud Linux）
set -e

APP_DIR="/opt/qqjm"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> 1/4 检查 Node.js"
if ! command -v node >/dev/null 2>&1; then
  echo "==> 未安装 Node.js，开始安装"
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
  elif command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    yum install -y nodejs
  else
    echo "无法自动安装 Node.js，请手动安装后重试"
    exit 1
  fi
fi
node -v

echo "==> 2/4 部署文件到 $APP_DIR"
mkdir -p "$APP_DIR"
cp -r "$SRC_DIR/panel" "$APP_DIR/"
cp -r "$SRC_DIR/pipeline" "$APP_DIR/"
cp "$SRC_DIR/server.js" "$APP_DIR/"
cp -r "$SRC_DIR/templates" "$APP_DIR/"
cp "$SRC_DIR/config.example.json" "$APP_DIR/config.json"

echo "==> 3/4 安装渲染依赖（sharp）"
cd "$APP_DIR"
[ -f package.json ] || npm init -y
npm install sharp --no-audit --no-fund

echo "==> 4/4 注册 systemd 服务"
cat > /etc/systemd/system/qqjm.service <<EOF
[Unit]
Description=QingQing JiaMeng Workflow Server
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=5
Environment=PORT=8080

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable qqjm
systemctl restart qqjm

IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "<公网IP>")
echo ""
echo "=============================================="
echo "部署完成！访问：http://$IP:8080"
echo "日志：journalctl -u qqjm -f"
echo "手动触发出图：curl -X POST http://127.0.0.1:8080/api/run"
echo "=============================================="
