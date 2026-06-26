function clean(value) {
  return String(value || "").trim();
}

const MISSING = "未找到";

function hasValue(value) {
  const text = clean(value);
  return Boolean(text && text !== MISSING);
}

function isValidCountry(value) {
  const text = clean(value);
  if (!text || text === MISSING) return false;
  if (/^(BIM|CAD|CEO|CTO|COO|CFO|CRM|GIS|IT|AI|BD|NDT)$/i.test(text)) return false;
  if (/manager|engineer|director|surveyor|sales|project|general|construction|technology|services/i.test(text)) return false;
  return text.length > 3 || /^(USA|UAE|UK)$/i.test(text);
}

function countryFromRegion(region) {
  const value = clean(region);
  if (!value || value === MISSING) return "";
  const rules = [
    [/Madrid|Barcelona|Valencia|Seville|Sevilla|Gij[oó]n|Gijon|Catalonia|Cataluña|Catalunya|马德里|马德里自治区|巴塞罗那|加泰罗尼亚|瓦伦西亚|塞维利亚|安达卢西亚|希洪|西班牙/i, "Spain"],
    [/Paris|Lyon|Toulouse|Marseille|Bordeaux|Annecy|Lille|Rennes|Nouvelle-Aquitaine|Île-de-France|Ile-de-France|法国|新阿基坦|法兰西岛|普罗旺斯|波尔多|安纳西/i, "France"],
    [/New York|California|Texas|Florida|Boston|Seattle|Chicago|Los Angeles|San Francisco|美国/i, "United States"],
    [/London|Manchester|Birmingham|Cambridge|Oxford|England|Scotland|Wales|英国/i, "United Kingdom"],
    [/Berlin|Munich|Hamburg|Frankfurt|Stuttgart|Bavaria|德国/i, "Germany"],
    [/Milan|Milano|Rome|Roma|Turin|Torino|Lombardy|意大利/i, "Italy"],
    [/Amsterdam|Rotterdam|Utrecht|Netherlands|荷兰/i, "Netherlands"],
    [/Brussels|Antwerp|Belgium|比利时/i, "Belgium"],
    [/Geneva|Zurich|Lausanne|Switzerland|瑞士/i, "Switzerland"],
    [/Bangkok|Chiang Mai|Phuket|Thailand|泰国/i, "Thailand"],
    [/Kuala Lumpur|Selangor|Penang|Malaysia|马来西亚/i, "Malaysia"],
    [/Singapore|新加坡/i, "Singapore"],
    [/Tokyo|Osaka|Japan|日本/i, "Japan"],
    [/Seoul|Busan|South Korea|韩国/i, "South Korea"],
    [/Dubai|Abu Dhabi|UAE|阿联酋/i, "United Arab Emirates"],
    [/Beijing|Shanghai|Shenzhen|Guangzhou|Hong Kong|中国|香港/i, "China"],
    [/Bucharest|București|Bucuresti|Romania|罗马尼亚|布加勒斯特/i, "Romania"]
  ];
  for (const [pattern, country] of rules) {
    if (pattern.test(value)) return country;
  }
  return "";
}

function displayCountry(row) {
  if (isValidCountry(row.country)) return row.country;
  return countryFromRegion(row.profile_location || row.location) || row.country || "";
}

function displayRegion(row) {
  let region = clean(row.profile_location || row.location);
  if (!region || region === MISSING) return "";
  const country = displayCountry(row);
  const aliases = {
    France: ["France", "法国", "法國"],
    Spain: ["Spain", "España", "Espagne", "西班牙"],
    Romania: ["Romania", "România", "Roumanie", "罗马尼亚"],
    "United Kingdom": ["United Kingdom", "UK", "英国", "英國"],
    "United States": ["United States", "USA", "美国", "美國"],
    Germany: ["Germany", "Deutschland", "德国", "德國"],
    Italy: ["Italy", "Italia", "意大利", "義大利"],
    Netherlands: ["Netherlands", "Nederland", "荷兰", "荷蘭"],
    Belgium: ["Belgium", "Belgique", "比利时", "比利時"],
    Switzerland: ["Switzerland", "Suisse", "Schweiz", "瑞士"],
    Thailand: ["Thailand", "泰国", "泰國"],
    China: ["China", "中国", "中國"],
    Japan: ["Japan", "日本"],
    Singapore: ["Singapore", "新加坡"]
  };
  for (const alias of aliases[country] || [country]) {
    if (!alias) continue;
    region = region.replace(new RegExp(`^\\s*${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[,，/\\-·|]*\\s*`, "i"), "");
  }
  return clean(region) || clean(row.profile_location || row.location);
}

