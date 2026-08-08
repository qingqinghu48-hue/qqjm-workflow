// 清清聊加盟 · 工作流服务器
// 纯 Node 实现：静态面板 + 配置 API + 产物 API + 每日定时流水线
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const APP_DIR = __dirname;
const PANEL_DIR = path.join(APP_DIR, "panel");
const PIPELINE_DIR = path.join(APP_DIR, "pipeline");
const OUTPUT_DIR = path.join(APP_DIR, "outputs");
const CONFIG_FILE = path.join(APP_DIR, "config.json");
const PORT = process.env.PORT || 8080;

const DEFAULT_CONFIG = {
  brand: {
    accountName: "清清聊加盟",
    slogan: "每天 10:00 · 聊聊加盟圈那点事",
    theme: "dark",
    primaryColor: "#ff8c42",
  },
  schedule: {
    collectTime: "09:00",
    deliverTime: "10:00",
  },
  pipeline: {
    template: "cover_template_dark.svg",
    width: 1080,
    height: 1440,
  },
};

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed,
      brand: { ...DEFAULT_CONFIG.brand, ...(parsed.brand || {}) },
      schedule: { ...DEFAULT_CONFIG.schedule, ...(parsed.schedule || {}) },
      pipeline: { ...DEFAULT_CONFIG.pipeline, ...(parsed.pipeline || {}) },
    };
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8");
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function timeNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function listOutputs() {
  if (!fs.existsSync(OUTPUT_DIR)) return [];
  return fs.readdirSync(OUTPUT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({
      date: e.name,
      files: fs.readdirSync(path.join(OUTPUT_DIR, e.name)),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function runPipeline(cb) {
  const script = path.join(PIPELINE_DIR, "run_pipeline.js");
  const child = spawn(process.execPath, [script], {
    cwd: PIPELINE_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d.toString()));
  child.stderr.on("data", (d) => (log += d.toString()));
  child.on("close", (code) => cb && cb(code, log));
  return child;
}

let lastRun = { at: null, code: null, log: "" };
let running = false;

function maybeSchedule() {
  const cfg = loadConfig();
  const now = timeNow();
  if (now < cfg.schedule.deliverTime) return; // 未到出稿时间
  const dayDir = path.join(OUTPUT_DIR, today());
  if (fs.existsSync(dayDir)) return; // 今天已产出
  if (running) return;
  running = true;
  lastRun.at = new Date().toISOString();
  runPipeline((code, log) => {
    running = false;
    lastRun.code = code;
    lastRun.log = log.slice(-2000);
    try {
      fs.mkdirSync(path.join(APP_DIR, "logs"), { recursive: true });
      fs.appendFileSync(
        path.join(APP_DIR, "logs", "pipeline.log"),
        `[${new Date().toISOString()}] code=${code}\n${log}\n`
      );
    } catch (e) {}
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}

function serveStatic(res, urlPath) {
  let rel = decodeURIComponent(urlPath.replace(/^\/+/, ""));
  if (rel === "") rel = "index.html";
  const filePath = path.normalize(path.join(PANEL_DIR, rel));
  if (!filePath.startsWith(PANEL_DIR)) {
    res.writeHead(403); res.end("Forbidden");
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) {
      sendFile(res, path.join(filePath, "index.html"));
    } else {
      sendFile(res, filePath);
    }
  });
}

function readBody(req, cb) {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => cb(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  if (p === "/api/config" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(loadConfig(), null, 2));
    return;
  }
  if (p === "/api/config" && req.method === "POST") {
    readBody(req, (body) => {
      try {
        const cfg = JSON.parse(body);
        saveConfig(cfg);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, config: loadConfig() }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "JSON 格式错误" }));
      }
    });
    return;
  }
  if (p === "/api/outputs" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(listOutputs()));
    return;
  }
  if (p === "/api/run" && req.method === "POST") {
    if (running) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, running: true }));
      return;
    }
    running = true;
    lastRun.at = new Date().toISOString();
    runPipeline((code, log) => {
      running = false;
      lastRun.code = code;
      lastRun.log = log.slice(-2000);
    });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, running: true }));
    return;
  }
  if (p === "/api/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      now: timeNow(),
      today: today(),
      running,
      lastRun,
      outputs: listOutputs(),
    }));
    return;
  }
  if (p.startsWith("/outputs/")) {
    const rel = decodeURIComponent(p.replace(/^\/outputs\//, ""));
    const filePath = path.normalize(path.join(OUTPUT_DIR, rel));
    if (!filePath.startsWith(OUTPUT_DIR)) {
      res.writeHead(403); res.end("Forbidden");
      return;
    }
    sendFile(res, filePath);
    return;
  }

  serveStatic(res, p);
});

server.listen(PORT, () => {
  console.log(`[qqjm] server running at http://0.0.0.0:${PORT}`);
  console.log(`[qqjm] panel: ${PANEL_DIR}`);
  console.log(`[qqjm] outputs: ${OUTPUT_DIR}`);
});

// 定时调度：每 30 秒检查一次是否到出稿时间
setInterval(maybeSchedule, 30 * 1000);
