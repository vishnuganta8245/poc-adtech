import { useState, useEffect, useRef } from "react";
import "./App.css";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement,
  Filler, Tooltip, Legend,
} from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement,
  Filler, Tooltip, Legend
);

const METRICS_URL = import.meta.env.VITE_METRICS_URL;

const PALETTE = [
  "#c8ff00", "#00d4ff", "#ff6b6b", "#ffd166",
  "#06ffa5", "#a78bfa", "#fb923c", "#38bdf8",
];

const CHART_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "#1e2130",
      borderColor: "#2a2d3a",
      borderWidth: 1,
      titleColor: "#e8eaf0",
      bodyColor: "#8b8fa8",
      padding: 10,
      cornerRadius: 6,
    },
  },
  scales: {
    x: {
      grid: { color: "#2a2d3a", lineWidth: 0.5 },
      ticks: { color: "#6b6f84", font: { size: 11 } },
      border: { color: "#2a2d3a" },
    },
    y: {
      grid: { color: "#2a2d3a", lineWidth: 0.5 },
      ticks: { color: "#6b6f84", font: { size: 11 } },
      border: { color: "#2a2d3a" },
    },
  },
};

const PIE_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  plugins: {
    legend: {
      display: true,
      position: "bottom",
      labels: { color: "#8b8fa8", boxWidth: 10, padding: 12, font: { size: 11 } },
    },
    tooltip: {
      backgroundColor: "#1e2130",
      borderColor: "#2a2d3a",
      borderWidth: 1,
      titleColor: "#e8eaf0",
      bodyColor: "#8b8fa8",
      padding: 10,
    },
  },
};

