import type { ReactNode } from "react";
import { useId, useState } from "react";
import { formatUnits } from "viem";

import { buildChartPoints, CHART_POINT_COUNT } from "../lib/valueHistory";
import { buildChartCoords, buildSmoothPath, densifyPoints } from "../lib/chartPath";
import type { PoolActivity } from "../lib/poolActivity";

import {
  fmtAddress,
  fmtUsdAdaptive,
  fmtDate,
  fmtPct,
  fmtUsd,
  fmtUsdPrecise,
  fmtTokenPrecise,
  fmtRelativeTime,
  NAV_DECIMALS,
  toUsdc,
  USDC_DECIMALS,
} from "../lib/format";
import type {
  MemberPosition,
  PoolState,
  UnderwritePayload,
  UnderwriteResult,
} from "../lib/dashboardTypes";

export type DashboardView = "member" | "vendor" | "operator";

type HeroSectionProps = {
  wallet?: string;
  currentView: DashboardView;
  onViewChange: (view: DashboardView) => void;
  connectControl: ReactNode;
};

export function HeroSection({
  wallet,
  currentView,
  onViewChange,
  connectControl,
}: HeroSectionProps) {
  return (
    <section className="dashboard-header">
      <div className="dashboard-logo">Lattice</div>
      <div className="topbar-actions">
        <div className="mini-switcher" aria-label="Dashboard view">
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onViewChange(view.id);
              }}
              className={`mini-switch${currentView === view.id ? " is-active" : ""}`}
            >
              {view.title}
            </button>
          ))}
        </div>
        <div className="wallet-action" data-wallet={wallet ? fmtAddress(wallet) : "Read-only"}>
          {connectControl}
        </div>
      </div>
    </section>
  );
}

type AlertsSectionProps = {
  warnings: string[];
};

export function AlertsSection({ warnings }: AlertsSectionProps) {
  if (warnings.length === 0) return null;

  return (
    <section className="dashboard-alerts">
      {warnings.map((warning) => (
        <article key={warning} className="alert-banner">
          {warning}
        </article>
      ))}
    </section>
  );
}

const views: Array<{ id: DashboardView; label: string; title: string; summary: string }> = [
  {
    id: "member",
    label: "Portfolio",
    title: "Member",
    summary: "Position value, pool yield, deposit and redeem.",
  },
  {
    id: "vendor",
    label: "Credit Line",
    title: "Vendor",
    summary: "Borrowing headroom, debt balance, draw and repay.",
  },
  {
    id: "operator",
    label: "Operations",
    title: "Operator",
    summary: "Underwriting, refresh, and default management.",
  },
];

