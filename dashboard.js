/* =========================================================================
   Ticket Sales Dashboard — browser version
   -------------------------------------------------------------------------
   Pure JS / Plotly.js. No build step. No framework.
   Sections in order:
     1. Mapping tables  (sport map, team→state, marketplace tiers)
     2. Cleaner         (load CSV, derive columns)
     3. DataFrame ops   (groupby/pivot/quantile helpers — replaces pandas)
     4. Number helpers  (money, percent, color gradient)
     5. Viz             (Plotly chart builders)
     6. Tables          (heat-styled HTML table builder)
     7. KPI helpers
     8. Pages           (one render function per page)
     9. App shell       (upload, routing, sidebar)
========================================================================= */


/* =========================================================================
   1. MAPPING TABLES
========================================================================= */

const SPORT_MAP = {
  38: "NBA",
  42: "NFL",
  43: "NHL",
};

const NBA_TEAMS = {
  "Atlanta Hawks":"GA","Boston Celtics":"MA","Brooklyn Nets":"NY",
  "Charlotte Hornets":"NC","Chicago Bulls":"IL","Cleveland Cavaliers":"OH",
  "Dallas Mavericks":"TX","Denver Nuggets":"CO","Detroit Pistons":"MI",
  "Golden State Warriors":"CA","Houston Rockets":"TX","Indiana Pacers":"IN",
  "Los Angeles Clippers":"CA","Los Angeles Lakers":"CA","LA Clippers":"CA",
  "Memphis Grizzlies":"TN","Miami Heat":"FL","Milwaukee Bucks":"WI",
  "Minnesota Timberwolves":"MN","New Orleans Pelicans":"LA",
  "New York Knicks":"NY","Oklahoma City Thunder":"OK","Orlando Magic":"FL",
  "Philadelphia 76ers":"PA","Phoenix Suns":"AZ","Portland Trail Blazers":"OR",
  "Sacramento Kings":"CA","San Antonio Spurs":"TX","Toronto Raptors":"ON",
  "Utah Jazz":"UT","Washington Wizards":"DC",
};
const NFL_TEAMS = {
  "Arizona Cardinals":"AZ","Atlanta Falcons":"GA","Baltimore Ravens":"MD",
  "Buffalo Bills":"NY","Carolina Panthers":"NC","Chicago Bears":"IL",
  "Cincinnati Bengals":"OH","Cleveland Browns":"OH","Dallas Cowboys":"TX",
  "Denver Broncos":"CO","Detroit Lions":"MI","Green Bay Packers":"WI",
  "Houston Texans":"TX","Indianapolis Colts":"IN","Jacksonville Jaguars":"FL",
  "Kansas City Chiefs":"MO","Las Vegas Raiders":"NV",
  "Los Angeles Chargers":"CA","Los Angeles Rams":"CA","Miami Dolphins":"FL",
  "Minnesota Vikings":"MN","New England Patriots":"MA","New Orleans Saints":"LA",
  "New York Giants":"NJ","New York Jets":"NJ","Philadelphia Eagles":"PA",
  "Pittsburgh Steelers":"PA","San Francisco 49ers":"CA","Seattle Seahawks":"WA",
  "Tampa Bay Buccaneers":"FL","Tennessee Titans":"TN","Washington Commanders":"DC",
};
const NHL_TEAMS = {
  "Anaheim Ducks":"CA","Boston Bruins":"MA","Buffalo Sabres":"NY",
  "Calgary Flames":"AB","Carolina Hurricanes":"NC","Chicago Blackhawks":"IL",
  "Colorado Avalanche":"CO","Columbus Blue Jackets":"OH","Dallas Stars":"TX",
  "Detroit Red Wings":"MI","Edmonton Oilers":"AB","Florida Panthers":"FL",
  "Los Angeles Kings":"CA","Minnesota Wild":"MN","Montreal Canadiens":"QC",
  "Nashville Predators":"TN","New Jersey Devils":"NJ","New York Islanders":"NY",
  "New York Rangers":"NY","Ottawa Senators":"ON","Philadelphia Flyers":"PA",
  "Pittsburgh Penguins":"PA","San Jose Sharks":"CA","Seattle Kraken":"WA",
  "St. Louis Blues":"MO","Tampa Bay Lightning":"FL","Toronto Maple Leafs":"ON",
  "Utah Hockey Club":"UT","Utah Mammoth":"UT","Vancouver Canucks":"BC",
  "Vegas Golden Knights":"NV","Washington Capitals":"DC","Winnipeg Jets":"MB",
};
const MLB_TEAMS = {
  "Arizona Diamondbacks":"AZ","Atlanta Braves":"GA","Baltimore Orioles":"MD",
  "Boston Red Sox":"MA","Chicago Cubs":"IL","Chicago White Sox":"IL",
  "Cincinnati Reds":"OH","Cleveland Guardians":"OH","Colorado Rockies":"CO",
  "Detroit Tigers":"MI","Houston Astros":"TX","Kansas City Royals":"MO",
  "Los Angeles Angels":"CA","Los Angeles Dodgers":"CA","Miami Marlins":"FL",
  "Milwaukee Brewers":"WI","Minnesota Twins":"MN","New York Mets":"NY",
  "New York Yankees":"NY","Athletics":"CA","Oakland Athletics":"CA",
  "Philadelphia Phillies":"PA","Pittsburgh Pirates":"PA","San Diego Padres":"CA",
  "San Francisco Giants":"CA","Seattle Mariners":"WA",
  "St. Louis Cardinals":"MO","Tampa Bay Rays":"FL","Texas Rangers":"TX",
  "Toronto Blue Jays":"ON","Washington Nationals":"DC",
};

const TEAM_STATE = Object.assign({}, NBA_TEAMS, NFL_TEAMS, NHL_TEAMS, MLB_TEAMS);
const TEAM_SPORT = {};
Object.keys(NBA_TEAMS).forEach(t => TEAM_SPORT[t] = "NBA");
Object.keys(NFL_TEAMS).forEach(t => TEAM_SPORT[t] = "NFL");
Object.keys(NHL_TEAMS).forEach(t => TEAM_SPORT[t] = "NHL");
Object.keys(MLB_TEAMS).forEach(t => TEAM_SPORT[t] = "MLB");

const MARKETPLACE_TIER = {
  "StubHub":"Tier 1 - Major","SeatGeek":"Tier 1 - Major","Vivid Seats":"Tier 1 - Major",
  "Vivid":"Tier 1 - Major","TickPick":"Tier 2 - Mid","Gametime":"Tier 2 - Mid",
  "TicketsNow":"Tier 2 - Mid","Ticket Evolution":"Tier 3 - B2B",
  "GoTickets":"Tier 3 - B2B","Expired":"Expired/Other",
};

const PREMIUM_KEYWORDS = ["CLUB","CLB","LOGE","SUITE","VIP","PREMIUM","BOX","FLOOR","COURT"];
const LOT_KEYWORDS = ["LOT","GARAGE","PARKING","GOLD","BLACK","BLUE","YELLOW",
  "EMERALD","RED","GREEN","PURPLE","ORANGE","SILVER","BRONZE","WHITE","PL"];
const BALCONY_KEYWORDS = ["BAL","BALCONY","MEZZ"];


/* =========================================================================
   2. CLEANER
========================================================================= */

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function parseHour(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d.getHours();
}

function parseSection(sectionRaw, seatsRaw) {
  // returns {num: number|null, type: string}
  const section = (sectionRaw || "").toString().toUpperCase();
  const digits = section.match(/\d+/g);
  const letters = section.match(/[A-Z]+/g);
  let num = digits ? parseInt(digits.join(""), 10) : null;
  const type = letters ? letters.join("") : "";
  // Fallback: leading number from Seats when section had no digits
  if (num === null && seatsRaw) {
    const seats = seatsRaw.toString();
    const lead = seats.split("-")[0].trim();
    const m = lead.match(/\d+/);
    if (m) num = parseInt(m[0], 10);
  }
  return { num: (Number.isFinite(num) ? num : null), type };
}

function sectionNumTier(n) {
  if (n === null || n === undefined || isNaN(n)) return "Unknown";
  if (n < 100) return "Floor / Low (<100)";
  if (n < 200) return "Lower Bowl (100s)";
  if (n < 300) return "Mid Level (200s)";
  if (n < 400) return "Upper Mid (300s)";
  return "Upper Deck (400s+)";
}

function sectionTypeTier(t) {
  if (!t) return "Numeric Only";
  const s = t.toUpperCase();
  if (PREMIUM_KEYWORDS.some(k => s.includes(k))) return "Premium / Suite / Club";
  if (LOT_KEYWORDS.some(k => s.includes(k))) return "Parking / Lot";
  if (BALCONY_KEYWORDS.some(k => s.includes(k))) return "Balcony";
  if (s.length <= 2) return "Lettered (A/B/C…)";
  return "Other Named";
}

function quantityBucket(q) {
  if (q === null || q === undefined || isNaN(q)) return "Unknown";
  q = parseInt(q, 10);
  if (q === 1) return "Single";
  if (q === 2) return "Pair";
  if (q <= 4) return "Small Group (3-4)";
  if (q <= 8) return "Group (5-8)";
  return "Large Group (9+)";
}

function leadTimeBucket(d) {
  if (d === null || d === undefined || isNaN(d)) return "Unknown";
  if (d < 0) return "Post-event sale";
  if (d === 0) return "Same day";
  if (d <= 3) return "1-3 days";
  if (d <= 7) return "4-7 days";
  if (d <= 30) return "1-4 weeks";
  if (d <= 90) return "1-3 months";
  return "3+ months";
}

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function enrichRow(row, yearLabel) {
  // SafeNum: returns 0 for empty/non-numeric, else the parsed float
  const num = (v) => {
    if (v === "" || v === null || v === undefined) return 0;
    const n = parseFloat(v);
    return isFinite(n) ? n : 0;
  };
  row.YearLabel = yearLabel;
  row.SaleTotal = num(row.SaleTotal);
  row.TicketCost = num(row.TicketCost);
  row.Quantity = parseInt(row.Quantity || "0", 10) || 0;
  row.Profit = row.SaleTotal - row.TicketCost;
  row.ProfitMargin = row.SaleTotal > 0 ? (row.Profit / row.SaleTotal) * 100 : null;
  row.TicketsSold = row.Quantity;

  const sd = parseDate(row.SellDate);
  const ed = parseDate(row.EventDate);
  row.SellDate_dt = sd;
  row.EventDate_dt = ed;
  row.SellMonthNum = sd ? sd.getMonth() + 1 : null;
  row.SellMonthName = sd ? MONTH_NAMES[sd.getMonth()] : null;
  row.SellDayOfWeek = sd ? DAY_NAMES[sd.getDay()] : null;
  row.SellHour = sd ? sd.getHours() : null;
  row.LeadTimeDays = (sd && ed) ? Math.round((ed - sd) / (1000 * 60 * 60 * 24)) : null;
  row.LeadTimeBucket = leadTimeBucket(row.LeadTimeDays);
  row.EventHour = parseHour(row.EventTime);

  const sec = parseSection(row.Section, row.Seats);
  row.Section_Num = sec.num;
  row.Section_Type = sec.type;
  row.SectionNumTier = sectionNumTier(sec.num);
  row.SectionTypeTier = sectionTypeTier(sec.type);

  // Sport: TypeId first, fallback to team-name lookup (catches MLB)
  let sport = SPORT_MAP[parseInt(row.RequestedPerformerTypeId, 10)];
  if (!sport && row.PrimaryPerformerName) {
    sport = TEAM_SPORT[row.PrimaryPerformerName];
  }
  row.Sport = sport || "Other";
  row.HomeTeam = row.PrimaryPerformerName;
  row.AwayTeam = row.SecondaryPerformerName;
  row.State = TEAM_STATE[row.PrimaryPerformerName] || null;
  row.MarketplaceTier = MARKETPLACE_TIER[row.ShippingCompany] || "Other";
  row.QuantityBucket = quantityBucket(row.Quantity);

  // Bool flags
  ["IsCancelled","IsDelivered","IsExpired","IsConsecutive"].forEach(c => {
    if (row[c] !== undefined) {
      row[c] = String(row[c]).trim().toLowerCase() === "true";
    }
  });
  return row;
}

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,  // keep strings; we cast deliberately
      complete: (results) => resolve(results.data),
      error: (err) => reject(err),
    });
  });
}

async function loadCombined(thisFile, lastFile) {
  const [thisRows, lastRows] = await Promise.all([
    parseCsv(thisFile), parseCsv(lastFile),
  ]);
  const enriched = []
    .concat(thisRows.map(r => enrichRow(r, "This Year")))
    .concat(lastRows.map(r => enrichRow(r, "Last Year")));
  return enriched;
}


/* =========================================================================
   3. DATAFRAME OPS — pandas replacements
========================================================================= */

function filterRows(rows, fn) { return rows.filter(fn); }

function unique(rows, col) {
  const set = new Set();
  rows.forEach(r => { if (r[col] !== null && r[col] !== undefined && r[col] !== "") set.add(r[col]); });
  return Array.from(set);
}

