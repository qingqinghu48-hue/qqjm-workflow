// 每日流水线：读取内容 → 套用 SVG 模板 → 渲染 PNG → 输出到 outputs/日期/
const fs = require("fs");
const path = require("path");

const APP_DIR = path.join(__dirname, "..");
const OUTPUT_DIR = path.join(APP_DIR, "outputs");
const CONFIG_FILE = path.join(APP_DIR, "config.json");

let sharp;
try {
  sharp = require(path.join(APP_DIR, "node_modules", "sharp"));
} catch (e) {
  // 本地开发/测试时可通过 NODE_PATH 指向环境内置 sharp
  sharp = require("sharp");
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch (e) {
    return { brand: { theme: "dark" } };
  }
}

function loadContent() {
  const custom = path.join(__dirname, "content.json");
  const example = path.join(__dirname, "content.example.json");
  const src = fs.existsSync(custom) ? custom : example;
  const raw = JSON.parse(fs.readFileSync(src, "utf-8"));
  // 日期/期数默认用当天
  if (!raw.date) raw.date = today();
  if (!raw.issue) raw.issue = 1;
  return { src, raw };
}

function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function main() {
  const cfg = loadConfig();
  const { src, raw: c } = loadContent();
  const theme = (cfg.brand && cfg.brand.theme) || "dark";
  const templateName = (cfg.pipeline && cfg.pipeline.template) || `cover_template_${theme}.svg`;
  const templatePath = path.join(APP_DIR, "templates", templateName);

  if (!fs.existsSync(templatePath)) {
    console.error(`模板不存在: ${templatePath}`);
    process.exit(1);
  }

  let svg = fs.readFileSync(templatePath, "utf-8");

  // 模板文本替换（与 SVG 模板中的占位文案一一对应）
  const replace = (from, to) => {
    if (to === undefined || to === null || to === "") return;
    svg = svg.split(from).join(escapeXml(String(to)));
  };
  replace("加盟圈今日大事件", c.title1);
  replace("这 3 条值得关注", c.title2);
  replace("每天 10:00 · 聊聊加盟圈那点事", c.subtitle);
  replace("2026.08.08 · 第01期", `${c.date} · 第${c.issue}期`);
  replace("#加盟 #连锁加盟 #创业日记", c.tags);

  const defaults = [
    ["今日重磅", "某头部品牌宣布开放全国加盟"],
    ["行业动态", "加盟新规落地，合同条款有变化"],
    ["避坑提醒", "这 3 类加盟项目最近别碰"],
  ];
  for (let i = 0; i < 3; i++) {
    const item = c.items && c.items[i];
    if (!item) continue;
    replace(defaults[i][0], item.head);
    replace(defaults[i][1], item.body);
  }

  const dayDir = path.join(OUTPUT_DIR, c.date);
  fs.mkdirSync(dayDir, { recursive: true });

  const svgOut = path.join(dayDir, "01_封面.svg");
  const pngOut = path.join(dayDir, "01_封面.png");
  fs.writeFileSync(svgOut, svg, "utf-8");

  const width = (cfg.pipeline && cfg.pipeline.width) || 1080;
  const height = (cfg.pipeline && cfg.pipeline.height) || 1440;
  await sharp(svgOut).resize(width, height, { fit: "fill" }).png().toFile(pngOut);

  const manifest = {
    date: c.date,
    issue: c.issue,
    contentSource: src,
    template: templateName,
    generatedAt: new Date().toISOString(),
    files: ["01_封面.svg", "01_封面.png"],
  };
  fs.writeFileSync(path.join(dayDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

  console.log(`[pipeline] OK ${c.date} issue=${c.issue} → ${pngOut}`);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((e) => {
  console.error("[pipeline] FAIL:", e.message);
  process.exit(1);
});
