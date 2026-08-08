# 清清聊加盟 · 工作流网站部署包

把「清清聊加盟」工作流部署到阿里云服务器的完整方案。

> 部署链路：本地修改 → git push 到 GitHub → GitHub Actions 自动同步到阿里云服务器
>
> **部署状态：已上线**（2026-08-08 · 服务器 47.116.116.67:8080）

## 一、架构

```text
浏览器访问
   │
   ▼
Nginx（80 端口，可选）
   │
   ▼
Node 服务（server.js，端口 8080）
   ├── 面板静态页面（panel/）
   ├── 配置接口  GET/PUT /api/config
   ├── 产物接口  GET /api/outputs
   ├── 手动触发  POST /api/run
   └── 定时调度：每天到点自动跑流水线
            │
            ▼
   pipeline/run_pipeline.js（渲染脚本）
   ├── 读取 config.json（配色/模板）
   ├── 读取 content.json（当日选题文案）
   ├── 套入 SVG 模板 → outputs/日期/封面.svg
   └── sharp 渲染 → outputs/日期/封面.png
```

## 二、服务器要求

- Linux（Ubuntu 20.04+ / CentOS 7+ / Alibaba Cloud Linux 均可）
- Node.js 16+（install.sh 会自动安装）
- 内存 1GB 以上即可，无特殊性能要求

## 三、快速部署（一键脚本）

### 首次部署（服务器上执行一次）

在服务器上执行（把 `<用户名>/<仓库名>` 换成你的 GitHub 仓库）：

```bash
sudo GIT_REPO=https://github.com/<用户名>/<仓库名>.git bash first_setup.sh
```

脚本完成：拉取代码 → 安装 Node 依赖 → 生成配置 → 注册 systemd 服务（开机自启 + 崩溃自动重启）。

之后每次在本地修改并 push，GitHub Actions 会自动在服务器上 `git pull` 并重启服务，
无需再手动操作。

### 手动上传部署（无 GitHub 时）

把整个 `deploy` 目录上传到服务器任意位置，然后执行：

```bash
chmod +x install.sh
sudo ./install.sh
```

脚本会完成：安装 Node → 安装渲染依赖 sharp → 部署到 `/opt/qqjm` →
注册 systemd 服务（开机自启 + 崩溃自动重启）→ 启动服务。

完成后访问：`http://<服务器公网IP>:8080`

## 九、本地编辑与推送（日常使用）

以后所有源文件都在本仓库里编辑：

```text
deploy/
├── panel/index.html        ← 工作流面板（改这里）
├── templates/*.svg         ← 海报模板（改这里）
├── pipeline/               ← 每日渲染流水线
├── config.example.json     ← 默认配置
└── .github/workflows/      ← 自动部署
```

推送：

```powershell
.\push.ps1 -m "修改了封面配色"    # 提交并推送一次
.\push.ps1 -watch                # 监听模式：改完自动推
```

## 十、GitHub Actions 需要配置的 Secrets

在 GitHub 仓库 → Settings → Secrets and variables → Actions 中配置：

| Secret | 值 |
| --- | --- |
| `DEPLOY_HOST` | 服务器公网 IP |
| `DEPLOY_USER` | SSH 用户名（通常 root） |
| `DEPLOY_KEY` | 服务器 SSH 私钥（登录服务器的密钥） |

## 四、手动部署（宝塔 / 已有环境）

1. 安装 Node.js 16+：
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
2. 把 `panel/`、`pipeline/`、`server.js`、`config.json` 放到同一目录（如 `/opt/qqjm`）
3. 安装渲染依赖：
   ```bash
   cd /opt/qqjm && npm init -y && npm install sharp
   ```
4. 启动：
   ```bash
   nohup node server.js > server.log 2>&1 &
   ```
5. （推荐）配置 Nginx 反代 80 端口，见 `nginx.conf.example`

## 五、配置说明

### config.json（服务器端，也可通过面板修改）

```json
{
  "brand": {
    "accountName": "清清聊加盟",
    "theme": "dark",
    "primaryColor": "#ff8c42"
  },
  "schedule": {
    "collectTime": "09:00",
    "deliverTime": "10:00"
  },
  "pipeline": {
    "template": "cover_template_dark.svg"
  }
}
```

### content.json（每日内容，流水线读取）

每天到点后，`run_pipeline.js` 会读取 `pipeline/content.json`，如果没有则使用
`content.example.json` 自动生成占位内容。正式接入采集后，由采集程序每天
写入真实选题文案。

## 六、每日自动运行

- `collectTime`：采集时间（当前为占位，接入数据源后启用）
- `deliverTime`：出稿时间，服务会每天到点自动渲染当天产物（当天已产出则跳过）
- 手动触发：`POST /api/run`
- 查看产物：`GET /api/outputs`，或直接访问 `outputs/日期/` 目录下的文件

## 七、接入真实采集（下一步）

当前「采集」环节在服务器上需要接入真实数据源后才能全自动。可选方案：

1. **RSS 订阅**：订阅行业媒体 RSS（红餐网、联商网等），每天定时拉取
2. **搜索 API**：接入第三方搜索/资讯接口（需 API Key）
3. **AI 选题**：把当天采集的原始素材交给 AI 生成选题和文案
4. **半自动**：你先人工供稿（每天填 content.json），服务器负责自动出图

确定数据源方案后，我会把它接入流水线。

## 八、安全提示

- 建议配置 Nginx + HTTPS（域名需备案）
- `/api/config` 目前无鉴权，内网使用可接受；公网建议加简单 Token
