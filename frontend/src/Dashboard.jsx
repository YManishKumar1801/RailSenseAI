import { useState, useEffect } from 'react';
import axios from 'axios';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import './Dashboard.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

const API_BASE = 'http://localhost:5000';

const SIGNAL_GREEN = '#3DDC84';
const SIGNAL_AMBER = '#FFB020';
const SIGNAL_RED = '#FF5C5C';
const SIGNAL_BLUE = '#4FC3F7';
const chartTextColor = '#8A8FA3';
const gridColor = '#232636';
const monoFont = { family: "'IBM Plex Mono', monospace", size: 10 };

// Center-readout plugin for the doughnut chart (digital gauge look)
const centerTextPlugin = {
  id: 'centerText',
  afterDraw(chart) {
    if (chart.config.type !== 'doughnut') return;
    const { ctx, chartArea } = chart;
    const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "700 22px 'IBM Plex Mono', monospace";
    ctx.fillStyle = '#E8E9EF';
    ctx.fillText(total, cx, cy - 8);
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.fillStyle = '#8A8FA3';
    ctx.fillText('TOTAL', cx, cy + 12);
    ctx.restore();
  }
};

const commonOptions = {
  responsive: true,
  plugins: {
    legend: { labels: { color: chartTextColor, font: monoFont, boxWidth: 12 } }
  },
  scales: {
    x: { ticks: { color: chartTextColor, font: monoFont }, grid: { color: gridColor, drawTicks: false } },
    y: { ticks: { color: chartTextColor, font: monoFont }, grid: { color: gridColor, drawTicks: false } }
  },
  elements: {
    bar: {
      borderRadius: 0,
      borderWidth: 1.5,
      borderSkipped: false
    }
  }
};

// Adds a translucent fill + solid border color to a hex color, for the "readout bar" look
function readoutStyle(hex) {
  return { backgroundColor: hex + '33', borderColor: hex };
}

function ChartPanel({ title, tag, children }) {
  return (
    <div className="chart-box">
      <div className="chart-box-header">
        <h3>{title}</h3>
        <span className="chart-tag">{tag}</span>
      </div>
      {children}
    </div>
  );
}

