import { useState, useEffect, useRef } from "react";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import "./App.css";

const client = new DynamoDBClient({
  region: import.meta.env.VITE_AWS_REGION,
  credentials: {
    accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
  },
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = import.meta.env.VITE_DYNAMODB_TABLE;

async function fetchAllEvents() {
  let items = [];
  let lastKey = undefined;
  do {
    const res = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      ExclusiveStartKey: lastKey,
    }));
    items = items.concat(res.Items || []);
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

const TABS = ["Overview", "Campaigns", "Audience", "Geography", "Fraud"];

// FIX 1: Brighter palette so legend text is readable
const PALETTE = ["#c8ff00", "#ffffff", "#aaaaaa", "#888888", "#555555"];

export default function Dashboard() {
  const [events, setEvents] = useState([]);
  const [activeTab, setActiveTab] = useState("Overview");
  const [countdown, setCountdown] = useState(5);
  const [loading, setLoading] = useState(true);
  const countdownRef = useRef(null);

  const loadData = async () => {
    try {
      const data = await fetchAllEvents();
      setEvents(data);
      setCountdown(5);
      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const iv = setInterval(loadData, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((p) => (p <= 1 ? 5 : p - 1));
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [events]);

  return (
    <div className="db-root">
      <aside className="db-sidebar">
        <div className="db-logo">
          <span className="db-logo-dot" />
          <span>AdPulse</span>
        </div>
        <nav className="db-nav">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`db-nav-item ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              <span className="db-nav-icon">{TAB_ICONS[tab]}</span>
              {tab}
            </button>
          ))}
        </nav>
        <div className="db-sidebar-footer">
          <div className="db-pulse" />
          <span>Live · refresh in {countdown}s</span>
        </div>
      </aside>

      <main className="db-main">
        <header className="db-header">
          <div>
            <h1 className="db-page-title">{activeTab}</h1>
            {/* FIX 2: subtitle color bumped to visible #999 */}
            <p className="db-page-sub" style={{ color: "#999" }}>Real-time ad event analytics</p>
          </div>
          <div className="db-header-right">
            <span className="db-total-badge">{events.length.toLocaleString()} events</span>
          </div>
        </header>

        {loading ? (
          <div className="db-loading">Loading data from DynamoDB...</div>
        ) : (
          <div className="db-content">
            {activeTab === "Overview"  && <Overview events={events} />}
            {activeTab === "Campaigns" && <Campaigns events={events} />}
            {activeTab === "Audience"  && <Audience events={events} />}
            {activeTab === "Geography" && <Geography events={events} />}
            {activeTab === "Fraud"     && <Fraud events={events} />}
          </div>
        )}
      </main>
    </div>
  );
}

const TAB_ICONS = {
  Overview:  "▦",
  Campaigns: "◈",
  Audience:  "◉",
  Geography: "◎",
  Fraud:     "◬",
};

// ─── Shared tooltip / axis config ─────────────────────────────────────────────

const TIP = {
  contentStyle: { background: "#111", border: "1px solid #2a2a2a", color: "#fff", fontSize: 12 },
  cursor: { fill: "rgba(255,255,255,0.03)" },
};

// FIX 3: All axis tick colours raised from #555 → #bbb so numbers are clearly readable
const TICK = { fill: "#bbb", fontSize: 11 };
const AXIS_LINE = { stroke: "#333" };

// ─── Shared Components ────────────────────────────────────────────────────────

function KPI({ label, value, sub, accent }) {
  return (
    <div className="db-kpi">
      {/* FIX 4: label colour raised to #aaa */}
      <span className="db-kpi-label" style={{ color: "#aaa" }}>{label}</span>
      <span className="db-kpi-value" style={{ color: accent || "#fff" }}>{value}</span>
      {sub && <span className="db-kpi-sub">{sub}</span>}
    </div>
  );
}

function Panel({ title, children, full }) {
  return (
    <div className={`db-panel ${full ? "full" : ""}`}>
      {/* FIX 5: panel title colour raised to #bbb */}
      <p className="db-panel-title" style={{ color: "#bbb" }}>{title}</p>
      {children}
    </div>
  );
}

// FIX 6: Custom legend so text is always readable (Recharts default wraps inside SVG and clips)
function CustomLegend({ items }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px", marginTop: 10, justifyContent: "center" }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "#bbb", whiteSpace: "nowrap" }}>{item.name}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function Overview({ events }) {
  const total = events.length;
  const fraud = events.filter((e) => e.fraud_type).length;
  const revenue = events.reduce((s, e) => s + (e.conversion_value || 0), 0);
  const conversions = events.filter((e) => e.event_type === "conversion").length;

  const typeMap = {};
  events.forEach((e) => { typeMap[e.event_type] = (typeMap[e.event_type] || 0) + 1; });
  const typeData = Object.entries(typeMap).map(([name, value]) => ({ name, value }));

  const timeMap = {};
  events.forEach((e) => {
    if (!e.timestamp) return;
    const m = e.timestamp.slice(0, 16);
    timeMap[m] = (timeMap[m] || 0) + 1;
  });
  const timeData = Object.entries(timeMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-20)
    .map(([t, count]) => ({ t: t.slice(11), count }));

  return (
    <>
      <div className="db-kpi-row">
        <KPI label="Total Events"   value={total.toLocaleString()}          accent="#c8ff00" />
        <KPI label="Total Revenue"  value={`₹${revenue.toLocaleString()}`}  accent="#fff" />
        <KPI label="Conversions"    value={conversions.toLocaleString()}     accent="#aaa" />
        <KPI label="Fraud Detected" value={fraud.toLocaleString()}           accent="#ff4444" />
      </div>

      <div className="db-panels">
        <Panel title="EVENT VOLUME OVER TIME" full>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timeData}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#c8ff00" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#c8ff00" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" {...AXIS_LINE} tick={TICK} />
              <YAxis {...AXIS_LINE} tick={TICK} />
              <Tooltip {...TIP} />
              <Area type="monotone" dataKey="count" stroke="#c8ff00" strokeWidth={1.5} fill="url(#areaGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        {/* FIX 7: Donut chart — added bottom padding so legend doesn't overlap the ring */}
        <Panel title="EVENTS BY TYPE">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie
                data={typeData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="45%"
                innerRadius={50}
                outerRadius={80}
              >
                {typeData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip {...TIP} />
            </PieChart>
          </ResponsiveContainer>
          <CustomLegend items={typeData.map((t, i) => ({ name: t.name, color: PALETTE[i % PALETTE.length] }))} />
        </Panel>

        <Panel title="TYPE BREAKDOWN">
          <div className="db-breakdown">
            {typeData.map((t, i) => (
              <div key={t.name} className="db-breakdown-row">
                <span className="db-breakdown-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
                {/* FIX 8: breakdown name colour raised */}
                <span className="db-breakdown-name" style={{ color: "#bbb" }}>{t.name}</span>
                <div className="db-breakdown-bar-wrap">
                  <div className="db-breakdown-bar" style={{
                    width: `${total ? (t.value / total) * 100 : 0}%`,
                    background: PALETTE[i % PALETTE.length]
                  }} />
                </div>
                <span className="db-breakdown-pct" style={{ color: "#bbb" }}>
                  {total ? ((t.value / total) * 100).toFixed(1) : 0}%
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

// ─── Campaigns ────────────────────────────────────────────────────────────────
function Campaigns({ events }) {
  const cMap = {};
  events.forEach((e) => {
    const c = e.campaign_id || "unknown";
    if (!cMap[c]) cMap[c] = { events: 0, revenue: 0 };
    cMap[c].events++;
    cMap[c].revenue += e.conversion_value || 0;
  });
  const cData = Object.entries(cMap).map(([name, v]) => ({ name, ...v }));

  const chMap = {};
  events.forEach((e) => { const c = e.channel || "unknown"; chMap[c] = (chMap[c] || 0) + 1; });
  const chData = Object.entries(chMap).map(([name, value]) => ({ name, value }));

  const adMap = {};
  events.forEach((e) => { const a = e.ad_id || "unknown"; adMap[a] = (adMap[a] || 0) + 1; });
  const adData = Object.entries(adMap).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }));

  // FIX 9: compute max so domain forces all ticks to show on horizontal bar charts
  const chMax = Math.max(...chData.map((d) => d.value), 1);
  const adMax = Math.max(...adData.map((d) => d.value), 1);

  return (
    <div className="db-panels">
      <Panel title="CAMPAIGN PERFORMANCE" full>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={cData} barGap={4}>
            <XAxis dataKey="name" {...AXIS_LINE} tick={TICK} />
            <YAxis {...AXIS_LINE} tick={TICK} />
            <Tooltip {...TIP} />
            <Bar dataKey="events"  fill="#c8ff00" radius={[3,3,0,0]} name="Events" />
            <Bar dataKey="revenue" fill="#444"    radius={[3,3,0,0]} name="Revenue" />
            <Legend wrapperStyle={{ color: "#bbb", fontSize: 12 }} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* FIX 10: BY CHANNEL — explicit domain + tickCount so every value shows */}
      <Panel title="BY CHANNEL">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chData} layout="vertical">
            <XAxis
              type="number"
              {...AXIS_LINE}
              tick={TICK}
              domain={[0, Math.ceil(chMax * 1.1)]}
              tickCount={6}
              allowDecimals={false}
            />
            <YAxis
              dataKey="name"
              type="category"
              {...AXIS_LINE}
              tick={TICK}
              width={80}
            />
            <Tooltip {...TIP} />
            <Bar dataKey="value" fill="#fff" radius={[0,3,3,0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* FIX 11: TOP ADS — same fix */}
      <Panel title="TOP ADS">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={adData} layout="vertical">
            <XAxis
              type="number"
              {...AXIS_LINE}
              tick={TICK}
              domain={[0, Math.ceil(adMax * 1.1)]}
              tickCount={6}
              allowDecimals={false}
            />
            <YAxis
              dataKey="name"
              type="category"
              {...AXIS_LINE}
              tick={TICK}
              width={60}
            />
            <Tooltip {...TIP} />
            <Bar dataKey="value" fill="#aaa" radius={[0,3,3,0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

// ─── Audience ─────────────────────────────────────────────────────────────────
function Audience({ events }) {
  const ageMap = {}, genMap = {}, segMap = {};
  events.forEach((e) => {
    const u = e.user || {};
    if (u.age_group) ageMap[u.age_group] = (ageMap[u.age_group] || 0) + 1;
    if (u.gender)    genMap[u.gender]    = (genMap[u.gender]    || 0) + 1;
    if (u.segment)   segMap[u.segment]   = (segMap[u.segment]   || 0) + 1;
  });

  const ageData = Object.entries(ageMap).map(([name, value]) => ({ name, value }));
  const genData = Object.entries(genMap).map(([name, value]) => ({ name, value }));
  const segData = Object.entries(segMap).map(([name, value]) => ({ name, value }));

  return (
    <div className="db-panels">
      <Panel title="AGE GROUP DISTRIBUTION">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={ageData}>
            <XAxis dataKey="name" {...AXIS_LINE} tick={TICK} />
            <YAxis {...AXIS_LINE} tick={TICK} />
            <Tooltip {...TIP} />
            <Bar dataKey="value" fill="#c8ff00" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* FIX 12: Gender donut — cy shifted up + CustomLegend below so ring is never covered */}
      <Panel title="GENDER SPLIT">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={genData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="45%"
              innerRadius={50}
              outerRadius={80}
            >
              {genData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip {...TIP} />
          </PieChart>
        </ResponsiveContainer>
        <CustomLegend items={genData.map((g, i) => ({ name: g.name, color: PALETTE[i % PALETTE.length] }))} />
      </Panel>

      <Panel title="USER SEGMENTS" full>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={segData}>
            <XAxis dataKey="name" {...AXIS_LINE} tick={TICK} />
            <YAxis {...AXIS_LINE} tick={TICK} />
            <Tooltip {...TIP} />
            <Bar dataKey="value" fill="#fff" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

// ─── Geography ────────────────────────────────────────────────────────────────
function Geography({ events }) {
  const cityMap = {}, devMap = {}, osMap = {};
  events.forEach((e) => {
    const city = e.geo?.city || "unknown";
    cityMap[city] = (cityMap[city] || 0) + 1;
    const dev = e.device?.device_type || "unknown";
    devMap[dev] = (devMap[dev] || 0) + 1;
    const os = e.device?.os || "unknown";
    osMap[os] = (osMap[os] || 0) + 1;
  });

  const cityData = Object.entries(cityMap).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  const devData  = Object.entries(devMap).map(([name, value]) => ({ name, value }));
  const osData   = Object.entries(osMap).map(([name, value]) => ({ name, value }));
  const osMax    = Math.max(...osData.map((d) => d.value), 1);

  return (
    <div className="db-panels">
      <Panel title="EVENTS BY CITY" full>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={cityData}>
            <XAxis dataKey="name" {...AXIS_LINE} tick={TICK} />
            <YAxis {...AXIS_LINE} tick={TICK} />
            <Tooltip {...TIP} />
            <Bar dataKey="value" fill="#c8ff00" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* FIX 13: Device donut — same legend fix */}
      <Panel title="DEVICE TYPE">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={devData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="45%"
              innerRadius={50}
              outerRadius={80}
            >
              {devData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip {...TIP} />
          </PieChart>
        </ResponsiveContainer>
        <CustomLegend items={devData.map((d, i) => ({ name: d.name, color: PALETTE[i % PALETTE.length] }))} />
      </Panel>

      <Panel title="OPERATING SYSTEM">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={osData} layout="vertical">
            <XAxis
              type="number"
              {...AXIS_LINE}
              tick={TICK}
              domain={[0, Math.ceil(osMax * 1.1)]}
              tickCount={6}
              allowDecimals={false}
            />
            <YAxis dataKey="name" type="category" {...AXIS_LINE} tick={TICK} width={70} />
            <Tooltip {...TIP} />
            <Bar dataKey="value" fill="#aaa" radius={[0,3,3,0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

// ─── Fraud ────────────────────────────────────────────────────────────────────
function Fraud({ events }) {
  const fraudEvents = events.filter((e) => e.fraud_type);
  const ftMap = {};
  fraudEvents.forEach((e) => { ftMap[e.fraud_type] = (ftMap[e.fraud_type] || 0) + 1; });
  const ftData = Object.entries(ftMap).map(([name, value]) => ({ name, value }));

  const timeMap = {};
  fraudEvents.forEach((e) => {
    if (!e.timestamp) return;
    const m = e.timestamp.slice(0, 16);
    timeMap[m] = (timeMap[m] || 0) + 1;
  });
  const timeData = Object.entries(timeMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-20)
    .map(([t, count]) => ({ t: t.slice(11), count }));

  const rate = events.length ? ((fraudEvents.length / events.length) * 100).toFixed(2) : 0;

  return (
    <>
      <div className="db-kpi-row">
        <KPI label="Fraud Events" value={fraudEvents.length.toLocaleString()} accent="#ff4444" />
        <KPI label="Fraud Rate"   value={`${rate}%`}                          accent="#ff4444" />
        <KPI label="Fraud Types"  value={Object.keys(ftMap).length}           accent="#fff" />
      </div>

      <div className="db-panels">
        <Panel title="FRAUD TREND OVER TIME" full>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timeData}>
              <defs>
                <linearGradient id="fraudGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#ff4444" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ff4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" {...AXIS_LINE} tick={TICK} />
              <YAxis {...AXIS_LINE} tick={TICK} />
              <Tooltip {...TIP} />
              <Area type="monotone" dataKey="count" stroke="#ff4444" strokeWidth={1.5} fill="url(#fraudGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        {/*
          FIX 14: Fraud page layout
          — Donut + Breakdown are now in a dedicated 2-col sub-grid so they sit
            side by side and NEVER overlap each other or the trend chart above.
          — Donut uses cy="45%" + CustomLegend below (not inside SVG canvas).
        */}
        <div
          className="full"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            width: "100%",
          }}
        >
          <Panel title="FRAUD BY TYPE">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={ftData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={80}
                >
                  {ftData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip {...TIP} />
              </PieChart>
            </ResponsiveContainer>
            <CustomLegend items={ftData.map((t, i) => ({ name: t.name, color: PALETTE[i % PALETTE.length] }))} />
          </Panel>

          <Panel title="TYPE BREAKDOWN">
            <div className="db-breakdown">
              {ftData.map((t, i) => (
                <div key={t.name} className="db-breakdown-row">
                  <span className="db-breakdown-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <span className="db-breakdown-name" style={{ fontSize: 11, color: "#bbb" }}>{t.name}</span>
                  <div className="db-breakdown-bar-wrap">
                    <div className="db-breakdown-bar" style={{
                      width: `${fraudEvents.length ? (t.value / fraudEvents.length) * 100 : 0}%`,
                      background: PALETTE[i % PALETTE.length]
                    }} />
                  </div>
                  <span className="db-breakdown-pct" style={{ color: "#bbb" }}>
                    {fraudEvents.length ? ((t.value / fraudEvents.length) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
