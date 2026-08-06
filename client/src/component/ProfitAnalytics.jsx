import React, { useEffect, useState, useRef } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import api from "../api/axios.js";
import ErrorBanner from "./ErrorBanner.jsx";
import { useApiError } from "../utils/useApiError.js";
import "../styles/ProfitAnalytics.css";

const formatNaira = (value) =>
  `₦${(Number(value) || 0).toLocaleString("en-NG")}`;

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function firstOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
}

// Phase 3: surfaces the Phase 2 read-only analytics endpoints. Shares the
// parent DashboardSummary's branch selection (one dropdown, not a second
// one) but keeps its own from/to range -- the dashboard's existing Year
// picker doesn't map onto these endpoints' arbitrary date ranges.
export default function ProfitAnalytics({ selectedBranch }) {
  const { error, showError, clearError } = useApiError();

  const [fromDate, setFromDate] = useState(firstOfMonthISO);
  const [toDate, setToDate] = useState(todayISO);

  const [profit, setProfit] = useState(null);
  const [turnover, setTurnover] = useState(null);
  const [cashCollected, setCashCollected] = useState(null);
  const [trend, setTrend] = useState(null);
  const [deadStock, setDeadStock] = useState([]);
  const [debtorAging, setDebtorAging] = useState(null);

  const [thresholdInput, setThresholdInput] = useState("90");
  const [appliedThreshold, setAppliedThreshold] = useState(90);

  const [loadingPeriod, setLoadingPeriod] = useState(true);
  const [loadingTrend, setLoadingTrend] = useState(true);
  const [loadingDeadStock, setLoadingDeadStock] = useState(true);
  const [loadingAging, setLoadingAging] = useState(true);

  const periodRequestId = useRef(0);
  const trendRequestId = useRef(0);
  const deadStockRequestId = useRef(0);
  const agingRequestId = useRef(0);

  const authHeaders = {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  };
  const branchParam = selectedBranch === "all" ? {} : { branch: selectedBranch };

  // Profit + Turnover + Cash Collected all share the same from/to/branch,
  // fetched together.
  useEffect(() => {
    if (!fromDate || !toDate) return;
    const fetchPeriodData = async () => {
      setLoadingPeriod(true);
      const requestId = ++periodRequestId.current;
      try {
        const params = { from: fromDate, to: toDate, ...branchParam };
        const [profitRes, turnoverRes, cashRes] = await Promise.all([
          api.get("/admin/profit", { ...authHeaders, params }),
          api.get("/admin/turnover", { ...authHeaders, params }),
          api.get("/admin/cash-collected", { ...authHeaders, params }),
        ]);
        if (requestId !== periodRequestId.current) return;
        clearError();
        setProfit(profitRes.data);
        setTurnover(turnoverRes.data);
        setCashCollected(cashRes.data);
      } catch (err) {
        console.error("Failed to load profit/turnover/cash data", err);
        if (requestId === periodRequestId.current) {
          showError(err, "Failed to load profit/turnover/cash data.");
        }
      } finally {
        if (requestId === periodRequestId.current) setLoadingPeriod(false);
      }
    };
    fetchPeriodData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch, fromDate, toDate]);

  // Trend is always trailing 12 months -- branch only, no date range.
  useEffect(() => {
    const fetchTrend = async () => {
      setLoadingTrend(true);
      const requestId = ++trendRequestId.current;
      try {
        const res = await api.get("/admin/revenue-trend", {
          ...authHeaders,
          params: { ...branchParam },
        });
        if (requestId !== trendRequestId.current) return;
        setTrend(res.data);
      } catch (err) {
        console.error("Failed to load revenue trend", err);
        if (requestId === trendRequestId.current) {
          showError(err, "Failed to load revenue trend.");
        }
      } finally {
        if (requestId === trendRequestId.current) setLoadingTrend(false);
      }
    };
    fetchTrend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch]);

  // Dead stock: branch + explicitly-applied threshold (not fired per keystroke).
  useEffect(() => {
    const fetchDeadStock = async () => {
      setLoadingDeadStock(true);
      const requestId = ++deadStockRequestId.current;
      try {
        const res = await api.get("/admin/dead-stock", {
          ...authHeaders,
          params: { ...branchParam, thresholdDays: appliedThreshold },
        });
        if (requestId !== deadStockRequestId.current) return;
        setDeadStock(res.data);
      } catch (err) {
        console.error("Failed to load dead stock", err);
        if (requestId === deadStockRequestId.current) {
          showError(err, "Failed to load dead stock.");
        }
      } finally {
        if (requestId === deadStockRequestId.current) setLoadingDeadStock(false);
      }
    };
    fetchDeadStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch, appliedThreshold]);

  // Debtor aging is "as of now" -- branch only, no date range, same
  // reasoning as Trend.
  useEffect(() => {
    const fetchAging = async () => {
      setLoadingAging(true);
      const requestId = ++agingRequestId.current;
      try {
        const res = await api.get("/admin/debtor-aging", {
          ...authHeaders,
          params: { ...branchParam },
        });
        if (requestId !== agingRequestId.current) return;
        setDebtorAging(res.data);
      } catch (err) {
        console.error("Failed to load debtor aging", err);
        if (requestId === agingRequestId.current) {
          showError(err, "Failed to load debtor aging.");
        }
      } finally {
        if (requestId === agingRequestId.current) setLoadingAging(false);
      }
    };
    fetchAging();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch]);

  const handleApplyThreshold = () => {
    const parsed = parseInt(thresholdInput, 10);
    setAppliedThreshold(!parsed || parsed <= 0 ? 90 : parsed);
  };

  return (
    <div className="profit-analytics">
      <h2 className="dashboard-title">Profit &amp; Inventory Analytics</h2>
      <ErrorBanner message={error} onDismiss={clearError} />

      <div className="analytics-date-range">
        <label htmlFor="analytics-from">From:</label>
        <input
          id="analytics-from"
          type="date"
          value={fromDate}
          max={toDate || undefined}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <label htmlFor="analytics-to">To:</label>
        <input
          id="analytics-to"
          type="date"
          value={toDate}
          min={fromDate || undefined}
          onChange={(e) => setToDate(e.target.value)}
        />
      </div>

      <div className="analytics-card analytics-chart-card">
        <h3>Revenue &amp; Profit Trend (Last 12 Months)</h3>
        {loadingTrend ? (
          <p className="loading-message">Loading trend...</p>
        ) : !trend?.months?.length ? (
          <p className="table-empty-state">No trend data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={trend.months} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
                width={60}
              />
              <Tooltip formatter={(value) => formatNaira(value)} />
              <Legend />
              <Bar dataKey="revenue" name="Revenue" fill="var(--accent-color)" radius={[4, 4, 0, 0]} />
              <Line
                type="monotone"
                dataKey="grossProfit"
                name="Gross Profit"
                stroke="var(--primary-color)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="analytics-cards-row">
        <div className="analytics-card">
          <h3>Profit Summary</h3>
          {loadingPeriod ? (
            <p className="loading-message">Loading...</p>
          ) : !profit ? (
            <p className="table-empty-state">No data for this period.</p>
          ) : (
            <>
              <div className="analytics-stat-grid">
                <div className="analytics-stat">
                  <span className="analytics-stat-label">Revenue</span>
                  <span className="analytics-stat-value">{formatNaira(profit.revenue)}</span>
                </div>
                <div className="analytics-stat">
                  <span className="analytics-stat-label">COGS</span>
                  <span className="analytics-stat-value">{formatNaira(profit.cogs)}</span>
                </div>
                <div className="analytics-stat">
                  <span className="analytics-stat-label">Gross Profit</span>
                  <span className="analytics-stat-value">{formatNaira(profit.grossProfit)}</span>
                </div>
                <div className="analytics-stat">
                  <span className="analytics-stat-label">Margin</span>
                  <span className="analytics-stat-value">{profit.grossMarginPct}%</span>
                </div>
              </div>

              {profit.estimatedCogs?.percentOfCogs > 0 && (
                <div className="analytics-warning-banner">
                  <i className="fas fa-triangle-exclamation"></i>
                  <span>
                    <strong>{profit.estimatedCogs.percentOfCogs}%</strong> of this profit's cost
                    ({formatNaira(profit.estimatedCogs.amount)}) is <strong>estimated</strong> --
                    from un-costed or migrated stock. Treat this figure as approximate until
                    those batches sell through.
                  </span>
                </div>
              )}

              {profit.noCostDataLineCount > 0 && (
                <p className="analytics-note">
                  {profit.noCostDataLineCount} of {profit.totalLineCount} sale line(s) in this
                  period predate cost tracking and are excluded from the cost figures above.
                </p>
              )}
            </>
          )}
        </div>

        <div className="analytics-card">
          <h3>Cash Collected vs Invoiced</h3>
          {loadingPeriod ? (
            <p className="loading-message">Loading...</p>
          ) : !cashCollected ? (
            <p className="table-empty-state">No data for this period.</p>
          ) : (
            <>
              <div className="analytics-stat-grid">
                <div className="analytics-stat">
                  <span className="analytics-stat-label">Invoiced</span>
                  <span className="analytics-stat-value">{formatNaira(cashCollected.invoiced)}</span>
                </div>
                <div className="analytics-stat">
                  <span className="analytics-stat-label">Collected</span>
                  <span className="analytics-stat-value">{formatNaira(cashCollected.collected)}</span>
                </div>
                <div className="analytics-stat">
                  <span className="analytics-stat-label">Outstanding</span>
                  <span className="analytics-stat-value">{formatNaira(cashCollected.outstanding)}</span>
                </div>
                <div className="analytics-stat">
                  <span className="analytics-stat-label">Collection Rate</span>
                  <span className="analytics-stat-value">{cashCollected.collectionRatePct}%</span>
                </div>
              </div>
              <small className="summary-card-note">{cashCollected.note}</small>
            </>
          )}
        </div>

        <div className="analytics-card analytics-card-single-stat">
          <h3>Inventory Turnover</h3>
          {loadingPeriod ? (
            <p className="loading-message">Loading...</p>
          ) : !turnover ? (
            <p className="table-empty-state">No data for this period.</p>
          ) : (
            <>
              <p className="analytics-big-stat">
                {turnover.turnoverRatio != null ? turnover.turnoverRatio : "N/A"}
              </p>
              <small className="summary-card-note">
                Current stock value snapshot ({formatNaira(turnover.currentStockValue)}) -- not
                a period average. Approximate.
              </small>
            </>
          )}
        </div>
      </div>

      <div className="analytics-card">
        <h3>Debtor Aging</h3>
        {loadingAging ? (
          <p className="loading-message">Loading debtor aging...</p>
        ) : !debtorAging || debtorAging.totalOutstanding === 0 ? (
          <p className="table-empty-state">No outstanding debt.</p>
        ) : (
          <>
            <div className="analytics-stat-grid">
              {debtorAging.buckets.map((bucket) => (
                <div className="analytics-stat" key={bucket.label}>
                  <span className="analytics-stat-label">{bucket.label} days</span>
                  <span
                    className={
                      "analytics-stat-value" +
                      ((bucket.label === "61-90" || bucket.label === "90+") && bucket.totalOutstanding > 0
                        ? " analytics-stat-value-danger"
                        : "")
                    }
                  >
                    {formatNaira(bucket.totalOutstanding)}
                  </span>
                  <span className="analytics-stat-sublabel">
                    {bucket.count} sale{bucket.count === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
            <small className="summary-card-note">
              Total outstanding: {formatNaira(debtorAging.totalOutstanding)} -- aged from each
              sale's date, not a formal due date.
            </small>
          </>
        )}
      </div>

      <div className="analytics-card">
        <div className="analytics-card-header">
          <h3>Dead Stock</h3>
          <div className="analytics-threshold-control">
            <label htmlFor="dead-stock-threshold">Older than</label>
            <input
              id="dead-stock-threshold"
              type="number"
              min="1"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
            />
            <span>days</span>
            <button type="button" className="btn-primary" onClick={handleApplyThreshold}>
              Apply
            </button>
          </div>
        </div>

        {loadingDeadStock ? (
          <p className="loading-message">Loading dead stock...</p>
        ) : deadStock.length === 0 ? (
          <p className="table-empty-state">No dead stock found for this threshold.</p>
        ) : (
          <div className="analytics-table-wrapper">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Branch</th>
                  <th>Color</th>
                  <th className="col-right">Qty</th>
                  <th className="col-right">Days in Stock</th>
                  <th className="col-right">Tied-Up Value</th>
                </tr>
              </thead>
              <tbody>
                {deadStock.map((item, index) => (
                  <tr key={index} className={index % 2 === 1 ? "row-alt" : ""}>
                    <td data-label="Product">{item.productName}</td>
                    <td data-label="Branch">{item.branchName}</td>
                    <td data-label="Color">{item.color || "-"}</td>
                    <td className="col-right" data-label="Qty">{item.quantityRemaining}</td>
                    <td className="col-right" data-label="Days in Stock">{item.daysInStock}</td>
                    <td className="col-right" data-label="Tied-Up Value">
                      {formatNaira(item.tiedUpValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