function Dashboard({ lastSearch }) {
  const [overallData, setOverallData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(lastSearch ? 'route' : 'overall');

  useEffect(() => {
    axios.get(`${API_BASE}/api/analytics`)
      .then(res => setOverallData(res.data))
      .catch(err => console.error("Failed to load analytics:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (lastSearch) setMode('route');
  }, [lastSearch]);

  if (loading) return <div className="dashboard"><p style={{ color: 'white' }}>Loading analytics...</p></div>;

  return (
    <div className="dashboard">
      {lastSearch && (
        <div className="dashboard-toggle">
          <button className={mode === 'route' ? 'active' : ''} onClick={() => setMode('route')}>
            🎯 {lastSearch.label}
          </button>
          <button className={mode === 'overall' ? 'active' : ''} onClick={() => setMode('overall')}>
            🌐 Overall (All Trains)
          </button>
        </div>
      )}

      {mode === 'route' && lastSearch ? (
        <RouteAnalytics search={lastSearch} />
      ) : (
        <OverallAnalytics data={overallData} />
      )}
    </div>
  );
}

function RouteAnalytics({ search }) {
  const trains = search.trains;

  const scoreData = {
    labels: trains.map(t => t.train_name),
    datasets: [{
      label: 'PUNCTUALITY SCORE',
      data: trains.map(t => t.punctuality_score),
      ...readoutStyle(SIGNAL_AMBER)
    }]
  };

  const delayData = {
    labels: trains.map(t => t.train_name),
    datasets: [{ label: 'AVG DELAY (MIN)', data: trains.map(t => t.avg_delay_minutes), ...readoutStyle(SIGNAL_RED) }]
  };

  const trendData = {
    labels: trains.map(t => t.train_name),
    datasets: [
      { label: '30D', data: trains.map(t => t.on_time_pct_30d), ...readoutStyle(SIGNAL_AMBER) },
      { label: '60D', data: trains.map(t => t.on_time_pct_60d), ...readoutStyle(SIGNAL_BLUE) },
      { label: '90D', data: trains.map(t => t.on_time_pct_90d), ...readoutStyle('#8A6440') }
    ]
  };

  const cleanlinessData = {
    labels: trains.map(t => t.train_name),
    datasets: [{ label: 'CLEANLINESS', data: trains.map(t => t.cleanliness_score), ...readoutStyle(SIGNAL_BLUE) }]
  };

  return (
    <>
      <div className="dashboard-summary">
        <div className="summary-card">
          <div className="summary-value">{trains.length}</div>
          <div className="summary-label">Trains On This Route</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">{Math.max(...trains.map(t => t.punctuality_score))}</div>
          <div className="summary-label">Best Punctuality Score</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">{trains[0]?.train_name || '-'}</div>
          <div className="summary-label">Recommended Train</div>
        </div>
      </div>

      <div className="chart-grid">
        <ChartPanel title="Punctuality Score Comparison" tag="CH-01">
          <Bar data={scoreData} options={commonOptions} />
        </ChartPanel>
        <ChartPanel title="Average Delay Comparison" tag="CH-02">
          <Bar data={delayData} options={commonOptions} />
        </ChartPanel>
        <ChartPanel title="On-Time % Trend (30/60/90d)" tag="CH-03">
          <Bar data={trendData} options={commonOptions} />
        </ChartPanel>
        <ChartPanel title="Cleanliness Comparison" tag="CH-04">
          <Bar data={cleanlinessData} options={commonOptions} />
        </ChartPanel>
      </div>
    </>
  );
}

function OverallAnalytics({ data }) {
  if (!data) return <p style={{ color: 'white' }}>Could not load analytics data.</p>;

  const topTrainsData = {
    labels: data.topTrains.map(t => t.name),
    datasets: [{ label: 'SCORE', data: data.topTrains.map(t => t.score), ...readoutStyle(SIGNAL_GREEN) }]
  };

  const bottomTrainsData = {
    labels: data.bottomTrains.map(t => t.name),
    datasets: [{ label: 'SCORE', data: data.bottomTrains.map(t => t.score), ...readoutStyle(SIGNAL_RED) }]
  };

  const onTimeTrendData = {
    labels: ['30D', '60D', '90D'],
    datasets: [{
      label: 'AVG ON-TIME %',
      data: [data.avgOnTime['30d'], data.avgOnTime['60d'], data.avgOnTime['90d']],
      ...readoutStyle(SIGNAL_AMBER)
    }]
  };

  const riskDoughnutData = {
    labels: ['SAFE (80+)', 'MODERATE (60-79)', 'RISKY (<60)'],
    datasets: [{
      data: [data.riskDistribution.safe, data.riskDistribution.moderate, data.riskDistribution.risky],
      backgroundColor: [SIGNAL_GREEN, SIGNAL_AMBER, SIGNAL_RED],
      borderColor: '#12141C',
      borderWidth: 3
    }]
  };

  return (
    <>
      <div className="dashboard-summary">
        <div className="summary-card">
          <div className="summary-value">{data.totalTrains}</div>
          <div className="summary-label">Total Trains Tracked</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">{data.avgOnTime['30d']}%</div>
          <div className="summary-label">Avg On-Time (30d)</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">{data.riskDistribution.safe}</div>
          <div className="summary-label">Highly Reliable Trains</div>
        </div>
      </div>

      <div className="chart-grid">
        <ChartPanel title="Top 10 Most Punctual Trains" tag="CH-01">
          <Bar data={topTrainsData} options={commonOptions} />
        </ChartPanel>
        <ChartPanel title="Bottom 10 Least Punctual Trains" tag="CH-02">
          <Bar data={bottomTrainsData} options={commonOptions} />
        </ChartPanel>
        <ChartPanel title="On-Time % Trend" tag="CH-03">
          <Bar data={onTimeTrendData} options={commonOptions} />
        </ChartPanel>
        <ChartPanel title="Reliability Distribution" tag="CH-04">
          <Doughnut
            data={riskDoughnutData}
            options={{ plugins: { legend: { labels: { color: chartTextColor, font: monoFont, boxWidth: 12 } } }, cutout: '70%' }}
            plugins={[centerTextPlugin]}
          />
        </ChartPanel>
      </div>
    </>
  );
}

export default Dashboard;