function displayCompany(row) {
  return row.company || row.company_name || row.current_company || "";
}

function displayNotes(row) {
  return row.notes || row.remark || row.memo || "";
}

function normalizeProfileUrl(url) {
  const match = clean(url).match(/https:\/\/www\.linkedin\.com\/in\/[^/?#]+/i);
  return match ? match[0].replace(/\/?$/, "/") : "";
}

function toContactUrl(url) {
  const profile = normalizeProfileUrl(url);
  return profile ? profile.replace(/\/$/, "") + "/overlay/contact-info/" : "";
}

function toProfileUrl(url) {
  return normalizeProfileUrl(url);
}

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(value) {
  return new Promise((resolve) => chrome.storage.local.set(value, resolve));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvContent(results) {
  const columns = [
    ["公司名", (row) => displayCompany(row)],
    ["姓名", (row) => row.name],
    ["国家", (row) => displayCountry(row)],
    ["地区", (row) => displayRegion(row)],
    ["全部邮箱", (row) => row.emails || row.email],
    ["全部电话", (row) => row.phones || row.phone],
    ["行业", (row) => row.industry],
    ["备注", (row) => displayNotes(row)],
    ["职位/简介", (row) => row.title || row.headline],
    ["全部网站", (row) => row.websites || row.website],
    ["邮箱数量", (row) => row.email_count],
    ["电话数量", (row) => row.phone_count],
    ["网站数量", (row) => row.website_count],
    ["国家置信度", (row) => row.country_confidence],
    ["国家判断来源", (row) => row.country_source],
    ["行业置信度", (row) => row.industry_confidence],
    ["行业判断依据", (row) => row.industry_raw],
    ["LinkedIn主页", (row) => row.profile_url],
    ["联系方式页", (row) => row.contact_info_url],
    ["添加好友日期", (row) => row.connection_date || row.connection_date_text],
    ["采集状态", (row) => row.status],
    ["更新时间", (row) => row.collected_at || row.captured_at],
    ["批次ID", (row) => row.run_id]
  ];
  const lines = [columns.map(([label]) => csvEscape(label)).join(",")];
  for (const row of results) {
    lines.push(columns.map(([, getter]) => csvEscape(getter(row) || "")).join(","));
  }
  return "\ufeff" + lines.join("\n");
}

function confidenceClass(value) {
  const text = clean(value).toLowerCase();
  if (text === "high") return "ok";
  if (text === "medium") return "warn";
  if (text === "low") return "low";
  return "missing";
}

function statusClass(value) {
  return clean(value) === "OK" ? "ok" : "missing";
}

function excelContent(results) {
  const columns = [
    ["company", "公司名", 24],
    ["name", "姓名", 18],
    ["country", "国家", 16],
    ["profile_location", "地区", 28],
    ["emails", "邮箱", 34],
    ["phones", "电话", 24],
    ["industry", "行业", 26],
    ["notes", "备注", 28],
    ["title", "职位/简介", 38],
    ["websites", "全部网站", 42],
    ["country_confidence", "国家置信度", 12],
    ["industry_confidence", "行业置信度", 12],
    ["profile_url", "LinkedIn 主页", 42],
    ["contact_info_url", "联系方式页", 42],
    ["status", "状态", 12],
    ["collected_at", "更新时间", 22],
    ["country_source", "国家来源", 18],
    ["industry_raw", "行业判断依据", 34],
    ["industry_source", "行业来源", 18],
    ["connection_date", "添加好友日期", 16],
    ["run_id", "批次", 22]
  ];
  const total = results.length;
  const emailCount = results.filter((row) => clean(row.emails || row.email) && clean(row.emails || row.email) !== "未找到").length;
  const phoneCount = results.filter((row) => clean(row.phones || row.phone) && clean(row.phones || row.phone) !== "未找到").length;
  const websiteCount = results.filter((row) => clean(row.websites || row.website) && clean(row.websites || row.website) !== "未找到").length;
  const rows = results.map((row) => ({
    ...row,
    emails: row.emails || row.email || "",
    phones: row.phones || row.phone || "",
    websites: row.websites || row.website || "",
    title: row.title || row.headline || "",
    company: displayCompany(row),
    notes: displayNotes(row),
    country: displayCountry(row),
    profile_location: displayRegion(row),
    collected_at: row.collected_at || row.captured_at || ""
  }));

  const colgroup = columns.map(([, , width]) => `<col style="width:${width * 7}px">`).join("");
  const header = columns.map(([, label]) => `<th>${htmlEscape(label)}</th>`).join("");
  const body = rows.map((row, i) => {
    const cells = columns.map(([key]) => {
      const value = row[key] || "";
      let cls = "";
      if (key === "status") cls = statusClass(value);
      if (key === "country_confidence" || key === "industry_confidence") cls = confidenceClass(value);
      if ((key === "emails" || key === "phones" || key === "websites") && (!clean(value) || clean(value) === "未找到")) cls = "missing";
      const link = (key === "profile_url" || key === "contact_info_url") && value;
      return `<td class="${cls}">${link ? `<a href="${htmlEscape(value)}">${htmlEscape(value)}</a>` : htmlEscape(value)}</td>`;
    }).join("");
    return `<tr class="${i % 2 ? "alt" : ""}">${cells}</tr>`;
  }).join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: "Microsoft YaHei", Arial, sans-serif; color:#111827; }
  .summary { margin: 0 0 14px 0; border-collapse: collapse; }
  .summary td { border:1px solid #d1d5db; padding:7px 10px; }
  .summary .label { background:#eef4fb; font-weight:700; color:#1f4e79; }
  table.data { border-collapse: collapse; table-layout: fixed; width: 100%; font-size: 12px; }
  th { background:#1f4e79; color:#fff; font-weight:700; text-align:left; border:1px solid #163a5a; padding:8px; }
  td { border:1px solid #d1d5db; padding:7px; vertical-align:top; mso-number-format:"\\@"; white-space:normal; }
  tr.alt td { background:#f8fafc; }
  td.ok { background:#e7f6ec; color:#166534; font-weight:600; }
  td.warn { background:#fff7df; color:#92400e; font-weight:600; }
  td.low { background:#fff1e6; color:#9a3412; font-weight:600; }
  td.missing { background:#f3f4f6; color:#6b7280; }
  a { color:#0a66c2; text-decoration: underline; }
  .title { font-size:18px; font-weight:700; color:#1f4e79; margin-bottom:8px; }
</style>
</head>
<body>
  <div class="title">LinkedIn Contact Collector 美化导出</div>
  <table class="summary">
    <tr><td class="label">总客户数</td><td>${total}</td><td class="label">有邮箱</td><td>${emailCount}</td></tr>
    <tr><td class="label">有电话</td><td>${phoneCount}</td><td class="label">有网站</td><td>${websiteCount}</td></tr>
    <tr><td class="label">导出时间</td><td colspan="3">${htmlEscape(new Date().toLocaleString())}</td></tr>
  </table>
  <table class="data">
    <colgroup>${colgroup}</colgroup>
    <thead><tr>${header}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
  alert("已复制到剪贴板。");
}

async function refresh() {
  const { queue = [], index = 0, running = false, results = [], runId = "" } = await storageGet(["queue", "index", "running", "results", "runId"]);
  document.getElementById("status").textContent = `状态：${running ? "运行中" : "已暂停/未运行"}；进度：${Math.min(index, queue.length)} / ${queue.length}；结果：${results.length} 条；批次：${runId || "无"}`;
  const tbody = document.querySelector("#results tbody");
  tbody.innerHTML = "";
  for (const row of results.slice().reverse()) {
    const tr = document.createElement("tr");
    const cells = [
      displayCompany(row),
      row.name,
      displayCountry(row),
      displayRegion(row),
      row.emails || row.email,
      row.phones || row.phone,
      row.industry,
      displayNotes(row),
      row.title || row.headline,
      row.websites || row.website,
      row.status,
      row.collected_at || row.captured_at
    ];
    for (const cell of cells) {
      const td = document.createElement("td");
      td.textContent = cell || "";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

async function start() {
  const urls = document.getElementById("urls").value
    .split(/\r?\n/)
    .map(normalizeProfileUrl)
    .filter(Boolean);
  const unique = Array.from(new Set(urls));
  if (!unique.length) {
    alert("请先粘贴至少一个 LinkedIn 主页链接。");
    return;
  }
  const queue = unique.map((profile_url) => ({ profile_url, connection_date: "", connection_date_text: "" }));
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  await storageSet({
    queue,
    index: 0,
    running: true,
    delayMs: 6000,
    profileInfoMs: 4000,
    afterProfileMs: 3000,
    restAfter: 10,
    restMinutes: 30,
    batchLimit: unique.length,
    restUntil: 0,
    lastRestIndex: 0,
    runId
  });
  await chrome.tabs.create({ url: toProfileUrl(unique[0]) });
  refresh();
}

async function openConnections() {
  await chrome.tabs.create({ url: "https://www.linkedin.com/mynetwork/invite-connect/connections/" });
}

async function pause() {
  await storageSet({ running: false, collecting: false });
  refresh();
}

async function stopAll() {
  if (!confirm("停止所有正在进行和等待中的采集任务？已采集结果会保留。")) return;
  await storageSet({
    running: false,
    collecting: false,
    queue: [],
    index: 0,
    batchLimit: 0
  });
  refresh();
}

async function resume() {
  const { queue = [], index = 0 } = await storageGet(["queue", "index"]);
  if (!queue.length || index >= queue.length) {
    alert("当前没有待继续队列。将打开好友列表页，你可以从页面面板开始下一批。");
    await openConnections();
    return;
  }
  await storageSet({ running: true, restUntil: 0 });
  const item = queue[index] || {};
  await chrome.tabs.create({ url: toProfileUrl(item.profile_url || item) });
  refresh();
}

async function clearResults() {
  if (!confirm("清空已收集结果？")) return;
  await storageSet({ results: [] });
  refresh();
}

async function exportCsv() {
  const { results = [] } = await storageGet(["results"]);
  download("linkedin_contact_results.csv", csvContent(results), "text/csv;charset=utf-8");
}

async function exportExcel() {
  const { results = [] } = await storageGet(["results"]);
  download("linkedin_contact_results_pretty.xls", "\ufeff" + excelContent(results), "application/vnd.ms-excel;charset=utf-8");
}

async function copyCsv() {
  const { results = [] } = await storageGet(["results"]);
  await copyText(csvContent(results));
}

async function copyJson() {
  const { results = [] } = await storageGet(["results"]);
  await copyText(JSON.stringify(results, null, 2));
}

async function emailDraft() {
  const { results = [], runId = "" } = await storageGet(["results", "runId"]);
  const found = results.filter((row) => row.email && row.email !== "未找到").length;
  const subject = encodeURIComponent(`LinkedIn contact results ${runId || new Date().toISOString().slice(0, 10)}`);
  const body = encodeURIComponent([
    `LinkedIn contact collection results`,
    ``,
    `Total rows: ${results.length}`,
    `Rows with email: ${found}`,
    ``,
    `CSV content is copied separately from the extension with "复制 CSV".`,
    `For safety, this button only creates a draft and does not send contact data automatically.`
  ].join("\n"));
  location.href = `mailto:?subject=${subject}&body=${body}`;
}

document.getElementById("start").addEventListener("click", start);
document.getElementById("openConnections").addEventListener("click", openConnections);
document.getElementById("pause").addEventListener("click", pause);
document.getElementById("stopAll").addEventListener("click", stopAll);
document.getElementById("resume").addEventListener("click", resume);
document.getElementById("clearResults").addEventListener("click", clearResults);
document.getElementById("exportCsv").addEventListener("click", exportCsv);
document.getElementById("exportExcel").addEventListener("click", exportExcel);
document.getElementById("copyCsv").addEventListener("click", copyCsv);
document.getElementById("copyJson").addEventListener("click", copyJson);
document.getElementById("emailDraft").addEventListener("click", emailDraft);
chrome.storage.onChanged.addListener(refresh);
refresh();