function groupBy(rows, keyCol) {
  const map = new Map();
  for (const r of rows) {
    const k = r[keyCol];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

function sumBy(rows, col) {
  let s = 0;
  for (const r of rows) {
    const v = r[col];
    if (typeof v === "number" && isFinite(v)) s += v;
  }
  return s;
}

function meanBy(rows, col) {
  let s = 0, n = 0;
  for (const r of rows) {
    const v = r[col];
    if (typeof v === "number" && isFinite(v)) { s += v; n++; }
  }
  return n > 0 ? s / n : 0;
}

function countWhere(rows, fn) {
  let c = 0;
  for (const r of rows) if (fn(r)) c++;
  return c;
}

function quantile(arr, q) {
  if (!arr.length) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function median(arr) { return quantile(arr, 0.5); }

// Aggregate by group, returning array of objects with a fixed shape.
function aggGroup(rows, keyCol, aggs) {
  // aggs: {colName: ['sum'|'mean'|'count', sourceCol]}
  const map = groupBy(rows, keyCol);
  const out = [];
  for (const [k, sub] of map.entries()) {
    if (k === null || k === undefined || k === "") continue;
    const obj = { [keyCol]: k };
    for (const [out_col, [op, src]] of Object.entries(aggs)) {
      if (op === "sum") obj[out_col] = sumBy(sub, src);
      else if (op === "mean") obj[out_col] = meanBy(sub, src);
      else if (op === "count") obj[out_col] = sub.length;
    }
    out.push(obj);
  }
  return out;
}

function pivotSum(rows, rowCol, colCol, valCol) {
  // returns { rows: [...], cols: [...], values: [[...]] }
  const rowKeys = unique(rows, rowCol).sort();
  const colKeys = unique(rows, colCol).sort();
  const idx = new Map();
  rowKeys.forEach((r, i) => idx.set(`__r__${r}`, i));
  colKeys.forEach((c, j) => idx.set(`__c__${c}`, j));
  const grid = rowKeys.map(() => colKeys.map(() => 0));
  for (const r of rows) {
    const i = idx.get(`__r__${r[rowCol]}`);
    const j = idx.get(`__c__${r[colCol]}`);
    if (i === undefined || j === undefined) continue;
    const v = r[valCol];
    if (typeof v === "number" && isFinite(v)) grid[i][j] += v;
  }
  return { rows: rowKeys, cols: colKeys, values: grid };
}

function splitYears(rows) {
  return {
    thisYear: rows.filter(r => r.YearLabel === "This Year"),
    lastYear: rows.filter(r => r.YearLabel === "Last Year"),
  };
}


/* =========================================================================
   4. NUMBER + COLOR HELPERS
========================================================================= */

function fmtMoney(v) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const sign = v < 0 ? "-" : "";
  return sign + "$" + Math.round(Math.abs(v)).toLocaleString();
}

function fmtPct(v, withSign = false) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return (withSign && v > 0 ? "+" : "") + v.toFixed(1) + "%";
}

function fmtInt(v) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return Math.round(v).toLocaleString();
}