// ── Mock data for preview ──────────────────────────────────────────────
const MOCK = {
  totalEvents: 148320,
  totalImpressions: 120000,
  totalClicks: 18500,
  totalConversions: 4312,
  totalRevenue: 2847650,
  ctr: "15.42",
  conversionRate: "8.21",
  timeSeriesEvents: [
    { t: "10:00", count: 1200 }, { t: "10:30", count: 1850 },
    { t: "11:00", count: 2200 }, { t: "11:30", count: 1980 },
    { t: "12:00", count: 2700 }, { t: "12:30", count: 3100 },
    { t: "13:00", count: 2850 }, { t: "13:30", count: 3400 },
    { t: "14:00", count: 3750 }, { t: "14:30", count: 4100 },
  ],
  byGender: [{ name: "Male", value: 52 }, { name: "Female", value: 41 }, { name: "Other", value: 7 }],
  byAge: [{ name: "18–24", value: 28 }, { name: "25–34", value: 38 }, { name: "35–44", value: 22 }, { name: "45+", value: 12 }],
  bySegment: [{ name: "Premium", value: 35 }, { name: "Regular", value: 45 }, { name: "New", value: 20 }],
  byCity: [{ name: "Mumbai", value: 9200 }, { name: "Delhi", value: 8100 }, { name: "Bangalore", value: 7400 }, { name: "Hyderabad", value: 5600 }, { name: "Chennai", value: 4200 }],
  byChannel: [{ name: "Organic", value: 38 }, { name: "Paid", value: 31 }, { name: "Social", value: 18 }, { name: "Email", value: 13 }],
  byDevice: [{ name: "Mobile", value: 62 }, { name: "Desktop", value: 29 }, { name: "Tablet", value: 9 }],
  campaignIds: ["Camp 1", "Camp 2", "Camp 3"],
  campaigns: [
    {
      id: "Camp 1", name: "Camp 1",
      totalEvents: 54200, impressions: 44000, clicks: 7200, conversions: 1800, revenue: 1100000,
      ctr: 16.36, conversionRate: 9.0,
      timeSeriesEvents: [{ t: "10:00", count: 420 }, { t: "10:30", count: 680 }, { t: "11:00", count: 800 }, { t: "11:30", count: 740 }, { t: "12:00", count: 950 }, { t: "12:30", count: 1100 }, { t: "13:00", count: 1020 }, { t: "13:30", count: 1240 }, { t: "14:00", count: 1380 }, { t: "14:30", count: 1500 }],
      dims: {
        byGender: [{ name: "Male", value: 58 }, { name: "Female", value: 36 }, { name: "Other", value: 6 }],
        byAge: [{ name: "18–24", value: 32 }, { name: "25–34", value: 40 }, { name: "35–44", value: 18 }, { name: "45+", value: 10 }],
        bySegment: [{ name: "Premium", value: 42 }, { name: "Regular", value: 40 }, { name: "New", value: 18 }],
        byCity: [{ name: "Mumbai", value: 3800 }, { name: "Delhi", value: 3100 }, { name: "Bangalore", value: 2900 }],
        byChannel: [{ name: "Organic", value: 40 }, { name: "Paid", value: 35 }, { name: "Social", value: 15 }, { name: "Email", value: 10 }],
        byDevice: [{ name: "Mobile", value: 65 }, { name: "Desktop", value: 28 }, { name: "Tablet", value: 7 }],
      },
    },
    {
      id: "Camp 2", name: "Camp 2",
      totalEvents: 51800, impressions: 42000, clicks: 6500, conversions: 1420, revenue: 980000,
      ctr: 15.48, conversionRate: 7.8,
      timeSeriesEvents: [{ t: "10:00", count: 390 }, { t: "10:30", count: 620 }, { t: "11:00", count: 760 }, { t: "11:30", count: 700 }, { t: "12:00", count: 890 }, { t: "12:30", count: 1010 }, { t: "13:00", count: 940 }, { t: "13:30", count: 1140 }, { t: "14:00", count: 1260 }, { t: "14:30", count: 1380 }],
      dims: {
        byGender: [{ name: "Male", value: 48 }, { name: "Female", value: 45 }, { name: "Other", value: 7 }],
        byAge: [{ name: "18–24", value: 25 }, { name: "25–34", value: 38 }, { name: "35–44", value: 24 }, { name: "45+", value: 13 }],
        bySegment: [{ name: "Premium", value: 30 }, { name: "Regular", value: 50 }, { name: "New", value: 20 }],
        byCity: [{ name: "Delhi", value: 3200 }, { name: "Hyderabad", value: 2600 }, { name: "Chennai", value: 2100 }],
        byChannel: [{ name: "Organic", value: 35 }, { name: "Paid", value: 30 }, { name: "Social", value: 22 }, { name: "Email", value: 13 }],
        byDevice: [{ name: "Mobile", value: 60 }, { name: "Desktop", value: 32 }, { name: "Tablet", value: 8 }],
      },
    },
    {
      id: "Camp 3", name: "Camp 3",
      totalEvents: 42320, impressions: 34000, clicks: 4800, conversions: 1092, revenue: 767650,
      ctr: 14.12, conversionRate: 7.6,
      timeSeriesEvents: [{ t: "10:00", count: 390 }, { t: "10:30", count: 550 }, { t: "11:00", count: 640 }, { t: "11:30", count: 540 }, { t: "12:00", count: 860 }, { t: "12:30", count: 990 }, { t: "13:00", count: 890 }, { t: "13:30", count: 1020 }, { t: "14:00", count: 1110 }, { t: "14:30", count: 1220 }],
      dims: {
        byGender: [{ name: "Male", value: 50 }, { name: "Female", value: 43 }, { name: "Other", value: 7 }],
        byAge: [{ name: "18–24", value: 27 }, { name: "25–34", value: 36 }, { name: "35–44", value: 24 }, { name: "45+", value: 13 }],
        bySegment: [{ name: "Premium", value: 33 }, { name: "Regular", value: 44 }, { name: "New", value: 23 }],
        byCity: [{ name: "Bangalore", value: 2800 }, { name: "Mumbai", value: 2400 }, { name: "Chennai", value: 1900 }],
        byChannel: [{ name: "Organic", value: 38 }, { name: "Paid", value: 28 }, { name: "Social", value: 20 }, { name: "Email", value: 14 }],
        byDevice: [{ name: "Mobile", value: 61 }, { name: "Desktop", value: 28 }, { name: "Tablet", value: 11 }],
      },
    },
  ],
};

