#!/usr/bin/env bash
# 服务器首次安装：从 GitHub 拉取代码 + 安装依赖 + 注册服务
# 用法一（已手动 clone）：cd /opt/qqjm && bash first_setup.sh
# 用法二（未 clone）：sudo GIT_REPO=https://github.com/qingqinghu48-hue/qqjm-workflow.git bash first_setup.sh
set -e

APP_DIR="/opt/qqjm"
GIT_REPO="${GIT_REPO:-}"

echo "==> 1/5 检查基础环境"
if ! command -v git >/dev/null 2>&1; then
  echo "==> 安装 git"
  if command -v dnf >/dev/null 2>&1; then dnf install -y git
  elif command -v yum >/dev/null 2>&1; then yum install -y git
  else apt-get install -y git; fi
fi
if ! command -v node >/dev/null 2>&1; then
  echo "==> 安装 Node.js"
  if command -v dnf >/dev/null 2>&1; then
    dnf module enable -y nodejs:18 || true
    dnf install -y nodejs || dnf install -y nodejs npm
  elif command -v yum >/dev/null 2>&1; then
    yum module enable -y nodejs:18 || true
    yum install -y nodejs || yum install -y nodejs npm
  else
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
  fi
fi
command -v node >/dev/null 2>&1 || { echo "Node.js 安装失败，请手动安装后重试"; exit 1; }
node -v

echo "==> 2/5 拉取代码到 $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  if [ -z "$GIT_REPO" ]; then
    echo "未检测到 $APP_DIR 下的代码，请先执行："
    echo "  sudo git clone https://github.com/qingqinghu48-hue/qqjm-workflow.git $APP_DIR"
    exit 1
  fi
  git clone "$GIT_REPO" "$APP_DIR"
else
  cd "$APP_DIR" && git pull origin main
fi

echo "==> 3/5 安装渲染依赖（sharp）"
cd "$APP_DIR"
[ -f package.json ] || npm init -y
npm install sharp --no-audit --no-fund --registry=https://registry.npmmirror.com

echo "==> 4/5 生成 config.json（首次）"
[ -f "$APP_DIR/config.json" ] || cp "$APP_DIR/config.example.json" "$APP_DIR/config.json"

echo "==> 5/5 注册 systemd 服务"
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
systemctl status qqjm --no-pager || true

echo ""
echo "=============================================="
echo "部署完成！服务已启动。"
echo "本机测试：curl http://127.0.0.1:8080/api/status"
echo "公网访问：http://<公网IP>:8080（记得在安全组放行 8080）"
echo "以后每次修改只需 git push，GitHub Actions 会自动同步"
echo "=============================================="