function TrendGraph({ points }: { points: number[] }) {
  const gradientId = useId().replace(/:/g, "");
  const width = 720;
  const height = 220;
  const smoothPoints = densifyPoints(points, 16);
  const { coords } = buildChartCoords(smoothPoints, width, height);
  const linePath = buildSmoothPath(coords);
  const area = `${linePath} L ${coords[coords.length - 1]?.[0] ?? width} ${height} L ${coords[0]?.[0] ?? 0} ${height} Z`;
  const lastPoint = coords[coords.length - 1];

  return (
    <div className="trend-graph-shell">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="trend-graph"
        preserveAspectRatio="none"
        role="img"
        aria-label="Portfolio value trend"
      >
        <defs>
          <linearGradient id={`${gradientId}-area`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0a84ff" stopOpacity="0.28" />
            <stop offset="45%" stopColor="#4db4ff" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${gradientId}-line`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#005ce6" />
            <stop offset="55%" stopColor="#0a84ff" />
            <stop offset="100%" stopColor="#5cc8ff" />
          </linearGradient>
          <filter id={`${gradientId}-glow`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {[0.22, 0.48, 0.74].map((level) => (
          <line
            key={level}
            x1="0"
            x2={width}
            y1={height * level}
            y2={height * level}
            className="trend-grid-line"
          />
        ))}

        <path d={area} fill={`url(#${gradientId}-area)`} className="trend-area" />
        <path
          d={linePath}
          stroke={`url(#${gradientId}-line)`}
          className="trend-path trend-path-glow"
          filter={`url(#${gradientId}-glow)`}
        />
        <path d={linePath} stroke={`url(#${gradientId}-line)`} className="trend-path" />

        {lastPoint ? (
          <>
            <circle cx={lastPoint[0]} cy={lastPoint[1]} r="11" className="trend-point-halo" />
            <circle cx={lastPoint[0]} cy={lastPoint[1]} r="6" className="trend-point" />
            <circle cx={lastPoint[0]} cy={lastPoint[1]} r="2.5" className="trend-point-core" />
          </>
        ) : null}
      </svg>
    </div>
  );
}

type GraphPanelMode = "trend" | "activity";

const graphPanelModes: Array<{ id: GraphPanelMode; label: string }> = [
  { id: "trend", label: "Trend" },
  { id: "activity", label: "Activity" },
];

function ActivityList({
  activities,
  loading,
}: {
  activities: PoolActivity[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="activity-panel-shell">
        <div className="activity-empty">Loading recent activity...</div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="activity-panel-shell">
        <div className="activity-empty">No pool activity yet. Borrow, repay, deposit, and redeem events will show up here.</div>
      </div>
    );
  }

  return (
    <div className="activity-panel-shell">
      <ul className="activity-list">
        {activities.map((activity) => (
          <li key={activity.id} className={`activity-row activity-row-${activity.kind}`}>
            <div className="activity-row-main">
              <div className="activity-row-title">
                <span className="activity-kind-dot" aria-hidden="true" />
                <strong>{activity.label}</strong>
                {activity.amount !== undefined ? (
                  <span className="activity-amount">{fmtUsdAdaptive(activity.amount)}</span>
                ) : null}
              </div>
              <p className="activity-detail">{activity.detail}</p>
            </div>
            <div className="activity-row-meta">
              <span>{fmtRelativeTime(activity.timestamp)}</span>
              {activity.actor ? <span>{fmtAddress(activity.actor)}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type MemberPanelProps = {
  pool: PoolState | null;
  member: MemberPosition;
  valueHistory: number[];
  poolActivity: PoolActivity[];
  activityLoading: boolean;
  depositAmount: string;
  redeemShares: string;
  busy: string | null;
  walletConnected: boolean;
  onDepositAmountChange: (value: string) => void;
  onRedeemSharesChange: (value: string) => void;
  onDeposit: () => void;
  onRedeem: () => void;
};

export function MemberPanel({
  pool,
  member,
  valueHistory,
  poolActivity,
  activityLoading,
  depositAmount,
  redeemShares,
  busy,
  walletConnected,
  onDepositAmountChange,
  onRedeemSharesChange,
  onDeposit,
  onRedeem,
}: MemberPanelProps) {
  const [graphMode, setGraphMode] = useState<GraphPanelMode>("trend");
  const headlineValue =
    member.shares > 0n ? member.redeemableAssets : (pool?.totalAssets ?? 0n);
  const headlineLabel = member.shares > 0n ? "Account value" : "Pool NAV";
  const headlineNote =
    member.shares > 0n ? fmtTokenPrecise(member.redeemableAssets) : pool ? fmtTokenPrecise(pool.totalAssets) : "--";
  const currentValue = Number(formatUnits(headlineValue || 0n, USDC_DECIMALS));
  const points = buildChartPoints(valueHistory, currentValue, CHART_POINT_COUNT);

  return (
    <section className="workspace-grid workspace-grid-member">
      <article className="member-graph-panel">
        <div className="graph-head">
          <div>
            <span className="eyebrow">{headlineLabel}</span>
            <h2>{fmtUsdPrecise(headlineValue)}</h2>
          </div>
          <div className="graph-head-actions">
            <div className="mini-switcher graph-panel-switcher" aria-label="Account value view">
              {graphPanelModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setGraphMode(mode.id)}
                  className={`mini-switch${graphMode === mode.id ? " is-active" : ""}`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <span className="delta-positive">{headlineNote}</span>
          </div>
        </div>
        <div className="graph-frame">
          {graphMode === "trend" ? (
            <TrendGraph points={points} />
          ) : (
            <ActivityList activities={poolActivity} loading={activityLoading} />
          )}
        </div>
        <div className="member-stat-row">
          <div>
            <span className="eyebrow">Share balance</span>
            <strong>{formatUnits(member.shares, USDC_DECIMALS)} shares</strong>
          </div>
          <div>
            <span className="eyebrow">NAV / share</span>
            <strong>{pool ? `$${toUsdc(pool.navPerShare1e18, NAV_DECIMALS).toFixed(4)}` : "--"}</strong>
          </div>
          <div>
            <span className="eyebrow">Pool APR</span>
            <strong>{pool ? fmtPct(pool.interestRateBps) : "--"}</strong>
          </div>
        </div>
      </article>

      <aside className="member-action-rail">
        <div className="member-data-grid">
          <label className="member-data-cell">
            <span>Deposit amount</span>
            <input
              className="member-grid-input"
              type="number"
              min="0"
              step="0.01"
              value={depositAmount}
              onChange={(e) => onDepositAmountChange(e.target.value)}
            />
          </label>
          <label className="member-data-cell">
            <span>Redeem shares</span>
            <input
              className="member-grid-input"
              type="number"
              min="0"
              step="0.0001"
              placeholder={formatUnits(member.shares, USDC_DECIMALS)}
              value={redeemShares}
              onChange={(e) => onRedeemSharesChange(e.target.value)}
            />
          </label>
          <div className="member-data-cell">
            <span>Redeemable today</span>
            <strong>{fmtUsdPrecise(member.redeemableAssets)}</strong>
          </div>
          <div className="member-data-cell">
            <span>Liquidity</span>
            <strong>{pool ? fmtUsdPrecise(pool.cash) : "--"}</strong>
          </div>
        </div>
        <div className="member-button-stack">
          <button className="btn-primary member-action-button" onClick={onDeposit} disabled={!!busy || !walletConnected}>
            {busy === "Approving and depositing" ? "Submitting" : "Deposit"}
          </button>
          <button className="btn-secondary member-action-button" onClick={onRedeem} disabled={!!busy || !walletConnected}>
            {busy === "Redeeming shares" ? "Submitting" : "Redeem"}
          </button>
        </div>
      </aside>
    </section>
  );
}

function BorrowingProgress({ pool }: { pool: PoolState | null }) {
  const utilization =
    pool && pool.creditCap > 0n
      ? Math.min(100, Number((pool.outstandingPrincipal * 10_000n) / pool.creditCap) / 100)
      : 0;

  return (
    <div className="utilization-meter">
      <div className="utilization-meter-head">
        <span>Line utilization</span>
        <strong>{pool ? `${utilization.toFixed(1)}%` : "--"}</strong>
      </div>
      <div
        className="utilization-track"
        role="progressbar"
        aria-valuenow={utilization}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Credit line utilization"
      >
        <div
          className={`utilization-bar${utilization > 0 ? " has-fill" : ""}`}
          style={{ width: `${utilization}%` }}
        />
      </div>
    </div>
  );
}

type VendorPanelProps = {
  pool: PoolState | null;
  drawAmount: string;
  repayAmount: string;
  busy: string | null;
  walletConnected: boolean;
  onDrawAmountChange: (value: string) => void;
  onRepayAmountChange: (value: string) => void;
  onDrawdown: () => void;
  onRepay: () => void;
};

export function VendorPanel({
  pool,
  drawAmount,
  repayAmount,
  busy,
  walletConnected,
  onDrawAmountChange,
  onRepayAmountChange,
  onDrawdown,
  onRepay,
}: VendorPanelProps) {
  return (
    <section className="workspace-grid workspace-grid-vendor">
      <article className="workspace-panel credit-panel">
        <div className="workspace-heading">
          <div>
            <span className="eyebrow">Vendor credit</span>
            <strong>Borrowing line</strong>
          </div>
        </div>
        <div className="portfolio-balance">
          <h2>{pool ? fmtUsd(pool.availableToBorrow) : "--"}</h2>
        </div>
        <BorrowingProgress pool={pool} />
        <div className="detail-list">
          <div>
            <span>Borrower wallet</span>
            <strong>{pool ? fmtAddress(pool.company) : "--"}</strong>
          </div>
          <div>
            <span>Underwritten cap</span>
            <strong>{pool ? fmtUsd(pool.creditCap) : "--"}</strong>
          </div>
          <div>
            <span>Outstanding debt</span>
            <strong>{pool ? fmtUsdAdaptive(pool.outstandingPrincipal) : "--"}</strong>
          </div>
          <div>
            <span>Pool APR</span>
            <strong>{pool ? fmtPct(pool.interestRateBps) : "--"}</strong>
          </div>
          <div>
            <span>Due date</span>
            <strong>{pool ? fmtDate(pool.dueAt) : "--"}</strong>
          </div>
          <div>
            <span>Utilization</span>
            <strong>
              {pool && pool.creditCap > 0n
                ? `${((Number(pool.outstandingPrincipal) / Number(pool.creditCap)) * 100).toFixed(1)}%`
                : "--"}
            </strong>
          </div>
        </div>
      </article>

      <article className="workspace-panel action-panel">
        <div className="workspace-heading">
          <div>
            <span className="eyebrow">Treasury</span>
            <strong>Draw or repay</strong>
          </div>
        </div>
        <div className="form-grid">
          <label className="field-stack">
            <span>Drawdown amount</span>
            <input
              className="field-input"
              type="number"
              min="0"
              step="0.01"
              value={drawAmount}
              onChange={(e) => onDrawAmountChange(e.target.value)}
            />
          </label>
          <label className="field-stack">
            <span>Repay amount</span>
            <input
              className="field-input"
              type="number"
              min="0"
              step="0.01"
              value={repayAmount}
              onChange={(e) => onRepayAmountChange(e.target.value)}
            />
          </label>
        </div>
        <div className="button-row">
          <button className="btn-primary" onClick={onDrawdown} disabled={!!busy || !walletConnected}>
            {busy === "Drawing down" ? "Submitting..." : "Draw down"}
          </button>
          <button className="btn-secondary" onClick={onRepay} disabled={!!busy || !walletConnected}>
            {busy === "Repaying" ? "Submitting..." : "Approve + repay"}
          </button>
        </div>
        <div className="detail-list">
          <div>
            <span>Pool cash</span>
            <strong>{pool ? fmtUsdAdaptive(pool.cash) : "--"}</strong>
          </div>
          <div>
            <span>Borrow headroom</span>
            <strong>
              {pool
                ? fmtUsd(
                    pool.creditCap > pool.outstandingPrincipal
                      ? pool.creditCap - pool.outstandingPrincipal
                      : 0n,
                  )
                : "--"}
            </strong>
          </div>
          <div>
            <span>Borrower</span>
            <strong>{pool ? fmtAddress(pool.company) : "--"}</strong>
          </div>
        </div>
      </article>
    </section>
  );
}

type UnderwritePanelProps = {
  backendBase: string;
  form: UnderwritePayload;
  result: UnderwriteResult | null;
  busy: string | null;
  onChange: (key: keyof UnderwritePayload, value: string) => void;
  onSubmit: () => void;
};

function UnderwritePanel({
  backendBase,
  form,
  result,
  busy,
  onChange,
  onSubmit,
}: UnderwritePanelProps) {
  return (
    <article className="workspace-panel underwriting-panel">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">Underwriting</span>
          <strong>Credit terms</strong>
        </div>
      </div>
      <div className="underwrite-grid">
        {(Object.keys(form) as Array<keyof UnderwritePayload>).map((key) => (
          <label key={key} className="field-stack">
            <span>{key === "vendor" ? "pool company" : key}</span>
            <input
              className="field-input"
              type={key === "vendor" ? "text" : "number"}
              min={key === "vendor" ? undefined : "0"}
              step={key === "vendor" ? undefined : "1"}
              readOnly={key === "vendor"}
              value={String(form[key])}
              onChange={(e) => onChange(key, e.target.value)}
            />
          </label>
        ))}
      </div>
      <button className="btn-primary" onClick={onSubmit} disabled={!!busy}>
        {busy === "Running underwriting" ? "Posting report..." : "Run underwriting"}
      </button>
      {result ? (
        <div className="underwrite-result">
          <div>
            <span className="eyebrow">Risk</span>
            <strong>{result.inference.riskScore}</strong>
          </div>
          <div>
            <span className="eyebrow">Cap</span>
            <strong>{fmtUsd(BigInt(result.cap))}</strong>
          </div>
          <div>
            <span className="eyebrow">APR</span>
            <strong>{fmtPct(result.interestRateBps)}</strong>
          </div>
          <div>
            <span className="eyebrow">Tx</span>
            <strong>{fmtAddress(result.txHash)}</strong>
          </div>
        </div>
      ) : null}
    </article>
  );
}

type OperatorPanelProps = {
  pool: PoolState | null;
  backendBase: string;
  form: UnderwritePayload;
  result: UnderwriteResult | null;
  busy: string | null;
  walletConnected: boolean;
  onChange: (key: keyof UnderwritePayload, value: string) => void;
  onSubmit: () => void;
  onMarkDefaulted: () => void;
  onRefresh: () => void;
};

export function OperatorPanel({
  pool,
  backendBase,
  form,
  result,
  busy,
  walletConnected,
  onChange,
  onSubmit,
  onMarkDefaulted,
  onRefresh,
}: OperatorPanelProps) {
  return (
    <section className="workspace-grid workspace-grid-operator">
      <article className="workspace-panel operator-panel">
        <div className="workspace-heading">
          <div>
            <span className="eyebrow">Operations</span>
            <strong>Pool state</strong>
          </div>
        </div>
        <div className="detail-list operator-details">
          <div>
            <span>Pool NAV</span>
            <strong>{pool ? fmtUsdAdaptive(pool.totalAssets) : "--"}</strong>
          </div>
          <div>
            <span>Cash</span>
            <strong>{pool ? fmtUsdAdaptive(pool.cash) : "--"}</strong>
          </div>
          <div>
            <span>Accrued interest</span>
            <strong>{pool ? fmtUsdAdaptive(pool.accruedInterest) : "--"}</strong>
          </div>
          <div>
            <span>Grace period</span>
            <strong>{pool ? `${Number(pool.defaultGracePeriod) / 3600} hrs` : "--"}</strong>
          </div>
          <div>
            <span>NAV / share</span>
            <strong>{pool ? `$${toUsdc(pool.navPerShare1e18, NAV_DECIMALS).toFixed(4)}` : "--"}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{pool ? (pool.defaulted ? "Defaulted" : "Active") : "--"}</strong>
          </div>
        </div>
        <div className="button-row operator-buttons">
          <button className="btn-primary" onClick={onRefresh} disabled={!!busy}>
            Refresh state
          </button>
          <button className="btn-secondary" onClick={onMarkDefaulted} disabled={!!busy || !walletConnected}>
            {busy === "Marking default" ? "Submitting..." : "Mark defaulted"}
          </button>
        </div>
      </article>

      <UnderwritePanel
        backendBase={backendBase}
        form={form}
        result={result}
        busy={busy}
        onChange={onChange}
        onSubmit={onSubmit}
      />
    </section>
  );
}
