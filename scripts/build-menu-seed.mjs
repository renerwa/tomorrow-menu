import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "docs/menus/2026-10-27-sichuan-family-dinner-menu-library.md");
const outputPath = path.join(root, "src/data/menu-library.json");
const markdown = fs.readFileSync(sourcePath, "utf8");
const lines = markdown.split(/\r?\n/);

const proteinByHeading = {
  猪肉: "pork",
  牛肉: "beef",
  鸡肉: "chicken",
  蛋类: "egg",
  鱼类: "fish",
  虾类: "shrimp",
  兔肉: "rabbit",
  素汤: "none",
  蛋汤: "egg",
  猪肉汤: "pork"
};

const waterProtein = { 牛蛙: "frog", 鱿鱼: "squid", 蟹: "crab", 小龙虾: "crayfish" };
const soupProtein = { 牛肉: "beef", 鸡肉: "chicken", 鱼: "fish", 羊肉: "lamb" };

const readyNames = [
  "回锅肉", "青椒肉丝", "鱼香肉丝", "水煮肉片", "红烧肉", "糖醋排骨", "蚂蚁上树",
  "小炒黄牛肉", "仔姜牛肉", "番茄牛腩", "土豆烧牛腩",
  "宫保鸡丁", "辣子鸡", "可乐鸡翅",
  "番茄炒蛋", "韭菜炒鸡蛋",
  "红烧小黄鱼", "酸菜黑鱼", "水煮鱼片", "宫保虾球",
  "干煸四季豆", "麻辣豆腐", "蒜蓉生菜", "藤藤菜（空心菜）", "清炒茼蒿", "酸辣土豆丝",
  "鱼香茄子", "清炒山药片", "蒜泥黄瓜", "西蓝花", "清炒藕丁", "凉拌三丝",
  "冬瓜玉米汤", "番茄蛋汤", "紫菜蛋汤", "玉米山药排骨汤", "酸汤肥牛", "鲫鱼汤"
];

function normalizeName(value) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s()（）·、，,。.\-—_/]/g, "");
}

function classify(name) {
  let spiceLevel = 0;
  if (/麻辣|水煮|香辣|辣子|泡椒|剁椒|鲜椒|辣炒|酸辣|干煸|干锅|鱼香|爆炒/.test(name)) spiceLevel = 2;
  else if (/辣|椒|姜|回锅|宫保|豆瓣|咖喱|孜然/.test(name)) spiceLevel = 1;

  let flavor = "normal";
  if (/清炒|清蒸|蒜蓉|凉拌|蒜泥|白灼|番茄蛋汤|紫菜蛋汤|冬瓜玉米汤|豆腐汤|银耳|南瓜绿豆/.test(name)) {
    flavor = "light";
  } else if (/麻辣|水煮|香辣|辣子|泡椒|剁椒|鲜椒|爆炒|干锅|干煸|红烧|回锅|糖醋|梅菜扣肉|夫妻肺片|烤鱼|肥肠|腊肉/.test(name)) {
    flavor = "rich";
  }
  return { spiceLevel, flavor };
}

let activeRole = null;
let activeProtein = "none";
let activeGroup = "";
const parsed = [];

for (const line of lines) {
  const levelThree = line.match(/^###\s+([3-7]\.\d+)\s+(.+)$/);
  const levelTwo = line.match(/^##\s+([3-7])\.\s+(.+)$/);

  if (levelThree) {
    const [, number, title] = levelThree;
    activeGroup = title.replace(/（[^）]*）\s*$/, "").trim();
    if (number.startsWith("3.")) {
      activeRole = "meat";
      const heading = Object.keys(proteinByHeading).find((key) => title.startsWith(key));
      activeProtein = heading ? proteinByHeading[heading] : "other";
    } else if (number.startsWith("5.")) {
      activeRole = "soup";
      const heading = Object.keys(proteinByHeading).find((key) => title.startsWith(key));
      activeProtein = heading ? proteinByHeading[heading] : "other";
    } else if (number.startsWith("7.")) {
      activeRole = "other";
      activeProtein = "none";
    }
    continue;
  }

  if (levelTwo) {
    const [, number, title] = levelTwo;
    activeGroup = title.replace(/（[^）]*）\s*$/, "").trim();
    if (number === "3") {
      activeRole = "meat";
      activeProtein = "other";
    } else if (number === "4") {
      activeRole = "veg";
      activeProtein = "none";
    } else if (number === "5") {
      activeRole = "soup";
      activeProtein = "none";
    } else if (number === "6") {
      activeRole = "other";
      activeProtein = "none";
    } else if (number === "7") {
      activeRole = "other";
      activeProtein = "none";
    } else {
      activeRole = null;
    }
    continue;
  }

  if (/^##\s+/.test(line)) activeRole = null;
  if (!activeRole) continue;

  const numberedRow = line.match(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|(?:\s*([^|]*?)\s*\|)?/);
  const narrativeRow = activeRole === "other" && /^(待确认|其他)$/.test(activeGroup)
    ? line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|(?:\s*([^|]*?)\s*\|)?/)
    : null;
  const row = numberedRow || narrativeRow;
  if (!row) continue;
  const name = (numberedRow ? row[2] : row[1]).trim();
  const extra = ((numberedRow ? row[3] : row[2]) || "").trim();
  if (!name || /^(菜名|---)/.test(name)) continue;

  let protein = activeProtein;
  if (activeGroup === "其他水产" && waterProtein[extra]) protein = waterProtein[extra];
  if (activeGroup === "其他蛋白汤" && soupProtein[extra]) protein = soupProtein[extra];
  if (name === "香酥藕盒") protein = "other";
  if (name === "蛋炒饭") protein = "egg";

  const { spiceLevel, flavor } = classify(name);
  parsed.push({ name, role: activeRole, protein, spiceLevel, flavor, sourceGroup: activeGroup });
}

const normalized = new Set();
const dishes = parsed.map((dish, index) => {
  let normalizedName = normalizeName(dish.name);
  if (normalized.has(normalizedName)) normalizedName = `${normalizedName}-${index + 1}`;
  normalized.add(normalizedName);
  const ready = readyNames.includes(dish.name);
  return {
    id: `d${String(index + 1).padStart(3, "0")}`,
    ...dish,
    normalizedName,
    dataStatus: ready ? "ready" : "draft",
    autoPlannable: dish.role !== "other",
    isCustom: false
  };
});

const counts = dishes.reduce((acc, dish) => {
  acc[dish.role] = (acc[dish.role] || 0) + 1;
  if (dish.dataStatus === "ready") acc.ready = (acc.ready || 0) + 1;
  return acc;
}, {});

const missingReady = readyNames.filter((name) => !dishes.some((dish) => dish.name === name));
if (dishes.length !== 180) throw new Error(`Expected 180 dishes, got ${dishes.length}`);
if (counts.meat !== 98 || counts.veg !== 47 || counts.soup !== 22) {
  throw new Error(`Unexpected role counts: ${JSON.stringify(counts)}`);
}
if (counts.ready !== 38) throw new Error(`Expected 38 ready dishes, got ${counts.ready}`);
if (missingReady.length) throw new Error(`Missing ready dishes: ${missingReady.join(", ")}`);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({ counts, dishes }, null, 2) + "\n", "utf8");
console.log(`Wrote ${dishes.length} dishes (${counts.ready} ready) to ${path.relative(root, outputPath)}`);