// Compact money for tight spaces (heatmap cells, axis ticks):
//   1234567 -> "$1.2M"   45000 -> "$45K"   850 -> "$850"   0 -> ""
// Returns empty for zero so heatmap cells with no activity stay clean.
function fmtCompact(v) {
  if (v === null || v === undefined || !isFinite(v) || v === 0) return "";
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function yoyDelta(thisV, lastV) {
  if (!lastV || lastV === 0 || !isFinite(lastV)) return null;
  return ((thisV - lastV) / Math.abs(lastV)) * 100;
}

// RdYlGn colormap interp, t in [0,1]. Mirrors matplotlib's RdYlGn.
const RD_YL_GN = [
  [0.0, [165,  0, 38]],
  [0.1, [215, 48, 39]],
  [0.2, [244,109, 67]],
  [0.3, [253,174, 97]],
  [0.4, [254,224,139]],
  [0.5, [255,255,191]],
  [0.6, [217,239,139]],
  [0.7, [166,217,106]],
  [0.8, [102,189, 99]],
  [0.9, [ 26,152, 80]],
  [1.0, [  0,104, 55]],
];

function interpColor(t, stops = RD_YL_GN) {
  if (t <= 0) return stops[0][1];
  if (t >= 1) return stops[stops.length - 1][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const lo = stops[i - 1], hi = stops[i];
      const span = hi[0] - lo[0];
      const f = span > 0 ? (t - lo[0]) / span : 0;
      return [
        Math.round(lo[1][0] + (hi[1][0] - lo[1][0]) * f),
        Math.round(lo[1][1] + (hi[1][1] - lo[1][1]) * f),
        Math.round(lo[1][2] + (hi[1][2] - lo[1][2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

// Outlier-resistant range from a numeric array (10th-90th percentile)
function robustRange(values) {
  const finite = values.filter(v => typeof v === "number" && isFinite(v));
  if (finite.length < 2) return null;
  const lo = quantile(finite, 0.10);
  const hi = quantile(finite, 0.90);
  if (lo === hi) return null;
  return [lo, hi];
}

// Cell background style for "high = good" gradient
function gradientStyle(value, range, mode = "highGood") {
  if (value === null || value === undefined || !isFinite(value) || !range) return "";
  const [lo, hi] = range;
  let t = (value - lo) / (hi - lo);
  t = Math.max(0, Math.min(1, t));
  if (mode === "lowGood") t = 1 - t;
  const [r, g, b] = interpColor(t);
  return `background-color: rgba(${r},${g},${b}, 0.35);`;
}

// Diverging gradient centered on zero, for YoY %
function divergingStyle(value, bound) {
  if (value === null || value === undefined || !isFinite(value) || !bound) return "";
  const t = 0.5 + Math.max(-1, Math.min(1, value / bound)) * 0.5;
  const [r, g, b] = interpColor(t);
  return `background-color: rgba(${r},${g},${b}, 0.35);`;
}


/* =========================================================================
   5. VIZ — Plotly chart builders
========================================================================= */

const THIS_COLOR = "#2E86DE";
const LAST_COLOR = "#A4B0BE";
const ACCENT_COLORS = ["#2E86DE","#27AE60","#F39C12","#9B59B6","#E74C3C",
                       "#16A085","#D35400","#34495E"];
const PLOTLY_CONFIG = { displayModeBar: false, responsive: true };

function commonLayout(extra = {}) {
  return Object.assign({
    margin: { l: 50, r: 20, t: 30, b: 50 },
    plot_bgcolor: "white",
    paper_bgcolor: "white",
    font: { family: "Inter, system-ui, sans-serif", size: 12 },
    legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "right", x: 1 },
    xaxis: { gridcolor: "#EEE", zeroline: false },
    yaxis: { gridcolor: "#EEE", zeroline: false },
  }, extra);
}

function renderEmpty(elId, msg = "No data") {
  document.getElementById(elId).innerHTML =
    `<div class="empty-state">${msg}</div>`;
}

/* =========================================================================
   METRIC FRAMEWORK
   Mirrors viz.METRIC_OPTIONS / aggregate_metric on the Python side. Every
   chart that takes a metric supports the same four:
     - SaleTotal: sum of revenue
     - Profit:    sum of profit
     - Margin:    sum(profit)/sum(revenue)*100   (proper aggregation)
     - Ratio:     sum(profit)/sum(cost)*100      (proper aggregation)
   Margin and Ratio are NEVER averaged from per-row margins — that would
   weight a $5 ticket the same as a $5,000 ticket.
========================================================================= */

const METRIC_OPTIONS = ["SaleTotal", "Profit", "Margin", "Ratio"];
const METRIC_LABELS = {
  SaleTotal: "Revenue",
  Profit: "Profit",
  Margin: "Profit Margin (%)",
  Ratio: "Profit/Cost Ratio (%)",
  Orders: "Orders",
};
const METRIC_IS_RATIO = {
  SaleTotal: false, Profit: false, Margin: true, Ratio: true, Orders: false,
};

function aggregateMetric(rows, metric) {
  if (!rows.length) return 0;
  const rev  = sumBy(rows, "SaleTotal");
  const prof = sumBy(rows, "Profit");
  const cost = sumBy(rows, "TicketCost");
  if (metric === "SaleTotal") return rev;
  if (metric === "Profit")    return prof;
  if (metric === "Orders")    return rows.length;
  if (metric === "Margin")    return rev > 0 ? (prof / rev) * 100 : 0;
  if (metric === "Ratio")     return cost > 0 ? (prof / cost) * 100 : 0;
  throw new Error("Unknown metric: " + metric);
}

function metricLabel(metric) { return METRIC_LABELS[metric] || metric; }


/* =========================================================================
   COLOR RAMPS
   SEQ_HEAT replaces the old SEQ_BLUES. Designed to:
     - never go pure white (so white-text annotations stay readable)
     - never go through red (red = loss in this dashboard)
     - have a clean text-color flip threshold around intensity 0.50
========================================================================= */

const SEQ_HEAT = [
  [0.00, "#CFE0EE"],
  [0.15, "#B5D0E4"],
  [0.30, "#8FB8D6"],
  [0.45, "#5E97C2"],
  [0.60, "#3A77AB"],
  [0.75, "#205A92"],
  [0.90, "#0F4172"],
  [1.00, "#08306B"],
];
// Old name kept for any leftover references.
const SEQ_BLUES = SEQ_HEAT;


/* =========================================================================
   CHART BUILDERS
========================================================================= */

// --- Monthly trend (chronological, single line, all 4 metrics) ----------
// One x-tick per year-month from earliest in data to latest, labeled like
// "Oct 24". No more two-year overlay — the YoY story shows up in the
// dimension chart on the YoY Trends page.
function plotMonthlyTrend(elId, rows, metric, title) {
  if (!rows.length) return renderEmpty(elId);

  // Build a sorted set of YYYY-MM keys from SellDate
  const buckets = new Map();
  rows.forEach(r => {
    if (!r.SellDate) return;
    const ym = r.SellDate.substring(0, 7); // "YYYY-MM"
    if (!buckets.has(ym)) buckets.set(ym, []);
    buckets.get(ym).push(r);
  });
  const keys = [...buckets.keys()].sort(); // chronological
  if (!keys.length) return renderEmpty(elId);

  const x = keys.map(formatYearMonth);
  const y = keys.map(k => aggregateMetric(buckets.get(k), metric));

  const trace = {
    x, y, mode: "lines+markers", type: "scatter",
    line: { color: THIS_COLOR, width: 2.5 },
    marker: { size: 7, color: THIS_COLOR },
    name: metricLabel(metric),
  };
  Plotly.newPlot(elId, [trace], commonLayout({
    title: { text: title || `Monthly ${metricLabel(metric)}`, x: 0.5 },
    xaxis: { type: "category", categoryorder: "array", categoryarray: x,
             tickangle: -30, gridcolor: "#EEE" },
    yaxis: { title: metricLabel(metric), gridcolor: "#EEE" },
    height: 400,
  }), PLOTLY_CONFIG);
}

function formatYearMonth(yyyymm) {
  // "2024-10" -> "Oct 24"
  const [y, m] = yyyymm.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun",
                  "Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}


// --- YoY grouped bars (any metric, any group column) -------------------
function plotYoyBars(elId, rows, groupCol, metric, title, topN) {
  if (!rows.length) return renderEmpty(elId);

  const groups = unique(rows, groupCol).sort();
  // Group rows by groupCol+YearLabel and compute the metric
  const cells = {};
  groups.forEach(g => {
    cells[g] = { "Last Year": [], "This Year": [] };
  });
  rows.forEach(r => {
    const g = r[groupCol];
    if (g == null || cells[g] == null) return;
    if (cells[g][r.YearLabel]) cells[g][r.YearLabel].push(r);
  });

  let groupOrder = groups;
  if (topN) {
    const totals = groups.map(g => ({
      g,
      v: Math.abs(aggregateMetric(cells[g]["This Year"], metric)) +
         Math.abs(aggregateMetric(cells[g]["Last Year"], metric)),
    }));
    totals.sort((a, b) => b.v - a.v);
    groupOrder = totals.slice(0, topN).map(t => t.g);
  }

  const x = groupOrder;
  const lastY = groupOrder.map(g => aggregateMetric(cells[g]["Last Year"], metric));
  const thisY = groupOrder.map(g => aggregateMetric(cells[g]["This Year"], metric));

  const traces = [
    { name: "Last Year", x, y: lastY, type: "bar", marker: { color: LAST_COLOR } },
    { name: "This Year", x, y: thisY, type: "bar", marker: { color: THIS_COLOR } },
  ];
  Plotly.newPlot(elId, traces, commonLayout({
    title: { text: title || `${metricLabel(metric)} by ${groupCol} — YoY`, x: 0.5 },
    barmode: "group",
    xaxis: { tickangle: -30 },
    yaxis: { title: metricLabel(metric), gridcolor: "#EEE" },
    height: 400,
  }), PLOTLY_CONFIG);
}


// --- Pie charts ---------------------------------------------------------
function plotPie(elId, rows, groupCol, valueCol, title) {
  if (!rows.length) return renderEmpty(elId);
  const buckets = {};
  rows.forEach(r => {
    const k = r[groupCol] == null ? "Unknown" : r[groupCol];
    buckets[k] = (buckets[k] || 0) + (valueCol === "__count__" ? 1 : (r[valueCol] || 0));
  });
  const labels = Object.keys(buckets);
  const values = labels.map(k => buckets[k]);

  Plotly.newPlot(elId, [{
    labels, values, type: "pie",
    marker: { colors: ACCENT_COLORS },
    textinfo: "label+percent",
    hovertemplate: "%{label}<br>%{value:,.0f}<br>%{percent}<extra></extra>",
  }], commonLayout({
    title: { text: title || `${valueCol} by ${groupCol}`, x: 0.5 },
    height: 400,
  }), PLOTLY_CONFIG);
}


// --- Histogram ---------------------------------------------------------
function plotHistogram(elId, rows, col, title, opts = {}) {
  if (!rows.length) return renderEmpty(elId);
  const values = rows.map(r => r[col]).filter(v => v != null && isFinite(v));
  if (opts.range) {
    const [lo, hi] = opts.range;
    var clipped = values.filter(v => v >= lo && v <= hi);
  } else {
    var clipped = values;
  }

  const trace = {
    x: clipped, type: "histogram",
    nbinsx: opts.nbins || 50,
    marker: { color: THIS_COLOR, line: { color: "#1B4F87", width: 0.5 } },
  };
  const layout = commonLayout({
    title: { text: title, x: 0.5 },
    xaxis: { title: opts.xlabel || col, gridcolor: "#EEE" },
    yaxis: { title: "Count", gridcolor: "#EEE" },
    height: 400,
  });
  if (opts.zeroLine) {
    layout.shapes = [{
      type: "line", x0: 0, x1: 0, y0: 0, y1: 1, yref: "paper",
      line: { color: "#E74C3C", width: 2, dash: "dash" },
    }];
  }
  Plotly.newPlot(elId, [trace], layout, PLOTLY_CONFIG);
}


// --- Box plot by group -------------------------------------------------
// --- Cost vs Revenue scatter ------------------------------------------
function plotCostVsRevenue(elId, rows, title) {
  if (!rows.length) return renderEmpty(elId);
  const sample = rows.length > 5000 ? rows.filter(() => Math.random() < 5000 / rows.length) : rows;
  const x = sample.map(r => r.TicketCost);
  const y = sample.map(r => r.SaleTotal);
  // Color by margin: blue if profit, red if loss
  const colors = sample.map(r => r.Profit >= 0 ? "#2E86DE" : "#E74C3C");

  const maxV = Math.max(...x, ...y);
  Plotly.newPlot(elId, [
    { x, y, mode: "markers", type: "scatter",
      marker: { color: colors, size: 5, opacity: 0.4 },
      hovertemplate: "Cost: $%{x:,.0f}<br>Revenue: $%{y:,.0f}<extra></extra>",
      name: "Orders" },
    { x: [0, maxV], y: [0, maxV], mode: "lines", type: "scatter",
      line: { color: "#A4B0BE", dash: "dash", width: 2 },
      name: "Break-even", hoverinfo: "skip" },
  ], commonLayout({
    title: { text: title || "Cost vs Revenue", x: 0.5 },
    xaxis: { title: "Ticket Cost ($)", gridcolor: "#EEE" },
    yaxis: { title: "Sale Total ($)", gridcolor: "#EEE" },
    height: 400,
    showlegend: false,
  }), PLOTLY_CONFIG);
}


/* =========================================================================
   HEATMAPS
========================================================================= */

// Compute per-cell metric value from groupby of (rowCol, colCol). Returns
// { rowLabels, colLabels, grid }. Used by both plotHeatmap and the shared-
// z-range pre-pass on the Heatmap Hub.
function buildMetricGrid(rows, rowCol, colCol, metric, opts = {}) {
  if (!rows.length) return { rowLabels: [], colLabels: [], grid: [] };

  // Aggregate components per cell first
  const agg = new Map();
  rows.forEach(r => {
    const rk = r[rowCol], ck = r[colCol];
    if (rk == null || ck == null) return;
    const key = rk + "\u0001" + ck;
    if (!agg.has(key)) agg.set(key, { rev: 0, prof: 0, cost: 0, n: 0 });
    const cell = agg.get(key);
    cell.rev  += r.SaleTotal || 0;
    cell.prof += r.Profit    || 0;
    cell.cost += r.TicketCost || 0;
    cell.n    += 1;
  });

  // Pull row/col label sets out of the aggregated keys
  const rowSet = new Set(), colSet = new Set();
  agg.forEach((_, k) => {
    const [r, c] = k.split("\u0001");
    rowSet.add(r); colSet.add(c);
  });
  let rowLabels = [...rowSet];
  let colLabels = [...colSet];

  // Helper: derive value from cell components
  const deriveValue = (cell) => {
    if (!cell) return 0;
    if (metric === "SaleTotal") return cell.rev;
    if (metric === "Profit")    return cell.prof;
    if (metric === "Margin")    return cell.rev > 0 ? cell.prof / cell.rev * 100 : 0;
    if (metric === "Ratio")     return cell.cost > 0 ? cell.prof / cell.cost * 100 : 0;
    return 0;
  };

  // Top-N filtering by row/col total
  if (opts.topRows) {
    const totals = rowLabels.map(r => ({
      r, v: colLabels.reduce((s, c) =>
        s + Math.abs(deriveValue(agg.get(r + "\u0001" + c))), 0),
    }));
    totals.sort((a, b) => b.v - a.v);
    rowLabels = totals.slice(0, opts.topRows).map(t => t.r);
  }
  if (opts.topCols) {
    const totals = colLabels.map(c => ({
      c, v: rowLabels.reduce((s, r) =>
        s + Math.abs(deriveValue(agg.get(r + "\u0001" + c))), 0),
    }));
    totals.sort((a, b) => b.v - a.v);
    colLabels = totals.slice(0, opts.topCols).map(t => t.c);
  }

  // Sort: rows ascending by total, cols descending — so the largest row sits
  // at the top of the rendered chart and the densest column on the left
  const rowTotal = (r) => colLabels.reduce(
    (s, c) => s + deriveValue(agg.get(r + "\u0001" + c)), 0);
  const colTotal = (c) => rowLabels.reduce(
    (s, r) => s + deriveValue(agg.get(r + "\u0001" + c)), 0);
  rowLabels.sort((a, b) => rowTotal(a) - rowTotal(b));
  colLabels.sort((a, b) => colTotal(b) - colTotal(a));

  const grid = rowLabels.map(r =>
    colLabels.map(c => deriveValue(agg.get(r + "\u0001" + c)))
  );
  return { rowLabels, colLabels, grid };
}

function sharedZRange(grids) {
  let max = 0;
  grids.forEach(g => g.forEach(row => row.forEach(v => {
    if (isFinite(v) && Math.abs(v) > max) max = Math.abs(v);
  })));
  return [0, max || 1];
}

// Main heatmap renderer. Accepts metric (4-way) and optional zRange.
// Annotations: dark text on cells with intensity < 0.50, white text above —
// thresholds tuned for the new SEQ_HEAT ramp that doesn't go pure white.
function plotHeatmap(elId, rows, rowCol, colCol, metric, title, opts = {}) {
  if (!rows.length) return renderEmpty(elId);

  const { rowLabels, colLabels, grid } = buildMetricGrid(
    rows, rowCol, colCol, metric, opts);
  if (!rowLabels.length || !colLabels.length) return renderEmpty(elId);

  const zRange = opts.zRange || sharedZRange([grid]);
  const zmax = zRange[1] || 1;
  const isRatio = METRIC_IS_RATIO[metric];
  const labelThreshold = zmax * 0.03;

  // Cell annotations
  const annotations = [];
  for (let i = 0; i < rowLabels.length; i++) {
    for (let j = 0; j < colLabels.length; j++) {
      const v = grid[i][j];
      if (!isFinite(v) || v === 0 || Math.abs(v) < labelThreshold) continue;
      const intensity = v / zmax;
      const fontColor = intensity > 0.50 ? "#FFFFFF" : "#0F172A";
      const text = isRatio ? v.toFixed(1) + "%" : fmtCompact(v);
      annotations.push({
        x: colLabels[j], y: rowLabels[i], text,
        showarrow: false, font: { size: 10, color: fontColor },
      });
    }
  }

  const hoverFmt = isRatio
    ? "%{y} · %{x}<br>" + metricLabel(metric) + ": %{z:.1f}%<extra></extra>"
    : "%{y} · %{x}<br>" + metricLabel(metric) + ": $%{z:,.0f}<extra></extra>";

  Plotly.newPlot(elId, [{
    z: grid, x: colLabels, y: rowLabels,
    type: "heatmap", colorscale: SEQ_HEAT,
    zmin: zRange[0], zmax: zRange[1],
    hovertemplate: hoverFmt,
  }], commonLayout({
    title: { text: title || `${metricLabel(metric)} by ${rowCol} × ${colCol}`, x: 0.5 },
    xaxis: { tickangle: -30, automargin: true },
    yaxis: { automargin: true },
    height: opts.height || 480,
    annotations,
  }), PLOTLY_CONFIG);
}


// --- Day × Hour heatmap (any metric, with optional shared zRange) ------
function plotDayHourHeat(elId, rows, metric, title) {
  if (!rows.length) return renderEmpty(elId);
  const days = ["Monday","Tuesday","Wednesday","Thursday",
                "Friday","Saturday","Sunday"];
  const hours = Array.from({length: 24}, (_, h) => h);

  // Aggregate components per cell
  const agg = new Map();
  rows.forEach(r => {
    const d = r.SellDayOfWeek, h = r.SellHour;
    if (d == null || h == null) return;
    const key = d + "\u0001" + h;
    if (!agg.has(key)) agg.set(key, { rev: 0, prof: 0, cost: 0 });
    const cell = agg.get(key);
    cell.rev  += r.SaleTotal || 0;
    cell.prof += r.Profit || 0;
    cell.cost += r.TicketCost || 0;
  });
  const deriveValue = (cell) => {
    if (!cell) return 0;
    if (metric === "SaleTotal") return cell.rev;
    if (metric === "Profit")    return cell.prof;
    if (metric === "Margin")    return cell.rev > 0 ? cell.prof / cell.rev * 100 : 0;
    if (metric === "Ratio")     return cell.cost > 0 ? cell.prof / cell.cost * 100 : 0;
    return 0;
  };
  const grid = days.map(d => hours.map(h => deriveValue(agg.get(d + "\u0001" + h))));

  const [zmin, zmax] = sharedZRange([grid]);
  const isRatio = METRIC_IS_RATIO[metric];
  const labelThreshold = zmax * 0.04;

  const annotations = [];
  for (let i = 0; i < days.length; i++) {
    for (let j = 0; j < hours.length; j++) {
      const v = grid[i][j];
      if (!isFinite(v) || v === 0 || Math.abs(v) < labelThreshold) continue;
      const intensity = v / zmax;
      const fontColor = intensity > 0.50 ? "#FFFFFF" : "#0F172A";
      const text = isRatio ? v.toFixed(0) + "%" : fmtCompact(v);
      annotations.push({
        x: hours[j], y: days[i], text,
        showarrow: false, font: { size: 9, color: fontColor },
      });
    }
  }

  const hoverFmt = isRatio
    ? "%{y} · %{x}:00<br>%{z:.1f}%<extra></extra>"
    : "%{y} · %{x}:00<br>$%{z:,.0f}<extra></extra>";

  Plotly.newPlot(elId, [{
    z: grid, x: hours, y: days,
    type: "heatmap", colorscale: SEQ_HEAT,
    zmin, zmax, hovertemplate: hoverFmt,
  }], commonLayout({
    title: { text: title || `When sales happen — ${metricLabel(metric)}`, x: 0.5 },
    xaxis: { dtick: 2, title: "Hour of Day" },
    yaxis: { automargin: true },
    height: 420,
    annotations,
  }), PLOTLY_CONFIG);
}


/* =========================================================================
   CHOROPLETH (4-metric aware, shared scale support)
========================================================================= */

function plotChoropleth(elId, rows, metric, title, opts = {}) {
  if (!rows.length) return renderEmpty(elId);
  const stateAgg = new Map();
  rows.forEach(r => {
    if (!r.State) return;
    if (!stateAgg.has(r.State)) stateAgg.set(r.State, { rev: 0, prof: 0, cost: 0 });
    const a = stateAgg.get(r.State);
    a.rev  += r.SaleTotal || 0;
    a.prof += r.Profit || 0;
    a.cost += r.TicketCost || 0;
  });
  const deriveValue = (a) => {
    if (metric === "SaleTotal") return a.rev;
    if (metric === "Profit")    return a.prof;
    if (metric === "Margin")    return a.rev > 0 ? a.prof / a.rev * 100 : 0;
    if (metric === "Ratio")     return a.cost > 0 ? a.prof / a.cost * 100 : 0;
    return 0;
  };

  const locations = [];
  const z = [];
  stateAgg.forEach((a, s) => {
    locations.push(s);
    z.push(deriveValue(a));
  });

  const isRatio = METRIC_IS_RATIO[metric];
  const colorbarFmt = isRatio ? ".1f" : ",.0f";
  const layout = commonLayout({
    title: { text: title || `${metricLabel(metric)} by State`, x: 0.5 },
    geo: { scope: "usa", showlakes: false },
    height: 480,
  });

  const trace = {
    type: "choropleth", locationmode: "USA-states",
    locations, z, colorscale: SEQ_HEAT,
    hovertemplate: isRatio
      ? "%{location}<br>" + metricLabel(metric) + ": %{z:.1f}%<extra></extra>"
      : "%{location}<br>" + metricLabel(metric) + ": $%{z:,.0f}<extra></extra>",
    colorbar: { tickformat: colorbarFmt },
  };
  if (opts.zRange) {
    trace.zmin = opts.zRange[0];
    trace.zmax = opts.zRange[1];
  }
  Plotly.newPlot(elId, [trace], layout, PLOTLY_CONFIG);
}

function choroplethSharedRange(rowSubsets, metric) {
  const maxes = rowSubsets.map(rows => {
    if (!rows.length) return 0;
    const stateAgg = new Map();
    rows.forEach(r => {
      if (!r.State) return;
      if (!stateAgg.has(r.State)) stateAgg.set(r.State, { rev: 0, prof: 0, cost: 0 });
      const a = stateAgg.get(r.State);
      a.rev  += r.SaleTotal || 0;
      a.prof += r.Profit || 0;
      a.cost += r.TicketCost || 0;
    });
    let max = 0;
    stateAgg.forEach(a => {
      let v = 0;
      if (metric === "SaleTotal") v = a.rev;
      else if (metric === "Profit") v = a.prof;
      else if (metric === "Margin") v = a.rev > 0 ? a.prof / a.rev * 100 : 0;
      else if (metric === "Ratio")  v = a.cost > 0 ? a.prof / a.cost * 100 : 0;
      if (v > max) max = v;
    });
    return max;
  });
  return [0, Math.max(...maxes, 1)];
}


// --- Affiliate vs Portfolio bars (multi-metric overview) -----------------
function plotAffiliateVsPortfolio(elId, rows, affName) {
  const aff = rows.filter(r => r.CompanyName === affName && r.YearLabel === "This Year");
  const port = rows.filter(r => r.YearLabel === "This Year");
  if (!aff.length || !port.length) return renderEmpty(elId);

  const affAvgRev   = sumBy(aff, "SaleTotal") / aff.length;
  const portAvgRev  = sumBy(port, "SaleTotal") / port.length;
  const affAvgProf  = sumBy(aff, "Profit") / aff.length;
  const portAvgProf = sumBy(port, "Profit") / port.length;
  const affMargin   = aggregateMetric(aff, "Margin");
  const portMargin  = aggregateMetric(port, "Margin");
  const affRatio    = aggregateMetric(aff, "Ratio");
  const portRatio   = aggregateMetric(port, "Ratio");

  const x = ["Avg Revenue", "Avg Profit", "Margin %", "P/Cost Ratio %"];
  const portValues = [portAvgRev, portAvgProf, portMargin, portRatio];
  const affValues  = [affAvgRev, affAvgProf, affMargin, affRatio];

  Plotly.newPlot(elId, [
    { name: "Portfolio", x, y: portValues, type: "bar", marker: { color: LAST_COLOR } },
    { name: affName,     x, y: affValues,  type: "bar", marker: { color: THIS_COLOR } },
  ], commonLayout({
    title: { text: `${affName} vs Portfolio Average (TY)`, x: 0.5 },
    barmode: "group",
    height: 380,
  }), PLOTLY_CONFIG);
}


// --- Affiliate YoY all-metrics bars (single affiliate) -------------------
function plotAffiliateYoy(elId, affRows) {
  const ty = affRows.filter(r => r.YearLabel === "This Year");
  const ly = affRows.filter(r => r.YearLabel === "Last Year");
  if (!ty.length && !ly.length) return renderEmpty(elId);

  const x = ["Revenue", "Profit", "Margin %", "P/Cost Ratio %", "Orders"];
  const lyVals = [
    aggregateMetric(ly, "SaleTotal"),
    aggregateMetric(ly, "Profit"),
    aggregateMetric(ly, "Margin"),
    aggregateMetric(ly, "Ratio"),
    ly.length,
  ];
  const tyVals = [
    aggregateMetric(ty, "SaleTotal"),
    aggregateMetric(ty, "Profit"),
    aggregateMetric(ty, "Margin"),
    aggregateMetric(ty, "Ratio"),
    ty.length,
  ];
  Plotly.newPlot(elId, [
    { name: "Last Year", x, y: lyVals, type: "bar", marker: { color: LAST_COLOR } },
    { name: "This Year", x, y: tyVals, type: "bar", marker: { color: THIS_COLOR } },
  ], commonLayout({
    title: { text: "YoY Comparison", x: 0.5 },
    barmode: "group",
    height: 380,
  }), PLOTLY_CONFIG);
}


/* =========================================================================
   TABLE BUILDERS
========================================================================= */

// Build an HTML table with optional column-level formatting + heat coloring.
// `cols` is an array of { key, label, type?, gradient? }
//   type:     "money" | "pct" | "int" | "text" | "pctChange"
//   gradient: "highGood" | "lowGood" | "diverging"
function buildTable(rows, cols, opts = {}) {
  if (!rows.length) return `<div class="empty-state">No data</div>`;

  // Compute robust ranges for gradient cols
  const ranges = {};
  cols.forEach(col => {
    if (col.gradient) {
      const vals = rows.map(r => r[col.key]).filter(v => v != null && isFinite(v));
      ranges[col.key] = robustRange(vals);
    }
  });

  let html = `<table class="data-table"><thead><tr>`;
  cols.forEach(col => {
    html += `<th data-col="${col.key}" data-type="${col.type || 'text'}">${col.label}</th>`;
  });
  html += `</tr></thead><tbody>`;
  rows.forEach(r => {
    html += `<tr>`;
    cols.forEach(col => {
      const v = r[col.key];
      let cellText;
      if (v == null || v === "") {
        cellText = "—";
      } else if (col.type === "money")     cellText = fmtMoney(v);
      else if (col.type === "pct")         cellText = fmtPct(v);
      else if (col.type === "pctChange")   cellText = fmtPct(v, true);
      else if (col.type === "int")         cellText = fmtInt(v);
      else                                  cellText = String(v);

      let style = "";
      if (col.gradient && v != null && isFinite(v)) {
        if (col.gradient === "diverging") {
          const bound = Math.max(...rows.map(x => Math.abs(x[col.key] || 0)));
          style = divergingStyle(v, bound);
        } else {
          style = gradientStyle(v, ranges[col.key], col.gradient);
        }
      }
      html += `<td class="td-${col.type || 'text'}" style="${style}" data-sort-value="${typeof v === 'number' ? v : ''}">${cellText}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table>`;
  return html;
}

function makeSortable(rootEl) {
  rootEl.querySelectorAll("table.data-table").forEach(table => {
    const ths = table.querySelectorAll("thead th");
    ths.forEach((th, i) => {
      th.style.cursor = "pointer";
      let asc = false;
      th.addEventListener("click", () => {
        const tbody = table.tBodies[0];
        const rows = [...tbody.rows];
        const type = th.getAttribute("data-type");
        const isNumeric = ["money","pct","int","pctChange"].includes(type);
        rows.sort((a, b) => {
          const av = a.cells[i].getAttribute("data-sort-value");
          const bv = b.cells[i].getAttribute("data-sort-value");
          if (isNumeric) {
            return (parseFloat(av || -1e15) - parseFloat(bv || -1e15)) * (asc ? 1 : -1);
          }
          return (a.cells[i].textContent.localeCompare(b.cells[i].textContent))
                 * (asc ? 1 : -1);
        });
        rows.forEach(r => tbody.appendChild(r));
        asc = !asc;
      });
    });
  });
}


/* =========================================================================
   KPI HELPERS
========================================================================= */

function kpiBlock(rows) {
  if (!rows.length) {
    return { revenue: 0, profit: 0, margin: 0, orders: 0, tickets: 0 };
  }
  const revenue = sumBy(rows, "SaleTotal");
  const profit = sumBy(rows, "Profit");
  return {
    revenue, profit,
    margin: revenue > 0 ? profit / revenue * 100 : 0,
    orders: rows.length,
    tickets: sumBy(rows, "TicketsSold"),
  };
}

function deltaSpan(value, goodIsHigh = true) {
  if (value == null || !isFinite(value)) return `<span class="delta-na">—</span>`;
  const cls = (value >= 0) === goodIsHigh ? "delta-good" : "delta-bad";
  const sign = value >= 0 ? "+" : "";
  return `<span class="${cls}">${sign}${value.toFixed(1)}%</span>`;
}

function kpiRowHtml(thisKpi, lastKpi) {
  const revD  = yoyDelta(thisKpi.revenue, lastKpi.revenue);
  const profD = yoyDelta(thisKpi.profit, lastKpi.profit);
  const margD = thisKpi.margin - lastKpi.margin;
  const ordD  = yoyDelta(thisKpi.orders, lastKpi.orders);
  const tixD  = yoyDelta(thisKpi.tickets, lastKpi.tickets);
  return `
    <div class="kpi-row">
      <div class="kpi-card"><div class="kpi-label">Revenue</div>
        <div class="kpi-value">${fmtMoney(thisKpi.revenue)}</div>
        <div class="kpi-delta">${deltaSpan(revD)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Profit</div>
        <div class="kpi-value">${fmtMoney(thisKpi.profit)}</div>
        <div class="kpi-delta">${deltaSpan(profD)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Margin</div>
        <div class="kpi-value">${thisKpi.margin.toFixed(1)}%</div>
        <div class="kpi-delta">${deltaSpan(margD)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Orders</div>
        <div class="kpi-value">${fmtInt(thisKpi.orders)}</div>
        <div class="kpi-delta">${deltaSpan(ordD)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Tickets Sold</div>
        <div class="kpi-value">${fmtInt(thisKpi.tickets)}</div>
        <div class="kpi-delta">${deltaSpan(tixD)}</div></div>
    </div>`;
}

function pageHeader(icon, title, subtitle) {
  return `<div class="page-header">
    <h1>${icon}&nbsp;&nbsp;${title}</h1>
    ${subtitle ? `<p>${subtitle}</p>` : ""}
  </div>`;
}


/* =========================================================================
   AGGREGATION TABLES (mirror Python viz.py)
========================================================================= */

// Per-group YoY table — same columns as Python's groupby_yoy_table.
function groupYoyTableRows(rows, groupCol) {
  const out = [];
  unique(rows, groupCol).sort().forEach(name => {
    const sub = rows.filter(r => r[groupCol] === name);
    const ty = sub.filter(r => r.YearLabel === "This Year");
    const ly = sub.filter(r => r.YearLabel === "Last Year");
    const tyRev   = aggregateMetric(ty, "SaleTotal");
    const lyRev   = aggregateMetric(ly, "SaleTotal");
    const tyProf  = aggregateMetric(ty, "Profit");
    const lyProf  = aggregateMetric(ly, "Profit");
    const tyMarg  = aggregateMetric(ty, "Margin");
    const lyMarg  = aggregateMetric(ly, "Margin");
    const tyRatio = aggregateMetric(ty, "Ratio");
    const lyRatio = aggregateMetric(ly, "Ratio");
    const revYoy  = lyRev > 0 ? (tyRev - lyRev) / lyRev * 100 : null;
    const profYoy = lyProf !== 0 ? (tyProf - lyProf) / Math.abs(lyProf) * 100 : null;
    const row = {
      "Revenue (TY)": +tyRev.toFixed(2),
      "Revenue (LY)": +lyRev.toFixed(2),
      "Revenue YoY %": revYoy != null ? +revYoy.toFixed(1) : null,
      "Profit (TY)": +tyProf.toFixed(2),
      "Profit (LY)": +lyProf.toFixed(2),
      "Profit YoY %": profYoy != null ? +profYoy.toFixed(1) : null,
      "Margin % (TY)": +tyMarg.toFixed(1),
      "Margin % (LY)": +lyMarg.toFixed(1),
      "P/Cost Ratio % (TY)": +tyRatio.toFixed(1),
      "P/Cost Ratio % (LY)": +lyRatio.toFixed(1),
      "Orders (TY)": ty.length,
      "Orders (LY)": ly.length,
    };
    row[groupCol] = name;
    out.push(row);
  });
  out.sort((a, b) => (b["Revenue (TY)"] || 0) - (a["Revenue (TY)"] || 0));
  return out;
}

function defaultYoyColumns(groupCol, groupLabel) {
  return [
    { key: groupCol, label: groupLabel, type: "text" },
    { key: "Revenue (TY)",         label: "Revenue (TY)",         type: "money", gradient: "highGood" },
    { key: "Revenue (LY)",         label: "Revenue (LY)",         type: "money" },
    { key: "Revenue YoY %",        label: "Revenue YoY %",        type: "pctChange", gradient: "diverging" },
    { key: "Profit (TY)",          label: "Profit (TY)",          type: "money", gradient: "highGood" },
    { key: "Profit (LY)",          label: "Profit (LY)",          type: "money" },
    { key: "Profit YoY %",         label: "Profit YoY %",         type: "pctChange", gradient: "diverging" },
    { key: "Margin % (TY)",        label: "Margin % (TY)",        type: "pct", gradient: "highGood" },
    { key: "Margin % (LY)",        label: "Margin % (LY)",        type: "pct" },
    { key: "P/Cost Ratio % (TY)",  label: "P/Cost Ratio % (TY)",  type: "pct", gradient: "highGood" },
    { key: "P/Cost Ratio % (LY)",  label: "P/Cost Ratio % (LY)",  type: "pct" },
    { key: "Orders (TY)",          label: "Orders (TY)",          type: "int" },
    { key: "Orders (LY)",          label: "Orders (LY)",          type: "int" },
  ];
}

// Monthly KPI table — chronological, all 4 metrics + YoY same-month %
function monthlyKpiTableRows(rows) {
  const buckets = new Map();
  rows.forEach(r => {
    if (!r.SellDate) return;
    const ym = r.SellDate.substring(0, 7);
    if (!buckets.has(ym)) buckets.set(ym, []);
    buckets.get(ym).push(r);
  });
  const keys = [...buckets.keys()].sort();
  const revPerKey = {};
  keys.forEach(k => { revPerKey[k] = aggregateMetric(buckets.get(k), "SaleTotal"); });
  return keys.map(k => {
    const sub = buckets.get(k);
    const rev   = aggregateMetric(sub, "SaleTotal");
    const prof  = aggregateMetric(sub, "Profit");
    const marg  = aggregateMetric(sub, "Margin");
    const ratio = aggregateMetric(sub, "Ratio");
    // YoY: same month one year earlier
    const [y, m] = k.split("-").map(Number);
    const prior = `${y - 1}-${String(m).padStart(2, "0")}`;
    const priorRev = revPerKey[prior];
    const yoy = priorRev > 0 ? (rev - priorRev) / priorRev * 100 : null;
    return {
      Month: formatYearMonth(k),
      Revenue: +rev.toFixed(2),
      Profit: +prof.toFixed(2),
      "Margin %": +marg.toFixed(1),
      "P/Cost Ratio %": +ratio.toFixed(1),
      Orders: sub.length,
      "Revenue YoY %": yoy != null ? +yoy.toFixed(1) : null,
    };
  });
}

// Margin summary by group — same shape as viz.margin_summary_table
// Team breakdown table (with 4 metrics + top/worst affiliate)
function teamBreakdownRows(rows) {
  const out = [];
  unique(rows, "HomeTeam").sort().forEach(team => {
    const sub = rows.filter(r => r.HomeTeam === team);
    if (!sub.length) return;
    const rev   = aggregateMetric(sub, "SaleTotal");
    const prof  = aggregateMetric(sub, "Profit");
    const marg  = aggregateMetric(sub, "Margin");
    const ratio = aggregateMetric(sub, "Ratio");
    // top/worst affiliate by profit
    const byAff = {};
    sub.forEach(r => { byAff[r.CompanyName] = (byAff[r.CompanyName] || 0) + (r.Profit || 0); });
    const sortedAff = Object.entries(byAff).sort((a, b) => b[1] - a[1]);
    const topAff   = sortedAff.length ? sortedAff[0][0] : "";
    const worstAff = sortedAff.length > 1 ? sortedAff[sortedAff.length - 1][0] : "";
    const sport = sub[0].Sport || "";
    out.push({
      Team: team, Sport: sport,
      Revenue: +rev.toFixed(2),
      Profit: +prof.toFixed(2),
      "Margin %": +marg.toFixed(1),
      "P/Cost Ratio %": +ratio.toFixed(1),
      "Avg Order": +(rev / sub.length).toFixed(2),
      Orders: sub.length,
      Tickets: sumBy(sub, "TicketsSold"),
      "Top Affiliate": topAff,
      "Worst Affiliate": worstAff,
    });
  });
  out.sort((a, b) => b.Profit - a.Profit);
  return out;
}

// Per-event rollup — all 4 metrics
function eventRollupRows(rows) {
  const buckets = new Map();
  rows.forEach(r => {
    const k = r.EventName + "\u0001" + r.VenueName + "\u0001" + r.EventDate;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(r);
  });
  const out = [];
  buckets.forEach((sub, k) => {
    const [eventName, venueName, eventDate] = k.split("\u0001");
    const rev   = sumBy(sub, "SaleTotal");
    const cost  = sumBy(sub, "TicketCost");
    const prof  = sumBy(sub, "Profit");
    out.push({
      "Event": eventName,
      "Venue": venueName,
      "Date": eventDate,
      Revenue: +rev.toFixed(2),
      Cost: +cost.toFixed(2),
      Profit: +prof.toFixed(2),
      "Margin %": rev > 0 ? +(prof / rev * 100).toFixed(1) : 0,
      "P/Cost Ratio %": cost > 0 ? +(prof / cost * 100).toFixed(1) : 0,
      Orders: sub.length,
      Tickets: sumBy(sub, "TicketsSold"),
    });
  });
  return out;
}


/* =========================================================================
   PAGE REGISTRY
========================================================================= */

const PAGE_REGISTRY = [
  { id: "exec",        icon: "📊", title: "Executive Summary",
    sub: "Top-line view of program performance with YoY deltas." },
  { id: "yoy",         icon: "📈", title: "YoY Trend Analysis",
    sub: "Pick any dimension and metric — this is the one place every YoY-by-X comparison lives." },
  { id: "affPerf",     icon: "🎯", title: "Affiliate Performance",
    sub: "Drill into one affiliate's contribution and how they're trending." },
  { id: "leaderboard", icon: "🏆", title: "Affiliate Leaderboard",
    sub: "Every affiliate, this vs last, sortable." },
  { id: "h2h",         icon: "⚔️", title: "Affiliate Head-to-Head",
    sub: "Pick two affiliates and compare side-by-side." },
  { id: "sport",       icon: "🏟️", title: "Sport Breakdown",
    sub: "Sport mix and per-sport rollup." },
  { id: "team",        icon: "🏅", title: "Team Performance",
    sub: "Per-team table with top & worst affiliate." },
  { id: "marketplace", icon: "🛒", title: "Marketplace & Channel",
    sub: "Where tickets list and how they get delivered." },
  { id: "margin",      icon: "💰", title: "Profit Margin Deep Dive",
    sub: "Distributions, scatter, loss orders." },
  { id: "ticket",      icon: "🎫", title: "Ticket Type & Inventory",
    sub: "Section tier, quantity bundles, raw type codes." },
  { id: "geo",         icon: "🗺️", title: "Geographic View",
    sub: "US choropleth based on home-team state." },
  { id: "heat",        icon: "🔥", title: "Heatmap Hub",
    sub: "Two-dimensional intensity views." },
  { id: "time",        icon: "⏰", title: "Time Patterns",
    sub: "When in the week sales actually happen + lead time." },
  { id: "topEvents",   icon: "⭐", title: "Top Events",
    sub: "Highest- and lowest-performing events." },
  { id: "risk",        icon: "⚠️", title: "Risk & Delivery",
    sub: "Delivery rate, undelivered, cancellations." },
];


/* =========================================================================
   GLOBAL STATE + FILTER PIPELINE
========================================================================= */

const STATE = {
  rows: [],
  affiliate: "__ALL__",
  sports: null,           // null = no filter; otherwise Set of sport names
  page: "exec",
};

function getRealAffiliates() { return unique(STATE.rows, "CompanyName").sort(); }
function getAllSports()      { return unique(STATE.rows, "Sport").filter(s => s).sort(); }

function getScopedData() {
  let rs = STATE.rows;
  if (STATE.affiliate !== "__ALL__") rs = rs.filter(r => r.CompanyName === STATE.affiliate);
  if (STATE.sports) rs = rs.filter(r => STATE.sports.has(r.Sport));
  return rs;
}


/* =========================================================================
   UI HELPER FRAGMENTS
========================================================================= */

function metricPickerHtml(id, currentValue, includeOrders) {
  const opts = [...METRIC_OPTIONS];
  if (includeOrders) opts.push("Orders");
  const labels = {
    SaleTotal: "Revenue", Profit: "Profit",
    Margin: "Profit Margin", Ratio: "P/Cost Ratio", Orders: "Orders",
  };
  const buttons = opts.map(o =>
    `<button class="metric-pill ${o === currentValue ? 'active' : ''}" data-metric="${o}">${labels[o]}</button>`
  ).join("");
  return `<div class="metric-picker" id="${id}">
    <span class="metric-label">Metric:</span>${buttons}
  </div>`;
}

function dimensionPickerHtml(id, currentValue, options) {
  const opts = options.map(([label, val]) =>
    `<option value="${val}" ${val === currentValue ? "selected" : ""}>${label}</option>`
  ).join("");
  return `<div class="dim-picker">
    <label class="dim-label" for="${id}">Dimension:</label>
    <select id="${id}">${opts}</select>
  </div>`;
}


/* =========================================================================
   PAGES — restructured to eliminate every cross-page chart repeat.
   See PAGE_REGISTRY subtitles for the per-page philosophy.
========================================================================= */

// State for per-page metric/dim toggles (reset on page change)
const PAGE_STATE = {};
function ps(key, dflt) {
  if (PAGE_STATE[key] === undefined) PAGE_STATE[key] = dflt;
  return PAGE_STATE[key];
}
function setPs(key, val) { PAGE_STATE[key] = val; renderPage(); }


// --- Page 1: Executive Summary ----------------------------------------
function pageExec(rows) {
  const { thisYear: thisRows, lastYear: lastRows } = splitYears(rows);
  const m = ps("execMetric", "SaleTotal");
  return `
    ${pageHeader("📊", "Executive Summary",
      `Top-line program performance with YoY deltas. Scope: <b>${affiliateLabel()}</b>.`)}
    ${kpiRowHtml(kpiBlock(thisRows), kpiBlock(lastRows))}
    <h3 class="section-h">Monthly trend</h3>
    <p class="section-sub">Months are ordered earliest-in-data to latest, so a fiscal year spanning Oct → Sep reads left-to-right naturally.</p>
    ${metricPickerHtml("exec-metric", m)}
    <div id="exec-trend" class="plot"></div>
    <details class="data-expander">
      <summary>📋 Per-affiliate YoY breakdown</summary>
      <div id="exec-aff-table"></div>
    </details>
  `;
}
function pageExecPost(rows) {
  const m = ps("execMetric", "SaleTotal");
  plotMonthlyTrend("exec-trend", rows, m);
  document.querySelectorAll("#exec-metric .metric-pill").forEach(b => {
    b.addEventListener("click", () => setPs("execMetric", b.dataset.metric));
  });
  const t = groupYoyTableRows(STATE.rows, "CompanyName");
  document.getElementById("exec-aff-table").innerHTML =
    buildTable(t, defaultYoyColumns("CompanyName", "Affiliate"));
  makeSortable(document.getElementById("exec-aff-table"));
}


// --- Page 2: YoY Trend Analysis ---------------------------------------
const YOY_DIMS = [
  ["Sport", "Sport"],
  ["Marketplace", "ShippingCompany"],
  ["Marketplace tier", "MarketplaceTier"],
  ["Affiliate", "CompanyName"],
  ["Section tier (numeric)", "SectionNumTier"],
  ["Section type (premium/lot/etc.)", "SectionTypeTier"],
  ["Quantity bucket", "QuantityBucket"],
  ["Delivery type", "DeliveryType"],
  ["Lead time bucket", "LeadTimeBucket"],
  ["State", "State"],
];

function pageYoy(rows) {
  const { thisYear: thisRows, lastYear: lastRows } = splitYears(rows);
  const dim = ps("yoyDim", "Sport");
  const m = ps("yoyMetric", "SaleTotal");
  return `
    ${pageHeader("📈", "YoY Trend Analysis",
      "Pick any dimension and metric — this is the one place every YoY-by-X comparison lives.")}
    ${kpiRowHtml(kpiBlock(thisRows), kpiBlock(lastRows))}
    <div class="picker-row">
      ${dimensionPickerHtml("yoy-dim-picker", dim, YOY_DIMS)}
      ${metricPickerHtml("yoy-metric", m)}
    </div>
    <div id="yoy-bars" class="plot"></div>
    <details class="data-expander">
      <summary>📋 Full YoY table for this dimension</summary>
      <div id="yoy-table"></div>
    </details>
    <details class="data-expander">
      <summary>📅 Monthly KPI table (chronological)</summary>
      <p class="section-sub">One row per year-month, ordered earliest-to-latest. Includes a YoY column comparing each month to the same calendar month a year earlier (when present).</p>
      <div id="yoy-monthly"></div>
    </details>
  `;
}
function pageYoyPost(rows) {
  const dim = ps("yoyDim", "Sport");
  const m = ps("yoyMetric", "SaleTotal");
  const highCard = (dim === "CompanyName" || dim === "State");
  const topN = highCard ? 25 : null;
  plotYoyBars("yoy-bars", rows, dim, m, null, topN);

  const dimLabel = YOY_DIMS.find(d => d[1] === dim)[0];
  const t = groupYoyTableRows(rows, dim);
  document.getElementById("yoy-table").innerHTML =
    buildTable(t, defaultYoyColumns(dim, dimLabel));
  makeSortable(document.getElementById("yoy-table"));

  const mt = monthlyKpiTableRows(rows);
  document.getElementById("yoy-monthly").innerHTML = buildTable(mt, [
    { key: "Month",          label: "Month",          type: "text" },
    { key: "Revenue",        label: "Revenue",        type: "money", gradient: "highGood" },
    { key: "Profit",         label: "Profit",         type: "money", gradient: "highGood" },
    { key: "Margin %",       label: "Margin %",       type: "pct",   gradient: "highGood" },
    { key: "P/Cost Ratio %", label: "P/Cost Ratio %", type: "pct",   gradient: "highGood" },
    { key: "Orders",         label: "Orders",         type: "int" },
    { key: "Revenue YoY %",  label: "Revenue YoY %",  type: "pctChange", gradient: "diverging" },
  ]);
  makeSortable(document.getElementById("yoy-monthly"));

  document.getElementById("yoy-dim-picker").addEventListener("change", e => setPs("yoyDim", e.target.value));
  document.querySelectorAll("#yoy-metric .metric-pill").forEach(b => {
    b.addEventListener("click", () => setPs("yoyMetric", b.dataset.metric));
  });
}


// --- Page 3: Affiliate Performance ------------------------------------
function pageAffPerf(rows) {
  const affList = getRealAffiliates();
  if (!affList.length) return `<div class="empty-state">No affiliates in data.</div>`;
  const sel = ps("affPerfSel", affList[0]);
  if (!affList.includes(sel)) PAGE_STATE.affPerfSel = affList[0];
  const aff = sel;
  const affRows = STATE.rows.filter(r => r.CompanyName === aff);
  const { thisYear: tyA, lastYear: lyA } = splitYears(affRows);
  const m = ps("affTrendMetric", "SaleTotal");

  const optsHtml = affList.map(a => `<option value="${a}" ${a === aff ? "selected" : ""}>${a}</option>`).join("");
  return `
    ${pageHeader("🎯", "Affiliate Performance",
      "Drill into one affiliate's contribution and how they're trending. The picker here overrides the sidebar.")}
    <div class="picker-row">
      <label class="dim-label" for="aff-sel">Affiliate:</label>
      <select id="aff-sel">${optsHtml}</select>
    </div>
    ${kpiRowHtml(kpiBlock(tyA), kpiBlock(lyA))}
    <h3 class="section-h">vs Portfolio average</h3>
    <div id="aff-vs-port" class="plot"></div>
    <h3 class="section-h">Year-over-year</h3>
    <div id="aff-yoy" class="plot"></div>
    <h3 class="section-h">Monthly trend — ${aff}</h3>
    ${metricPickerHtml("aff-trend-metric", m)}
    <div id="aff-trend" class="plot"></div>
    <div class="two-col">
      <div><h3 class="section-h">Sport mix — ${aff} (TY)</h3><div id="aff-sport-pie" class="plot"></div></div>
      <div><h3 class="section-h">Marketplace mix — ${aff} (TY)</h3><div id="aff-mkt-pie" class="plot"></div></div>
    </div>
    <details class="data-expander">
      <summary>📋 Per-sport YoY breakdown for ${aff}</summary>
      <div id="aff-sport-table"></div>
    </details>
  `;
}
function pageAffPerfPost(_rows) {
  const aff = ps("affPerfSel", getRealAffiliates()[0]);
  const affRows = STATE.rows.filter(r => r.CompanyName === aff);
  const { thisYear: tyA } = splitYears(affRows);
  const m = ps("affTrendMetric", "SaleTotal");

  plotAffiliateVsPortfolio("aff-vs-port", STATE.rows, aff);
  plotAffiliateYoy("aff-yoy", affRows);
  plotMonthlyTrend("aff-trend", affRows, m, `Monthly ${metricLabel(m)} — ${aff}`);
  plotPie("aff-sport-pie", tyA, "Sport", "SaleTotal", "Revenue by Sport");
  plotPie("aff-mkt-pie", tyA, "ShippingCompany", "SaleTotal", "Revenue by Marketplace");

  const t = groupYoyTableRows(affRows, "Sport");
  document.getElementById("aff-sport-table").innerHTML =
    buildTable(t, defaultYoyColumns("Sport", "Sport"));
  makeSortable(document.getElementById("aff-sport-table"));

  document.getElementById("aff-sel").addEventListener("change", e => setPs("affPerfSel", e.target.value));
  document.querySelectorAll("#aff-trend-metric .metric-pill").forEach(b => {
    b.addEventListener("click", () => setPs("affTrendMetric", b.dataset.metric));
  });
}


// --- Page 4: Affiliate Leaderboard (table only) -----------------------
function pageLeaderboard(_rows) {
  return `
    ${pageHeader("🏆", "Affiliate Leaderboard",
      "Every affiliate in one sortable table. For visual ranking see YoY Trend Analysis with dimension = Affiliate.")}
    <div id="leaderboard-table"></div>
  `;
}
function pageLeaderboardPost(_rows) {
  const t = groupYoyTableRows(STATE.rows, "CompanyName");
  document.getElementById("leaderboard-table").innerHTML =
    buildTable(t, defaultYoyColumns("CompanyName", "Affiliate"));
  makeSortable(document.getElementById("leaderboard-table"));
}


// --- Page 5: Head-to-Head ---------------------------------------------
function pageH2H(_rows) {
  const affList = getRealAffiliates();
  if (affList.length < 2) return `<div class="empty-state">Need at least two affiliates.</div>`;
  const a = ps("h2hA", affList[0]);
  const b = ps("h2hB", affList[1]);
  if (!affList.includes(a)) PAGE_STATE.h2hA = affList[0];
  if (!affList.includes(b) || b === PAGE_STATE.h2hA)
    PAGE_STATE.h2hB = affList.find(x => x !== PAGE_STATE.h2hA);
  const A = PAGE_STATE.h2hA, B = PAGE_STATE.h2hB;
  const m = ps("h2hMetric", "SaleTotal");

  const aOpts = affList.map(x => `<option value="${x}" ${x === A ? "selected" : ""}>${x}</option>`).join("");
  const bOpts = affList.filter(x => x !== A).map(x => `<option value="${x}" ${x === B ? "selected" : ""}>${x}</option>`).join("");

  const aRows = STATE.rows.filter(r => r.CompanyName === A);
  const bRows = STATE.rows.filter(r => r.CompanyName === B);
  const { thisYear: aTy, lastYear: aLy } = splitYears(aRows);
  const { thisYear: bTy, lastYear: bLy } = splitYears(bRows);
  return `
    ${pageHeader("⚔️", "Affiliate Head-to-Head",
      "Pick two affiliates. KPIs side-by-side, plus a YoY comparison chart you can flip across all four metrics.")}
    <div class="two-col">
      <div><label class="dim-label">Affiliate A:</label><select id="h2h-a">${aOpts}</select></div>
      <div><label class="dim-label">Affiliate B:</label><select id="h2h-b">${bOpts}</select></div>
    </div>
    <h4 class="section-h">${A}</h4>${kpiRowHtml(kpiBlock(aTy), kpiBlock(aLy))}
    <h4 class="section-h">${B}</h4>${kpiRowHtml(kpiBlock(bTy), kpiBlock(bLy))}
    <h3 class="section-h">YoY comparison</h3>
    ${metricPickerHtml("h2h-metric", m)}
    <div id="h2h-bars" class="plot"></div>
    <div class="two-col">
      <div><h3 class="section-h">${A} — sport mix (TY)</h3><div id="h2h-pie-a" class="plot"></div></div>
      <div><h3 class="section-h">${B} — sport mix (TY)</h3><div id="h2h-pie-b" class="plot"></div></div>
    </div>
  `;
}
function pageH2HPost(_rows) {
  const A = PAGE_STATE.h2hA, B = PAGE_STATE.h2hB;
  const m = ps("h2hMetric", "SaleTotal");
  const pair = STATE.rows.filter(r => r.CompanyName === A || r.CompanyName === B);
  const { thisYear: aTy } = splitYears(STATE.rows.filter(r => r.CompanyName === A));
  const { thisYear: bTy } = splitYears(STATE.rows.filter(r => r.CompanyName === B));
  plotYoyBars("h2h-bars", pair, "CompanyName", m);
  plotPie("h2h-pie-a", aTy, "Sport", "SaleTotal", `${A} — Sport mix`);
  plotPie("h2h-pie-b", bTy, "Sport", "SaleTotal", `${B} — Sport mix`);
  document.getElementById("h2h-a").addEventListener("change", e => setPs("h2hA", e.target.value));
  document.getElementById("h2h-b").addEventListener("change", e => setPs("h2hB", e.target.value));
  document.querySelectorAll("#h2h-metric .metric-pill").forEach(btn => {
    btn.addEventListener("click", () => setPs("h2hMetric", btn.dataset.metric));
  });
}


// --- Page 6: Sport Breakdown ------------------------------------------
function pageSport(rows) {
  const { thisYear: thisRows, lastYear: lastRows } = splitYears(rows);
  return `
    ${pageHeader("🏟️", "Sport Breakdown",
      "Sport mix this year + per-sport rollup. For YoY swings see YoY Trend Analysis (dimension = Sport); for margin distributions see Margin Deep Dive.")}
    ${kpiRowHtml(kpiBlock(thisRows), kpiBlock(lastRows))}
    <div class="two-col">
      <div id="sport-rev-pie" class="plot"></div>
      <div id="sport-ord-pie" class="plot"></div>
    </div>
    <details class="data-expander">
      <summary>📋 Per-sport YoY breakdown</summary>
      <div id="sport-table"></div>
    </details>
  `;
}
function pageSportPost(rows) {
  const { thisYear: thisRows } = splitYears(rows);
  plotPie("sport-rev-pie", thisRows, "Sport", "SaleTotal", "Revenue Share (TY)");
  plotPie("sport-ord-pie", thisRows, "Sport", "__count__", "Order Share (TY)");
  const t = groupYoyTableRows(rows, "Sport");
  document.getElementById("sport-table").innerHTML =
    buildTable(t, defaultYoyColumns("Sport", "Sport"));
  makeSortable(document.getElementById("sport-table"));
}


// --- Page 7: Team Performance -----------------------------------------
function pageTeam(_rows) {
  const sportList = getAllSports();
  const m = ps("teamMetric", "Profit");
  const topN = ps("teamTopN", 20);
  const sportSel = ps("teamSports", new Set(sportList));
  const opts = sportList.map(s =>
    `<button class="sport-pill ${sportSel.has(s) ? 'active' : ''}" data-sport="${s}">${s}</button>`
  ).join("");
  return `
    ${pageHeader("🏅", "Team Performance",
      "Per-team rollup with their best- and worst-performing affiliate. Filter by sport to focus on a league.")}
    <div class="picker-row">
      <span class="dim-label">Sports:</span><div id="team-sports">${opts}</div>
    </div>
    <h3 class="section-h">Team rollup (This Year)</h3>
    <div id="team-table"></div>
    <h3 class="section-h">Top teams chart</h3>
    ${metricPickerHtml("team-metric", m)}
    <div class="picker-row"><label>How many teams: <input id="team-topn" type="range" min="5" max="30" step="1" value="${topN}"> <span id="team-topn-val">${topN}</span></label></div>
    <div id="team-chart" class="plot"></div>
  `;
}
function pageTeamPost(_rows) {
  const sportSel = ps("teamSports", new Set(getAllSports()));
  const m = ps("teamMetric", "Profit");
  const topN = ps("teamTopN", 20);
  let work = getScopedData();
  if (sportSel.size && sportSel.size < getAllSports().length) {
    work = work.filter(r => sportSel.has(r.Sport));
  }
  const { thisYear: thisWork } = splitYears(work);
  document.getElementById("team-table").innerHTML = buildTable(teamBreakdownRows(thisWork), [
    { key: "Team", label: "Team", type: "text" },
    { key: "Sport", label: "Sport", type: "text" },
    { key: "Revenue", label: "Revenue", type: "money", gradient: "highGood" },
    { key: "Profit", label: "Profit", type: "money", gradient: "highGood" },
    { key: "Margin %", label: "Margin %", type: "pct", gradient: "highGood" },
    { key: "P/Cost Ratio %", label: "P/Cost Ratio %", type: "pct", gradient: "highGood" },
    { key: "Avg Order", label: "Avg Order", type: "money" },
    { key: "Orders", label: "Orders", type: "int" },
    { key: "Top Affiliate", label: "Top Affiliate", type: "text" },
    { key: "Worst Affiliate", label: "Worst Affiliate", type: "text" },
  ]);
  makeSortable(document.getElementById("team-table"));

  plotYoyBars("team-chart", work, "HomeTeam", m, null, topN);

  document.querySelectorAll("#team-sports .sport-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      const s = btn.dataset.sport;
      const set = new Set(PAGE_STATE.teamSports);
      if (set.has(s)) set.delete(s); else set.add(s);
      setPs("teamSports", set);
    });
  });
  document.querySelectorAll("#team-metric .metric-pill").forEach(btn => {
    btn.addEventListener("click", () => setPs("teamMetric", btn.dataset.metric));
  });
  const slider = document.getElementById("team-topn");
  slider.addEventListener("change", e => setPs("teamTopN", parseInt(e.target.value, 10)));
}


// --- Page 8: Marketplace & Channel ------------------------------------
function pageMarketplace(rows) {
  const { thisYear: thisRows } = splitYears(rows);
  return `
    ${pageHeader("🛒", "Marketplace & Channel",
      "Where the tickets list and how they get delivered. For YoY swings by marketplace see YoY Trend Analysis (dimension = Marketplace).")}
    <div class="two-col">
      <div id="mkt-pie" class="plot"></div>
      <div id="mkt-deliv-pie" class="plot"></div>
    </div>
    <details class="data-expander">
      <summary>📋 Per-marketplace YoY breakdown</summary>
      <div id="mkt-table"></div>
    </details>
  `;
}
function pageMarketplacePost(rows) {
  const { thisYear: thisRows } = splitYears(rows);
  plotPie("mkt-pie", thisRows, "ShippingCompany", "SaleTotal", "Revenue by Marketplace");
  plotPie("mkt-deliv-pie", thisRows, "DeliveryType", "SaleTotal", "Revenue by Delivery Type");
  const t = groupYoyTableRows(rows, "ShippingCompany");
  document.getElementById("mkt-table").innerHTML =
    buildTable(t, defaultYoyColumns("ShippingCompany", "Marketplace"));
  makeSortable(document.getElementById("mkt-table"));
}


// --- Page 9: Margin Deep Dive ----------------------------------------
function pageMargin(rows) {
  const { thisYear: thisRows, lastYear: lastRows } = splitYears(rows);
  return `
    ${pageHeader("💰", "Profit Margin Deep Dive",
      "Margin = (SaleTotal − TicketCost) / SaleTotal. Red dashed line on the histogram is break-even.")}
    ${kpiRowHtml(kpiBlock(thisRows), kpiBlock(lastRows))}
    <div id="margin-hist" class="plot"></div>
    <div class="two-col">
      <div><h3 class="section-h">Cost vs Revenue (TY)</h3><div id="margin-scatter" class="plot"></div></div>
      <div><h3 class="section-h">Loss-making orders (top 20)</h3><div id="margin-losses"></div></div>
    </div>
  `;
}
function pageMarginPost(rows) {
  const { thisYear: thisRows } = splitYears(rows);
  plotHistogram("margin-hist", rows, "ProfitMargin",
    "Profit Margin Distribution",
    { range: [-50, 100], nbins: 60, xlabel: "Margin %", zeroLine: true });
  plotCostVsRevenue("margin-scatter", thisRows);

  const losses = rows.filter(r => r.Profit < 0)
    .sort((a, b) => a.Profit - b.Profit).slice(0, 20)
    .map(r => ({
      Year: r.YearLabel, Affiliate: r.CompanyName,
      Event: r.EventName, Venue: r.VenueName,
      Revenue: r.SaleTotal, Cost: r.TicketCost,
      Profit: r.Profit, "Margin %": r.ProfitMargin,
    }));
  document.getElementById("margin-losses").innerHTML = buildTable(losses, [
    { key: "Year", label: "Year", type: "text" },
    { key: "Affiliate", label: "Affiliate", type: "text" },
    { key: "Event", label: "Event", type: "text" },
    { key: "Revenue", label: "Revenue", type: "money" },
    { key: "Cost", label: "Cost", type: "money" },
    { key: "Profit", label: "Profit", type: "money", gradient: "diverging" },
    { key: "Margin %", label: "Margin %", type: "pct", gradient: "diverging" },
  ]);
  makeSortable(document.getElementById("margin-losses"));
}


// --- Page 10: Ticket Type & Inventory ---------------------------------
function pageTicket(rows) {
  const { thisYear: thisRows } = splitYears(rows);
  const tier = ps("tierChoice", "SectionNumTier");
  const m = ps("ticketPieMetric", "SaleTotal");
  const tierLabel = tier === "SectionNumTier" ? "section tier" : "section type";
  return `
    ${pageHeader("🎫", "Ticket Type & Inventory",
      "Numeric tier (bowl level) vs Type tier (VIP / Lot / Balcony). Toggle below.")}
    <div class="picker-row">
      <button class="metric-pill ${tier === 'SectionNumTier' ? 'active' : ''}" data-tier="SectionNumTier">Numeric tier</button>
      <button class="metric-pill ${tier === 'SectionTypeTier' ? 'active' : ''}" data-tier="SectionTypeTier">Type tier</button>
    </div>
    ${metricPickerHtml("ticket-metric", m, true)}
    <div class="two-col">
      <div><h3 class="section-h">By ${tierLabel} (TY)</h3><div id="ticket-tier-pie" class="plot"></div></div>
      <div><h3 class="section-h">By quantity bucket (TY)</h3><div id="ticket-qty-pie" class="plot"></div></div>
    </div>
    <details class="data-expander">
      <summary>📋 ${tierLabel} YoY breakdown</summary>
      <div id="ticket-tier-table"></div>
    </details>
  `;
}
function pageTicketPost(rows) {
  const { thisYear: thisRows } = splitYears(rows);
  const tier = ps("tierChoice", "SectionNumTier");
  const m = ps("ticketPieMetric", "SaleTotal");
  // Margin/Ratio pies show profit-share as proxy
  const pieValCol = (m === "Orders") ? "__count__"
                  : (m === "Margin" || m === "Ratio") ? "Profit"
                  : m;
  plotPie("ticket-tier-pie", thisRows, tier, pieValCol);
  plotPie("ticket-qty-pie", thisRows, "QuantityBucket", pieValCol);
  const t = groupYoyTableRows(rows, tier);
  document.getElementById("ticket-tier-table").innerHTML =
    buildTable(t, defaultYoyColumns(tier, tier === "SectionNumTier" ? "Tier" : "Type"));
  makeSortable(document.getElementById("ticket-tier-table"));

  document.querySelectorAll("[data-tier]").forEach(btn => {
    btn.addEventListener("click", () => setPs("tierChoice", btn.dataset.tier));
  });
  document.querySelectorAll("#ticket-metric .metric-pill").forEach(btn => {
    btn.addEventListener("click", () => setPs("ticketPieMetric", btn.dataset.metric));
  });
}


// --- Page 11: Geographic Map ------------------------------------------
function pageGeo(rows) {
  const m = ps("geoMetric", "SaleTotal");
  return `
    ${pageHeader("🗺️", "Geographic View",
      "Choropleth based on the home team's state. Both maps share a color scale — same value = same shade across them.")}
    ${metricPickerHtml("geo-metric", m)}
    <div class="two-col">
      <div><h3 class="section-h">This Year</h3><div id="geo-this" class="plot"></div></div>
      <div><h3 class="section-h">Last Year</h3><div id="geo-last" class="plot"></div></div>
    </div>
    <h3 class="section-h">State leaderboard — this vs last</h3>
    <div id="geo-table"></div>
  `;
}
function pageGeoPost(rows) {
  const { thisYear: thisRows, lastYear: lastRows } = splitYears(rows);
  const m = ps("geoMetric", "SaleTotal");
  const zRange = choroplethSharedRange([thisRows, lastRows], m);
  plotChoropleth("geo-this", thisRows, m, "This Year", { zRange });
  plotChoropleth("geo-last", lastRows, m, "Last Year", { zRange });
  const t = groupYoyTableRows(rows, "State");
  document.getElementById("geo-table").innerHTML =
    buildTable(t, defaultYoyColumns("State", "State"));
  makeSortable(document.getElementById("geo-table"));
  document.querySelectorAll("#geo-metric .metric-pill").forEach(btn => {
    btn.addEventListener("click", () => setPs("geoMetric", btn.dataset.metric));
  });
}


// --- Page 12: Heatmap Hub ---------------------------------------------
function pageHeat(rows) {
  const m = ps("heatMetric", "SaleTotal");
  return `
    ${pageHeader("🔥", "Heatmap Hub",
      "Two-dimensional intensity views of the affiliate matrix. Color scale stays blue throughout (red = loss in this dashboard's vocabulary). Sport and Marketplace heatmaps share a z-range when on a sum metric.")}
    ${metricPickerHtml("heat-metric", m)}
    <h3 class="section-h">Affiliate × Sport</h3>
    <div id="heat-sport" class="plot"></div>
    <h3 class="section-h">Affiliate × Marketplace</h3>
    <div id="heat-mkt" class="plot"></div>
    <h3 class="section-h">Affiliate × Top 15 Teams</h3>
    <div id="heat-team" class="plot"></div>
  `;
}
function pageHeatPost(rows) {
  const { thisYear: thisRows } = splitYears(rows);
  const m = ps("heatMetric", "SaleTotal");
  const isSum = (m === "SaleTotal" || m === "Profit");
  let sharedRange = null;
  if (isSum) {
    const sportGrid = buildMetricGrid(thisRows, "CompanyName", "Sport", m).grid;
    const mktGrid   = buildMetricGrid(thisRows, "CompanyName", "MarketplaceTier", m).grid;
    sharedRange = sharedZRange([sportGrid, mktGrid]);
  }
  plotHeatmap("heat-sport", thisRows, "CompanyName", "Sport", m, null,
              { zRange: sharedRange });
  plotHeatmap("heat-mkt", thisRows, "CompanyName", "MarketplaceTier", m, null,
              { zRange: sharedRange });
  plotHeatmap("heat-team", thisRows, "CompanyName", "HomeTeam", m, null,
              { topCols: 15 });
  document.querySelectorAll("#heat-metric .metric-pill").forEach(btn => {
    btn.addEventListener("click", () => setPs("heatMetric", btn.dataset.metric));
  });
}


// --- Page 13: Time Patterns -------------------------------------------
function pageTime(rows) {
  const m = ps("timeMetric", "SaleTotal");
  return `
    ${pageHeader("⏰", "Time Patterns",
      "When in the week sales actually happen + lead-time effects. For YoY by lead time see YoY Trend Analysis (dimension = Lead time bucket).")}
    <h3 class="section-h">When sales happen</h3>
    ${metricPickerHtml("time-metric", m)}
    <div id="time-heat" class="plot"></div>
    <h3 class="section-h">Lead-time distribution</h3>
    <div id="time-leadhist" class="plot"></div>
  `;
}
function pageTimePost(rows) {
  const m = ps("timeMetric", "SaleTotal");
  plotDayHourHeat("time-heat", rows, m);
  plotHistogram("time-leadhist", rows, "LeadTimeDays",
    "Lead time (days from sale to event)",
    { range: [0, 365], nbins: 50, xlabel: "Lead time (days)" });
  document.querySelectorAll("#time-metric .metric-pill").forEach(btn => {
    btn.addEventListener("click", () => setPs("timeMetric", btn.dataset.metric));
  });
}


// --- Page 14: Top Events ----------------------------------------------
function pageTopEvents(rows) {
  const m = ps("topEventsMetric", "Profit");
  const n = ps("topEventsN", 20);
  return `
    ${pageHeader("⭐", "Top Events",
      "Highest-performing events on the metric of your choice, and the worst margin offenders.")}
    ${metricPickerHtml("topevents-metric", m, true)}
    <div class="picker-row">
      <label>How many events: <input id="topevents-n" type="range" min="5" max="50" step="1" value="${n}"> <span>${n}</span></label>
    </div>
    <h3 class="section-h" id="topevents-title">Top events</h3>
    <div id="topevents-table"></div>
    <h3 class="section-h">Bottom 15 by profit</h3>
    <div id="topevents-bottom"></div>
  `;
}
function pageTopEventsPost(rows) {
  const m = ps("topEventsMetric", "Profit");
  const n = ps("topEventsN", 20);
  const events = eventRollupRows(rows);
  const sortKey = ({
    SaleTotal: "Revenue", Profit: "Profit",
    Margin: "Margin %", Ratio: "P/Cost Ratio %", Orders: "Orders",
  })[m];
  const top = [...events].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0)).slice(0, n);
  const bottom = [...events].sort((a, b) => (a.Profit || 0) - (b.Profit || 0)).slice(0, 15);
  document.getElementById("topevents-title").textContent = `Top ${n} events by ${sortKey}`;
  const cols = [
    { key: "Event", label: "Event", type: "text" },
    { key: "Venue", label: "Venue", type: "text" },
    { key: "Revenue", label: "Revenue", type: "money", gradient: "highGood" },
    { key: "Profit", label: "Profit", type: "money", gradient: "highGood" },
    { key: "Margin %", label: "Margin %", type: "pct", gradient: "highGood" },
    { key: "P/Cost Ratio %", label: "P/Cost Ratio %", type: "pct", gradient: "highGood" },
    { key: "Orders", label: "Orders", type: "int" },
    { key: "Tickets", label: "Tickets", type: "int" },
  ];
  document.getElementById("topevents-table").innerHTML = buildTable(top, cols);
  document.getElementById("topevents-bottom").innerHTML = buildTable(bottom, cols);
  makeSortable(document.getElementById("topevents-table"));
  makeSortable(document.getElementById("topevents-bottom"));

  document.querySelectorAll("#topevents-metric .metric-pill").forEach(btn => {
    btn.addEventListener("click", () => setPs("topEventsMetric", btn.dataset.metric));
  });
  document.getElementById("topevents-n").addEventListener("change", e =>
    setPs("topEventsN", parseInt(e.target.value, 10)));
}


// --- Page 15: Risk & Delivery -----------------------------------------
function pageRisk(rows) {
  const { thisYear: thisRows, lastYear: lastRows } = splitYears(rows);
  const total = thisRows.length;
  const delivered = countWhere(thisRows, r => r.IsDelivered);
  const undelivered = total - delivered;
  const cancelled = countWhere(thisRows, r => r.IsCancelled);
  const expired = countWhere(thisRows, r => r.IsExpired);
  const deliveryRate = total > 0 ? (delivered / total * 100) : 0;

  return `
    ${pageHeader("⚠️", "Risk & Delivery",
      "Delivery rate, undelivered orders, cancellations, expirations.")}
    <div class="kpi-row">
      <div class="kpi-card"><div class="kpi-label">Delivery Rate</div><div class="kpi-value">${deliveryRate.toFixed(1)}%</div></div>
      <div class="kpi-card"><div class="kpi-label">Undelivered</div><div class="kpi-value">${fmtInt(undelivered)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Cancelled</div><div class="kpi-value">${fmtInt(cancelled)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Expired</div><div class="kpi-value">${fmtInt(expired)}</div></div>
    </div>
    <h3 class="section-h">Undelivered orders by affiliate (TY)</h3>
    <div id="risk-und"></div>
    <h3 class="section-h">Cancellations last year, by affiliate</h3>
    <div id="risk-canc"></div>
    <details class="data-expander">
      <summary>📋 Delivery rate by affiliate</summary>
      <div id="risk-rate"></div>
    </details>
  `;
}
function pageRiskPost(rows) {
  const { thisYear: thisRows, lastYear: lastRows } = splitYears(rows);

  // Undelivered by affiliate
  const undRows = thisRows.filter(r => !r.IsDelivered);
  const byAffUnd = {};
  undRows.forEach(r => {
    if (!byAffUnd[r.CompanyName]) byAffUnd[r.CompanyName] = { Affiliate: r.CompanyName, Undelivered: 0, "Lost Revenue": 0 };
    byAffUnd[r.CompanyName].Undelivered += 1;
    byAffUnd[r.CompanyName]["Lost Revenue"] += r.SaleTotal || 0;
  });
  const undList = Object.values(byAffUnd).sort((a, b) => b["Lost Revenue"] - a["Lost Revenue"]);
  document.getElementById("risk-und").innerHTML = buildTable(undList, [
    { key: "Affiliate", label: "Affiliate", type: "text" },
    { key: "Undelivered", label: "Undelivered", type: "int", gradient: "lowGood" },
    { key: "Lost Revenue", label: "Lost Revenue", type: "money", gradient: "lowGood" },
  ]);
  makeSortable(document.getElementById("risk-und"));

  // Cancellations LY
  const cancRows = lastRows.filter(r => r.IsCancelled);
  const byAffCanc = {};
  cancRows.forEach(r => {
    if (!byAffCanc[r.CompanyName]) byAffCanc[r.CompanyName] = { Affiliate: r.CompanyName, Cancellations: 0, "Lost Revenue": 0 };
    byAffCanc[r.CompanyName].Cancellations += 1;
    byAffCanc[r.CompanyName]["Lost Revenue"] += r.SaleTotal || 0;
  });
  const cancList = Object.values(byAffCanc).sort((a, b) => b.Cancellations - a.Cancellations);
  document.getElementById("risk-canc").innerHTML = buildTable(cancList, [
    { key: "Affiliate", label: "Affiliate", type: "text" },
    { key: "Cancellations", label: "Cancellations", type: "int", gradient: "lowGood" },
    { key: "Lost Revenue", label: "Lost Revenue", type: "money", gradient: "lowGood" },
  ]);
  makeSortable(document.getElementById("risk-canc"));

  // Delivery rate
  const byAffRate = {};
  thisRows.forEach(r => {
    if (!byAffRate[r.CompanyName]) byAffRate[r.CompanyName] = { Affiliate: r.CompanyName, Orders: 0, Delivered: 0 };
    byAffRate[r.CompanyName].Orders += 1;
    if (r.IsDelivered) byAffRate[r.CompanyName].Delivered += 1;
  });
  const rateList = Object.values(byAffRate).map(o => ({
    ...o,
    "Delivery Rate %": o.Orders > 0 ? +(o.Delivered / o.Orders * 100).toFixed(1) : 0,
  })).sort((a, b) => a["Delivery Rate %"] - b["Delivery Rate %"]);
  document.getElementById("risk-rate").innerHTML = buildTable(rateList, [
    { key: "Affiliate", label: "Affiliate", type: "text" },
    { key: "Orders", label: "Orders", type: "int" },
    { key: "Delivered", label: "Delivered", type: "int" },
    { key: "Delivery Rate %", label: "Delivery Rate %", type: "pct", gradient: "highGood" },
  ]);
  makeSortable(document.getElementById("risk-rate"));
}


/* =========================================================================
   PAGE DISPATCH
========================================================================= */

const PAGE_FUNCS = {
  exec:        { html: pageExec,         post: pageExecPost },
  yoy:         { html: pageYoy,          post: pageYoyPost },
  affPerf:     { html: pageAffPerf,      post: pageAffPerfPost },
  leaderboard: { html: pageLeaderboard,  post: pageLeaderboardPost },
  h2h:         { html: pageH2H,          post: pageH2HPost },
  sport:       { html: pageSport,        post: pageSportPost },
  team:        { html: pageTeam,         post: pageTeamPost },
  marketplace: { html: pageMarketplace,  post: pageMarketplacePost },
  margin:      { html: pageMargin,       post: pageMarginPost },
  ticket:      { html: pageTicket,       post: pageTicketPost },
  geo:         { html: pageGeo,          post: pageGeoPost },
  heat:        { html: pageHeat,         post: pageHeatPost },
  time:        { html: pageTime,         post: pageTimePost },
  topEvents:   { html: pageTopEvents,    post: pageTopEventsPost },
  risk:        { html: pageRisk,         post: pageRiskPost },
};

function affiliateLabel() {
  return STATE.affiliate === "__ALL__" ? "All Affiliates" : STATE.affiliate;
}

function renderPage() {
  try {
    const rows = getScopedData();
    if (!rows || rows.length === 0) {
      document.getElementById("main-content").innerHTML = 
        `<div class="empty-state">No data in scope. Check your filters or reload the data.</div>`;
      return;
    }
    
    const def = PAGE_FUNCS[STATE.page];
    if (!def) {
      console.error("No page function for", STATE.page);
      document.getElementById("main-content").innerHTML = 
        `<div class="empty-state">Page not found: ${STATE.page}</div>`;
      return;
    }
    
    // Render HTML
    const html = def.html(rows);
    if (!html) {
      console.error("Page HTML function returned nothing");
      return;
    }
    document.getElementById("main-content").innerHTML = html;
    
    // Run post-render setup (charts, event handlers)
    if (def.post) {
      def.post(rows);
    }
  } catch (err) {
    console.error("Error rendering page:", err);
    document.getElementById("main-content").innerHTML = 
      `<div class="empty-state">⚠️ Error rendering page: ${err.message}</div>`;
  }
}


/* =========================================================================
   APP SHELL
========================================================================= */

function buildSidebar() {
  try {
    const pageHtml = PAGE_REGISTRY.map((p, i) =>
      `<div class="page-link ${p.id === STATE.page ? "active" : ""}" data-page="${p.id}">
         <span class="page-icon">${p.icon}</span>
         <span class="page-title">${i + 1}. ${p.title}</span>
       </div>`
    ).join("");

    // Affiliate dropdown
    const affs = ["__ALL__", ...getRealAffiliates()];
    const affOpts = affs.map(a =>
      `<option value="${a}" ${a === STATE.affiliate ? "selected" : ""}>${a === "__ALL__" ? "All Affiliates" : a}</option>`
    ).join("");

    // Sport multi-select pills
    const sports = getAllSports();
    const sportSel = STATE.sports || new Set(sports);
    const sportPills = sports.map(s =>
      `<button class="sport-pill ${sportSel.has(s) ? 'active' : ''}" data-sport="${s}">${s}</button>`
    ).join("");

    document.getElementById("sidebar").innerHTML = `
      <div class="sidebar-title">🎟️ Ticket Sales Dashboard</div>
      <div class="sidebar-pages">${pageHtml}</div>
      <div class="sidebar-divider"></div>
      <div class="sidebar-section-label">Global filters</div>
      <label class="sidebar-filter-label">Affiliate</label>
      <select id="aff-filter" class="sidebar-filter">${affOpts}</select>
      <label class="sidebar-filter-label">Sports (deselect to filter)</label>
      <div id="sport-filter" class="sport-pills">${sportPills}</div>
      <div class="sidebar-divider"></div>
      <div class="sidebar-stats">
        <div>Rows in scope: <b>${getScopedData().length.toLocaleString()}</b></div>
        <div>This Year: <b>${getScopedData().filter(r => r.YearLabel === 'This Year').length.toLocaleString()}</b></div>
        <div>Last Year: <b>${getScopedData().filter(r => r.YearLabel === 'Last Year').length.toLocaleString()}</b></div>
      </div>
    `;

    // Wire up page links
    document.querySelectorAll(".page-link").forEach(link => {
      link.addEventListener("click", () => {
        STATE.page = link.dataset.page;
        // Reset per-page state when changing pages
        Object.keys(PAGE_STATE).forEach(k => delete PAGE_STATE[k]);
        buildSidebar(); renderPage();
      });
    });
    document.getElementById("aff-filter").addEventListener("change", e => {
      STATE.affiliate = e.target.value;
      buildSidebar(); renderPage();
    });
    document.querySelectorAll("#sport-filter .sport-pill").forEach(btn => {
      btn.addEventListener("click", () => {
        const set = new Set(STATE.sports || getAllSports());
        const s = btn.dataset.sport;
        if (set.has(s)) set.delete(s); else set.add(s);
        STATE.sports = (set.size === getAllSports().length) ? null : set;
        buildSidebar(); renderPage();
      });
    });
  } catch (err) {
    console.error("Error building sidebar:", err);
  }
}


/* =========================================================================
   FILE UPLOAD + INIT
========================================================================= */

async function loadCsvFile(file, yearLabel) {
  const rows = await parseCsv(file);
  return rows.map(r => enrichRow(r, yearLabel));
}

async function handleUpload() {
  const thisFile = document.getElementById("file-this").files[0];
  const lastFile = document.getElementById("file-last").files[0];
  if (!thisFile || !lastFile) {
    document.getElementById("upload-status").textContent = "❌ Please select BOTH files.";
    return;
  }
  
  // Sanity check: files should have some size
  if (thisFile.size === 0 || lastFile.size === 0) {
    document.getElementById("upload-status").textContent = "❌ One or both files are empty.";
    return;
  }
  
  // Check PapaParse is available
  if (typeof Papa === 'undefined') {
    document.getElementById("upload-status").textContent = "❌ PapaParse library failed to load. Try reloading the page.";
    return;
  }
  
  document.getElementById("upload-status").textContent = "⏳ Loading and parsing CSVs…";
  try {
    const [thisRows, lastRows] = await Promise.all([
      loadCsvFile(thisFile, "This Year"),
      loadCsvFile(lastFile, "Last Year"),
    ]);
    
    // Sanity check the result
    if (!thisRows || !lastRows || thisRows.length === 0 || lastRows.length === 0) {
      throw new Error("One or both files parsed but contained no data rows.");
    }
    
    STATE.rows = [...thisRows, ...lastRows];
    document.getElementById("upload-status").textContent = "✅ Loaded! Initializing…";
    
    // Brief delay for visual feedback, then switch screens
    setTimeout(() => {
      document.getElementById("upload-screen").style.display = "none";
      document.getElementById("app-shell").style.display = "flex";
      buildSidebar();
      renderPage();
    }, 500);
  } catch (err) {
    console.error("Upload error:", err);
    document.getElementById("upload-status").textContent = 
      "❌ Error: " + (err.message || String(err)).substring(0, 100);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const uploadBtn = document.getElementById("upload-btn");
  const fileThis = document.getElementById("file-this");
  const fileLast = document.getElementById("file-last");
  
  if (!uploadBtn || !fileThis || !fileLast) {
    console.error("Upload elements not found in DOM. Check index.html.");
    return;
  }
  
  uploadBtn.addEventListener("click", handleUpload);
  
  // Show visual feedback when files are selected
  fileThis.addEventListener("change", (e) => {
    const label = document.querySelector('label[for="file-this"] .file-drop-hint');
    if (label && e.target.files[0]) {
      label.textContent = "✓ " + e.target.files[0].name;
    }
  });
  fileLast.addEventListener("change", (e) => {
    const label = document.querySelector('label[for="file-last"] .file-drop-hint');
    if (label && e.target.files[0]) {
      label.textContent = "✓ " + e.target.files[0].name;
    }
  });
  
  // Also allow Enter key to trigger upload (accessibility)
  document.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && document.getElementById("upload-screen").style.display !== "none") {
      handleUpload();
    }
  });
});
