// 多阶段工作流：采集 → 选题 → 创作 → 出图 → 交付
// 每个阶段产出独立 JSON 到 outputs/<日期>/steps/，并更新 progress.json 供前端轮询
const fs = require("fs");
const path = require("path");

const APP_DIR = path.join(__dirname, "..");
const OUTPUT_DIR = path.join(APP_DIR, "outputs");
const CONFIG_FILE = path.join(APP_DIR, "config.json");
const CONTENT_FILE = path.join(__dirname, "content.json");
const CONTENT_EXAMPLE = path.join(__dirname, "content.example.json");

let sharp;
try {
  sharp = require(path.join(APP_DIR, "node_modules", "sharp"));
} catch (e) {
  sharp = require("sharp");
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")); }
  catch (e) { return { brand: { theme: "dark" } }; }
}

function loadContent() {
  const src = fs.existsSync(CONTENT_FILE) ? CONTENT_FILE : CONTENT_EXAMPLE;
  const raw = JSON.parse(fs.readFileSync(src, "utf-8"));
  if (!raw.date) raw.date = today();
  if (!raw.issue) raw.issue = 1;
  return { src, raw };
}

function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- 阶段基建 ----------
const runId = `${today().replace(/-/g, "")}-${new Date().getHours()}${String(new Date().getMinutes()).padStart(2, "0")}`;
let date = today();
let dayDir, stepsDir, progressFile;

function initDirs() {
  dayDir = path.join(OUTPUT_DIR, date);
  stepsDir = path.join(dayDir, "steps");
  progressFile = path.join(dayDir, "progress.json");
  fs.mkdirSync(stepsDir, { recursive: true });
}

const progress = {
  runId,
  date,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  current: null,
  steps: {},
};

function saveProgress() {
  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2), "utf-8");
}

function begin(name) {
  progress.current = name;
  progress.steps[name] = { status: "running", at: new Date().toISOString(), output: `steps/${name}.json` };
  saveProgress();
  console.log(`[workflow] ▶ ${name}`);
}

function end(name, payload) {
  fs.writeFileSync(path.join(stepsDir, `${name}.json`), JSON.stringify(payload, null, 2), "utf-8");
  progress.steps[name] = { status: "done", at: new Date().toISOString(), output: `steps/${name}.json` };
  saveProgress();
  console.log(`[workflow] ✔ ${name}`);
}

function fail(name, e) {
  progress.steps[name] = { status: "failed", at: new Date().toISOString(), error: String(e.message || e) };
  progress.current = name;
  progress.finishedAt = new Date().toISOString();
  saveProgress();
  console.error(`[workflow] ✘ ${name}: ${e.message}`);
}

// ---------- 01 采集 ----------
function stepCollect(content) {
  begin("collect");
  const sample = [
    { title: "某头部茶饮品牌宣布开放区域加盟，首批 200 个名额", source: "红餐网", time: "08:40", url: "#", summary: "品牌方表示将优先选择有餐饮经验的创业者，加盟门槛约 30 万起。" },
    { title: "新版商业特许经营备案流程上线，材料减少三分之一", source: "市场监管总局", time: "08:12", url: "#", summary: "备案系统升级后全流程线上办理，平均办理时长缩短至 10 个工作日。" },
    { title: "烘焙加盟赛道观察：三四线县城店坪效逆势上涨", source: "联商网", time: "07:55", url: "#", summary: "多家烘焙品牌下沉县城后，凭借低房租与刚需属性实现盈利模型跑通。" },
    { title: "市场监管总局提示：警惕'0元加盟'类骗局，注意核实资质", source: "官方发布", time: "07:20", url: "#", summary: "以'0加盟费'为噱头的项目需重点核查特许经营备案与合同条款。" },
  ];
  const edited = content.collect && content.collect.items && content.collect.items.length;
  const items = edited ? content.collect.items : sample;
  const payload = {
    note: edited ? "素材来源：你在「采集」页面编辑的内容" : "示例素材（到「采集」页面编辑关键词与素材）",
    keywords: (content.collect && content.collect.keywords) || ["加盟", "连锁加盟", "招商加盟"],
    items,
    count: items.length,
  };
  end("collect", payload);
  return payload;
}

// ---------- 02 选题 ----------
function stepSelect(content, collect) {
  begin("select");
  const payload = (content.select && content.select.main)
    ? {
        main: content.select.main,
        backups: content.select.backups || [],
        note: "内容来源：你在「选题」页面编辑的内容",
      }
    : {
        main: {
          title: collect.items[0].title,
          angle: "从加盟政策与品牌动向看今日加盟圈两大信号",
          reason: "头部品牌开放加盟 + 官方流程优化，是加盟人群最关心的两类信息，决策价值高。",
        },
        backups: [
          { title: collect.items[2].title, reason: "烘焙下沉趋势属于高关注度赛道话题，易引发讨论。" },
          { title: collect.items[3].title, reason: "避坑内容天然高收藏，适合作为备选。" },
        ],
        note: "自动选题（可在「选题」页面调整）",
      };
  end("select", payload);
  return payload;
}