const TABS = [
  { id: "overview",   label: "Overview",   icon: "◈" },
  { id: "campaigns",  label: "Campaigns",  icon: "◎" },
  { id: "audience",   label: "Audience",   icon: "◉" },
  { id: "geography",  label: "Geography",  icon: "◫" },
];

function labels(arr = []) { return arr.map((d) => d.name); }
function vals(arr = [])   { return arr.map((d) => d.value); }

// ── Root ──────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [metrics, setMetrics] = useState(MOCK);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedCamp, setSelectedCamp] = useState(null); // null = "All"
  const [lastUpdated, setLastUpdated] = useState(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!METRICS_URL) return;
    const load = async () => {
      try {
        const res = await fetch(METRICS_URL);
        const data = await res.json();
        setMetrics(data);
        setLastUpdated(new Date());
        setLive(true);
        // Auto-select first campaign if none selected
        if (!selectedCamp && data.campaignIds?.length) {
          setSelectedCamp(null);
        }
      } catch {
        setLive(false);
      }
    };
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, []);

  // Resolve which campaign data to show for audience/geo tabs
  const activeCamp = selectedCamp
    ? metrics.campaigns?.find((c) => c.id === selectedCamp)
    : null;

  // Dims: use per-campaign dims if a campaign is selected, else overall
  const dims = activeCamp?.dims || {
    byGender: metrics.byGender,
    byAge: metrics.byAge,
    bySegment: metrics.bySegment,
    byCity: metrics.byCity,
    byDevice: metrics.byDevice,
    byChannel: metrics.byChannel,
  };

  return (
    <div className="dash">
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-mark">■</span>
          <span className="logo-text">EventLens</span>
        </div>
        <nav className="nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nav-btn${activeTab === t.id ? " active" : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              <span className="nav-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className={`status-dot${live ? " live" : ""}`} />
          <span className="status-label">{live ? "Live" : "Preview"}</span>
        </div>
      </aside>

      <main className="main">
        {/* Global campaign selector — shown on Campaigns, Audience, Geography */}
        {activeTab !== "overview" && (
          <div className="camp-selector">
            <span className="camp-selector-label">Campaign</span>
            <div className="camp-pills">
              <button
                className={`pill${!selectedCamp ? " active" : ""}`}
                onClick={() => setSelectedCamp(null)}
              >
                All
              </button>
              {(metrics.campaignIds || []).map((id) => (
                <button
                  key={id}
                  className={`pill${selectedCamp === id ? " active" : ""}`}
                  onClick={() => setSelectedCamp(id)}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="page-header">
          <h1 className="page-title">
            {TABS.find((t) => t.id === activeTab)?.label}
            {selectedCamp && activeTab !== "overview" && (
              <span className="page-title-camp"> — {selectedCamp}</span>
            )}
          </h1>
          {lastUpdated && (
            <p className="page-sub">Updated {lastUpdated.toLocaleTimeString()}</p>
          )}
        </div>

        {activeTab === "overview"  && <Overview metrics={metrics} />}
        {activeTab === "campaigns" && <Campaigns metrics={metrics} selectedCamp={selectedCamp} />}
        {activeTab === "audience"  && <Audience dims={dims} />}
        {activeTab === "geography" && <Geography dims={dims} />}
      </main>
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────
function Overview({ metrics }) {
  const ts = metrics.timeSeriesEvents || [];
  const lineData = {
    labels: ts.map((d) => d.t),
    datasets: [{
      data: ts.map((d) => d.count),
      borderColor: "#c8ff00",
      backgroundColor: "rgba(200,255,0,0.07)",
      fill: true, tension: 0.4,
      pointRadius: 3, pointBackgroundColor: "#c8ff00",
      borderWidth: 1.5,
    }],
  };

  return (
    <>
      <div className="kpi-grid">
        <KpiCard label="Total events"   value={(metrics.totalEvents       || 0).toLocaleString()} accent />
        <KpiCard label="Revenue"        value={`₹${(metrics.totalRevenue  || 0).toLocaleString()}`} />
        <KpiCard label="Conversions"    value={(metrics.totalConversions   || 0).toLocaleString()} />
        <KpiCard label="Impressions"    value={(metrics.totalImpressions   || 0).toLocaleString()} />
        <KpiCard label="Clicks"         value={(metrics.totalClicks        || 0).toLocaleString()} />
      </div>

      <ChartCard title="Event volume over time" badge="streaming">
        <div style={{ height: 220 }}>
          <Line data={lineData} options={{
            ...CHART_OPTS,
            scales: {
              ...CHART_OPTS.scales,
              x: { ...CHART_OPTS.scales.x, ticks: { ...CHART_OPTS.scales.x.ticks, maxTicksLimit: 8 } },
            },
          }} />
        </div>
      </ChartCard>
    </>
  );
}

// ── Campaigns ─────────────────────────────────────────────────────────
function Campaigns({ metrics, selectedCamp }) {
  const camps = metrics.campaigns || [];

  // If a specific campaign is selected, show its detail view
  const campData = selectedCamp ? camps.find((c) => c.id === selectedCamp) : null;

  if (campData) {
    return <CampaignDetail camp={campData} />;
  }

  // "All" — show comparison across campaigns
  const totalEventsData = {
    labels: camps.map((c) => c.name),
    datasets: [{
      data: camps.map((c) => c.totalEvents),
      backgroundColor: "#c8ff00cc",
      borderColor: "#c8ff00",
      borderWidth: 1.5, borderRadius: 4,
    }],
  };

  const ctrData = {
    labels: camps.map((c) => c.name),
    datasets: [{
      data: camps.map((c) => c.ctr),
      backgroundColor: "#00d4ffcc",
      borderColor: "#00d4ff",
      borderWidth: 1.5, borderRadius: 4,
    }],
  };

  const cvrData = {
    labels: camps.map((c) => c.name),
    datasets: [{
      data: camps.map((c) => c.conversionRate),
      backgroundColor: "#a78bfacc",
      borderColor: "#a78bfa",
      borderWidth: 1.5, borderRadius: 4,
    }],
  };

  return (
    <>
      {/* Summary cards per campaign */}
      <div className="camp-cards">
        {camps.map((c) => (
          <div key={c.id} className="camp-card">
            <p className="camp-card-name">{c.name}</p>
            <div className="camp-card-stats">
              <div><span className="stat-label">Events</span><span className="stat-val">{c.totalEvents.toLocaleString()}</span></div>
              <div><span className="stat-label">CTR</span><span className="stat-val accent">{c.ctr}%</span></div>
              <div><span className="stat-label">Conv. Rate</span><span className="stat-val accent">{c.conversionRate}%</span></div>
              <div><span className="stat-label">Revenue</span><span className="stat-val">₹{c.revenue.toLocaleString()}</span></div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid2">
        <ChartCard title="Total events by campaign">
          <div style={{ height: 220 }}><Bar data={totalEventsData} options={CHART_OPTS} /></div>
        </ChartCard>
        <ChartCard title="CTR by campaign (%)">
          <div style={{ height: 220 }}><Bar data={ctrData} options={CHART_OPTS} /></div>
        </ChartCard>
      </div>

      <ChartCard title="Conversion rate by campaign (%)">
        <div style={{ height: 180 }}><Bar data={cvrData} options={CHART_OPTS} /></div>
      </ChartCard>
    </>
  );
}

function CampaignDetail({ camp }) {
  const ts = camp.timeSeriesEvents || [];
  const lineData = {
    labels: ts.map((d) => d.t),
    datasets: [{
      data: ts.map((d) => d.count),
      borderColor: "#c8ff00",
      backgroundColor: "rgba(200,255,0,0.07)",
      fill: true, tension: 0.4,
      pointRadius: 3, pointBackgroundColor: "#c8ff00",
      borderWidth: 1.5,
    }],
  };

  return (
    <>
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        <KpiCard label="Total events"  value={camp.totalEvents.toLocaleString()} accent />
        <KpiCard label="Impressions"   value={camp.impressions.toLocaleString()} />
        <KpiCard label="Clicks"        value={camp.clicks.toLocaleString()} />
        <KpiCard label="Conversions"   value={camp.conversions.toLocaleString()} />
        <KpiCard label="Revenue"       value={`₹${camp.revenue.toLocaleString()}`} />
        <KpiCard label="CTR"           value={`${camp.ctr}%`} />
        <KpiCard label="Conv. rate"    value={`${camp.conversionRate}%`} />
      </div>
      <ChartCard title="Event volume over time" badge="campaign">
        <div style={{ height: 220 }}><Line data={lineData} options={CHART_OPTS} /></div>
      </ChartCard>
    </>
  );
}

// ── Audience ──────────────────────────────────────────────────────────
function Audience({ dims }) {
  const segData = {
    labels: labels(dims.bySegment),
    datasets: [{
      data: vals(dims.bySegment),
      backgroundColor: PALETTE.slice(0, dims.bySegment?.length || 3).map((c) => c + "cc"),
      borderColor: PALETTE.slice(0, dims.bySegment?.length || 3),
      borderWidth: 1.5,
      borderRadius: 4,
    }],
  };

  return (
    <>
      <div className="grid2">
        <DonutCard title="Gender"    data={dims.byGender} />
        <DonutCard title="Age group" data={dims.byAge} />
      </div>
      <ChartCard title="Segment breakdown">
        <div style={{ height: 220 }}>
          <Bar data={segData} options={CHART_OPTS} />
        </div>
      </ChartCard>
    </>
  );
}

// ── Geography ─────────────────────────────────────────────────────────
function Geography({ dims }) {
  const cityBar = {
    labels: labels(dims.byCity),
    datasets: [{
      data: vals(dims.byCity),
      backgroundColor: "#00d4ffcc",
      borderColor: "#00d4ff",
      borderWidth: 1.5, borderRadius: 4,
    }],
  };
  const devBar = {
    labels: labels(dims.byDevice),
    datasets: [{
      data: vals(dims.byDevice),
      backgroundColor: "#a78bfacc",
      borderColor: "#a78bfa",
      borderWidth: 1.5, borderRadius: 4,
    }],
  };

  return (
    <>
      <div className="grid2">
        <ChartCard title="Top cities">
          <div style={{ height: 220 }}><Bar data={cityBar} options={CHART_OPTS} /></div>
        </ChartCard>
        <DonutCard title="Channel mix" data={dims.byChannel} height={220} />
      </div>
      <ChartCard title="Device breakdown">
        <div style={{ height: 180 }}><Bar data={devBar} options={CHART_OPTS} /></div>
      </ChartCard>
    </>
  );
}

// ── Reusable components ───────────────────────────────────────────────
function KpiCard({ label, value, accent }) {
  return (
    <div className="kpi-card">
      <p className="kpi-label">{label}</p>
      <h2 className={`kpi-value${accent ? " accent" : ""}`}>{value}</h2>
    </div>
  );
}

function ChartCard({ title, badge, children }) {
  return (
    <div className="chart-card">
      <div className="chart-header">
        <span className="chart-title">{title}</span>
        {badge && <span className="badge">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function DonutCard({ title, data = [], height = 240 }) {
  const donutData = {
    labels: labels(data),
    datasets: [{
      data: vals(data),
      backgroundColor: PALETTE.slice(0, data.length),
      borderColor: "#0f1117",
      borderWidth: 2,
    }],
  };
  return (
    <ChartCard title={title}>
      <div style={{ height }}><Doughnut data={donutData} options={PIE_OPTS} /></div>
    </ChartCard>
  );
}
