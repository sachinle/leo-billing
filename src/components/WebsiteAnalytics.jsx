import { useCallback, useEffect, useMemo, useState } from 'react';
import { getWebsiteAnalytics } from '../services/websiteService';
import './WebsiteAnalytics.css';

// Website analytics: what the online shop is actually doing.
//
// The billing side already reports on invoices — money that has been
// collected. This reports on the step before that: orders arriving from
// the website, where they come from, what people order, and how many
// never become an invoice at all. Those are different questions, so it
// lives in its own section rather than being mixed into the invoice
// charts.
//
// Charts are hand-drawn SVG. A charting library would add ~50KB gzipped
// to an app that runs on a phone over mobile data, for six shapes that
// are a few lines of maths.

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

const STATUS_LABELS = {
  received: 'Received',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const money = (n) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

export default function WebsiteAnalytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (windowDays) => {
    setLoading(true);
    setError('');
    try {
      setData(await getWebsiteAnalytics(windowDays));
    } catch (e) {
      setError(e.message || 'Could not load website analytics.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(days);
  }, [days, load]);

  if (loading && !data) {
    return (
      <section className="wa">
        <Header days={days} setDays={setDays} />
        <div className="wa__skeleton" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="wa">
        <Header days={days} setDays={setDays} />
        <div className="wa__error">
          <p>{error}</p>
          <button type="button" onClick={() => load(days)}>Try again</button>
        </div>
      </section>
    );
  }

  if (!data) return null;

  const t = data.totals;

  return (
    <section className="wa">
      <Header days={days} setDays={setDays} />

      <div className="wa__kpis">
        <Kpi label="Orders" value={t.orders} />
        <Kpi label="Revenue" value={money(t.revenue)} hint="Excludes cancelled" />
        <Kpi label="Avg order" value={money(t.averageOrderValue)} />
        <Kpi label="New customers" value={t.newCustomers} />
        <Kpi
          label="Cancelled"
          value={`${t.cancellationRate}%`}
          hint={`${t.cancelled} of ${t.orders}`}
          tone={t.cancellationRate > 20 ? 'warn' : undefined}
        />
        <Kpi label="Completed" value={t.completed} />
      </div>

      <div className="wa__grid">
        <Panel title="Orders per day" span={2}>
          <Sparkline series={data.series} valueKey="orders" />
        </Panel>

        <Panel title="Revenue per day" span={2}>
          <Sparkline series={data.series} valueKey="revenue" format={money} />
        </Panel>

        <Panel title="Order status">
          <Breakdown
            entries={Object.entries(data.byStatus).map(([k, v]) => [
              STATUS_LABELS[k] || k,
              v,
            ])}
          />
        </Panel>

        <Panel title="Pickup vs delivery">
          <Breakdown
            entries={Object.entries(data.byFulfilment).map(([k, v]) => [
              k === 'delivery' ? 'Delivery' : 'Pickup',
              v,
            ])}
          />
        </Panel>

        <Panel title="Most ordered" span={2}>
          {data.topProducts.length === 0 ? (
            <Empty>No orders in this period.</Empty>
          ) : (
            <ol className="wa__ranked">
              {data.topProducts.map((p, i) => (
                <li key={p.name}>
                  <span className="wa__rank">{i + 1}</span>
                  <span className="wa__ranked-name">{p.name}</span>
                  <span className="wa__ranked-qty">{p.qty}&times;</span>
                  <span className="wa__ranked-rev">{money(p.revenue)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Where orders come from" span={2}>
          {data.topPincodes.length === 0 ? (
            <Empty>No delivery orders yet.</Empty>
          ) : (
            <div className="wa__pins">
              {data.topPincodes.map((p) => (
                <div key={p.pincode} className="wa__pin">
                  <span className="wa__pin-code">{p.pincode}</span>
                  <span className="wa__pin-count">
                    {p.count} {p.count === 1 ? 'order' : 'orders'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}

function Header({ days, setDays }) {
  return (
    <div className="wa__head">
      <div>
        <p className="wa__eyebrow">From the website</p>
        <h2 className="wa__title">Online orders</h2>
      </div>
      <div className="wa__ranges">
        {RANGES.map((r) => (
          <button
            key={r.days}
            type="button"
            className={`wa__range ${days === r.days ? 'is-active' : ''}`}
            onClick={() => setDays(r.days)}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, tone }) {
  return (
    <div className={`wa__kpi ${tone ? `wa__kpi--${tone}` : ''}`}>
      <span className="wa__kpi-label">{label}</span>
      <span className="wa__kpi-value">{value}</span>
      {hint && <span className="wa__kpi-hint">{hint}</span>}
    </div>
  );
}

function Panel({ title, span, children }) {
  return (
    <div className={`wa__panel ${span === 2 ? 'wa__panel--wide' : ''}`}>
      <h3 className="wa__panel-title">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <p className="wa__empty">{children}</p>;
}

/**
 * Filled line chart over a dense daily series.
 *
 * The series always contains every day in the window, including zeros,
 * so a quiet week reads as a flat line rather than the chart quietly
 * closing the gap and implying steady trade.
 */
function Sparkline({ series, valueKey, format }) {
  const { path, area, max, last, points } = useMemo(() => {
    const values = series.map((d) => Number(d[valueKey]) || 0);
    const maxV = Math.max(...values, 1);
    const W = 100;
    const H = 34;
    const step = values.length > 1 ? W / (values.length - 1) : W;

    const pts = values.map((v, i) => [i * step, H - (v / maxV) * H]);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');

    return {
      path: line,
      area: `${line} L${W} ${H} L0 ${H} Z`,
      max: maxV,
      last: values[values.length - 1] ?? 0,
      points: values.length,
    };
  }, [series, valueKey]);

  const fmt = format || ((n) => n);

  return (
    <div className="wa__chart">
      <svg viewBox="0 0 100 34" preserveAspectRatio="none" role="img"
           aria-label={`${valueKey} over the last ${points} days, peak ${max}`}>
        <defs>
          <linearGradient id={`waFill-${valueKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--gold)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#waFill-${valueKey})`} />
        <path
          d={path}
          fill="none"
          stroke="var(--gold)"
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="wa__chart-foot">
        <span>Peak {fmt(max)}</span>
        <span>Latest {fmt(last)}</span>
      </div>
    </div>
  );
}

function Breakdown({ entries }) {
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (total === 0) return <Empty>Nothing yet.</Empty>;

  return (
    <ul className="wa__bars">
      {entries
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => (
          <li key={label}>
            <div className="wa__bar-head">
              <span>{label}</span>
              <span>{value}</span>
            </div>
            <div className="wa__bar-track">
              <div
                className="wa__bar-fill"
                style={{ width: `${Math.round((value / total) * 100)}%` }}
              />
            </div>
          </li>
        ))}
    </ul>
  );
}