// ---------- 03 创作 ----------
function stepCreate(content, collect) {
  begin("create");
  let payload;
  if (content.create && content.create.title && content.create.body) {
    payload = {
      title: content.create.title,
      subtitle: content.subtitle,
      body: content.create.body,
      emoji: true,
      tags: content.tags || "#加盟 #连锁加盟 #创业日记",
      pages: content.create.pages || [],
      note: "内容来源：你在「创作」页面编辑的内容",
    };
  } else {
    const items = (content.items && content.items.length === 3)
      ? content.items
      : collect.items.slice(0, 3).map((it, i) => ({ head: ["今日重磅", "行业动态", "避坑提醒"][i], body: it.title }));
    const title = `${content.title1}｜${content.title2}`;
    const body = `${content.title1}，${content.title2}。\n\n今天加盟圈有这些值得关注👇\n\n` +
      items.map((it, i) => `${"①②③"[i]} ${it.head}：${it.body}`).join("\n\n") +
      `\n\n你觉得哪条信息最有用？评论区聊聊～\n\n${content.tags || "#加盟 #连锁加盟 #创业日记"}`;
    payload = {
      title,
      subtitle: content.subtitle,
      body,
      emoji: true,
      tags: content.tags || "#加盟 #连锁加盟 #创业日记",
      pages: [
        { page: "01_封面", copy: title },
        ...items.map((it, i) => ({ page: `0${i + 2}_${it.head}`, copy: `${it.head}：${it.body}` })),
      ],
      note: "自动创作（可在「创作」页面调整）",
    };
  }
  fs.writeFileSync(path.join(dayDir, "文案.md"), `# ${payload.title}\n\n${payload.body}\n`, "utf-8");
  end("create", payload);
  return payload;
}

// ---------- 04 出图 ----------
async function stepDesign(content) {
  begin("design");
  const cfg = loadConfig();
  const theme = (cfg.brand && cfg.brand.theme) || "dark";
  const templateName = (cfg.pipeline && cfg.pipeline.template) || `cover_template_${theme}.svg`;
  const templatePath = path.join(APP_DIR, "templates", templateName);
  if (!fs.existsSync(templatePath)) throw new Error(`模板不存在: ${templatePath}`);

  let svg = fs.readFileSync(templatePath, "utf-8");
  const replace = (from, to) => {
    if (to === undefined || to === null || to === "") return;
    svg = svg.split(from).join(escapeXml(String(to)));
  };
  replace("加盟圈今日大事件", content.title1);
  replace("这 3 条值得关注", content.title2);
  replace("每天 10:00 · 聊聊加盟圈那点事", content.subtitle);
  replace("2026.08.08 · 第01期", `${content.date} · 第${content.issue}期`);
  replace("#加盟 #连锁加盟 #创业日记", content.tags);
  const defaults = [
    ["今日重磅", "某头部品牌宣布开放全国加盟"],
    ["行业动态", "加盟新规落地，合同条款有变化"],
    ["避坑提醒", "这 3 类加盟项目最近别碰"],
  ];
  for (let i = 0; i < 3; i++) {
    const item = content.items && content.items[i];
    if (!item) continue;
    replace(defaults[i][0], item.head);
    replace(defaults[i][1], item.body);
  }

  const svgOut = path.join(dayDir, "01_封面.svg");
  const pngOut = path.join(dayDir, "01_封面.png");
  fs.writeFileSync(svgOut, svg, "utf-8");
  const width = (cfg.pipeline && cfg.pipeline.width) || 1080;
  const height = (cfg.pipeline && cfg.pipeline.height) || 1440;
  await sharp(svgOut).resize(width, height, { fit: "fill" }).png().toFile(pngOut);

  const payload = {
    template: templateName,
    width, height,
    images: ["01_封面.png", "01_封面.svg"],
  };
  end("design", payload);
  return payload;
}

// ---------- 05 交付 ----------
function stepDeliver(create) {
  begin("deliver");
  const manifest = {
    runId,
    date,
    title: create.title,
    generatedAt: new Date().toISOString(),
    files: ["01_封面.png", "01_封面.svg", "文案.md", ...Object.keys(progress.steps).map((k) => `steps/${k}.json`)],
  };
  fs.writeFileSync(path.join(dayDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  const payload = {
    outputDir: `outputs/${date}/`,
    files: manifest.files,
    note: "图片可直接上传小红书；文案可复制使用。",
  };
  end("deliver", payload);
  return payload;
}

// ---------- 主流程 ----------
async function main() {
  initDirs();
  saveProgress();
  const content = loadContent().raw;
  const collect = stepCollect(content);
  const select = stepSelect(content, collect);
  const create = stepCreate(content, collect);
  await stepDesign(content);
  const deliver = stepDeliver(create);
  progress.current = null;
  progress.finishedAt = new Date().toISOString();
  saveProgress();
  console.log(`[workflow] ALL DONE → outputs/${date}/`);
  console.log(JSON.stringify(deliver));
}

main().catch((e) => {
  fail(progress.current || "unknown", e);
  process.exit(1);
});
