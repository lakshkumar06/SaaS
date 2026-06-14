import type { ReactNode } from "react";
import { formatUnits } from "viem";

import { fmtAddress, fmtCompactNumber, fmtDate, fmtPct, fmtUsd, toUsdc } from "../lib/format";
import type {
  MemberPosition,
  PoolState,
  UnderwritePayload,
  UnderwriteResult,
} from "../lib/dashboardTypes";

type HeroSectionProps = {
  wallet?: string;
  poolAddress: string;
  connectControl: ReactNode;
};

export function HeroSection({ wallet, poolAddress, connectControl }: HeroSectionProps) {
  return (
    <section className="mb-[22px] grid items-end gap-[18px] lg:grid-cols-[1.8fr_1fr]">
      <div>
        <p className="mb-2.5 text-xs tracking-[0.18em] text-accent uppercase">Arc Testnet Credit Pool</p>
        <h1 className="mb-4 text-[clamp(3rem,8vw,6rem)] leading-[0.94]">Stake &amp; Advance</h1>
        <p className="max-w-[62ch] text-[1.08rem] leading-relaxed text-muted">
          One operating screen for LPs, borrowers, and keepers. Reads live pool state from Arc
          testnet and sends underwriting to the local backend.
        </p>
      </div>
      <div className="panel-surface grid gap-2.5 rounded-[28px] p-[22px]">
        <p className="text-[0.94rem] text-muted">Connected wallet</p>
        <strong>{fmtAddress(wallet)}</strong>
        <span className="text-[0.94rem] text-muted">Pool {fmtAddress(poolAddress)}</span>
        {connectControl}
      </div>
    </section>
  );
}

type StatsSectionProps = {
  pool: PoolState | null;
};

export function StatsSection({ pool }: StatsSectionProps) {
  const stats = pool
    ? [
        { label: "NAV", value: fmtUsd(pool.totalAssets) },
        { label: "APR", value: fmtPct(pool.interestRateBps) },
        { label: "Cash", value: fmtUsd(pool.cash) },
        { label: "Outstanding Debt", value: fmtUsd(pool.outstandingPrincipal) },
        { label: "Available Borrow", value: fmtUsd(pool.availableToBorrow) },
        { label: "Accrued Interest", value: fmtUsd(pool.accruedInterest) },
      ]
    : [];

  return (
    <section className="my-[18px] grid gap-[18px] sm:grid-cols-2 xl:grid-cols-6">
      {stats.map((item) => (
        <article key={item.label} className="panel-surface rounded-[20px] p-[18px]">
          <span className="text-[0.94rem] text-muted">{item.label}</span>
          <strong className="mt-2 block text-[1.3rem]">{item.value}</strong>
        </article>
      ))}
    </section>
  );
}

type MetaSectionProps = {
  pool: PoolState | null;
};

export function MetaSection({ pool }: MetaSectionProps) {
  return (
    <section className="mb-[18px] grid gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
      <div className="panel-surface rounded-[20px] p-[18px]">
        <span className="text-[0.94rem] text-muted">NAV / share</span>
        <strong className="mt-2 block text-[1.3rem]">
          {pool ? `$${toUsdc(pool.navPerShare1e18, 18).toFixed(4)}` : "--"}
        </strong>
      </div>
      <div className="panel-surface rounded-[20px] p-[18px]">
        <span className="text-[0.94rem] text-muted">Due at</span>
        <strong className="mt-2 block text-[1.3rem]">{pool ? fmtDate(pool.dueAt) : "--"}</strong>
      </div>
      <div className="panel-surface rounded-[20px] p-[18px]">
        <span className="text-[0.94rem] text-muted">Grace period</span>
        <strong className="mt-2 block text-[1.3rem]">
          {pool ? `${fmtCompactNumber(Number(pool.defaultGracePeriod) / 3600)} hrs` : "--"}
        </strong>
      </div>
      <div className="panel-surface rounded-[20px] p-[18px]">
        <span className="text-[0.94rem] text-muted">Status</span>
        <strong className="mt-2 block text-[1.3rem]">
          {pool ? (pool.defaulted ? "Defaulted" : "Active") : "--"}
        </strong>
      </div>
    </section>
  );
}

type MemberPanelProps = {
  pool: PoolState | null;
  member: MemberPosition;
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
  depositAmount,
  redeemShares,
  busy,
  walletConnected,
  onDepositAmountChange,
  onRedeemSharesChange,
  onDeposit,
  onRedeem,
}: MemberPanelProps) {
  return (
    <article className="panel-surface grid content-start gap-3.5 rounded-[28px] p-[22px]">
      <div className="mb-1 flex items-start justify-between gap-4 max-sm:flex-col">
        <div>
          <p className="mb-2.5 text-xs tracking-[0.18em] text-accent uppercase">Member</p>
          <h2 className="text-[1.65rem]">Deposit and redeem</h2>
        </div>
        <div className="text-right max-sm:text-left">
          <span className="text-[0.94rem] text-muted">
            {pool ? formatUnits(member.shares, 18) : "--"} shares
          </span>
          <strong className="mt-1.5 block text-[1.1rem]">
            {pool ? fmtUsd(member.redeemableAssets) : "--"} redeemable
          </strong>
        </div>
      </div>

      <label className="grid gap-2 text-[0.96rem] text-muted">
        Deposit amount
        <input
          className="field-input"
          type="number"
          min="0"
          step="0.01"
          value={depositAmount}
          onChange={(e) => onDepositAmountChange(e.target.value)}
        />
      </label>
      <button className="btn-primary" onClick={onDeposit} disabled={!!busy || !walletConnected}>
        {busy === "Approving and depositing" ? "Submitting..." : "Approve + deposit"}
      </button>

      <label className="grid gap-2 text-[0.96rem] text-muted">
        Redeem shares
        <input
          className="field-input"
          type="number"
          min="0"
          step="0.0001"
          placeholder={formatUnits(member.shares, 18)}
          value={redeemShares}
          onChange={(e) => onRedeemSharesChange(e.target.value)}
        />
      </label>
      <button className="btn-primary" onClick={onRedeem} disabled={!!busy || !walletConnected}>
        {busy === "Redeeming shares" ? "Submitting..." : "Redeem"}
      </button>
    </article>
  );
}

type CompanyPanelProps = {
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

export function CompanyPanel({
  pool,
  drawAmount,
  repayAmount,
  busy,
  walletConnected,
  onDrawAmountChange,
  onRepayAmountChange,
  onDrawdown,
  onRepay,
}: CompanyPanelProps) {
  return (
    <article className="panel-surface grid content-start gap-3.5 rounded-[28px] p-[22px]">
      <div className="mb-1 flex items-start justify-between gap-4 max-sm:flex-col">
        <div>
          <p className="mb-2.5 text-xs tracking-[0.18em] text-accent uppercase">Company</p>
          <h2 className="text-[1.65rem]">Borrow and repay</h2>
        </div>
        <div className="text-right max-sm:text-left">
          <span className="text-[0.94rem] text-muted">Credit cap</span>
          <strong className="mt-1.5 block text-[1.1rem]">{pool ? fmtUsd(pool.creditCap) : "--"}</strong>
        </div>
      </div>

      <label className="grid gap-2 text-[0.96rem] text-muted">
        Drawdown amount
        <input
          className="field-input"
          type="number"
          min="0"
          step="0.01"
          value={drawAmount}
          onChange={(e) => onDrawAmountChange(e.target.value)}
        />
      </label>
      <button className="btn-primary" onClick={onDrawdown} disabled={!!busy || !walletConnected}>
        {busy === "Drawing down" ? "Submitting..." : "Draw down"}
      </button>

      <label className="grid gap-2 text-[0.96rem] text-muted">
        Repay amount
        <input
          className="field-input"
          type="number"
          min="0"
          step="0.01"
          value={repayAmount}
          onChange={(e) => onRepayAmountChange(e.target.value)}
        />
      </label>
      <button className="btn-primary" onClick={onRepay} disabled={!!busy || !walletConnected}>
        {busy === "Repaying" ? "Submitting..." : "Approve + repay"}
      </button>
    </article>
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

export function UnderwritePanel({
  backendBase,
  form,
  result,
  busy,
  onChange,
  onSubmit,
}: UnderwritePanelProps) {
  return (
    <article className="panel-surface grid content-start gap-3.5 rounded-[28px] p-[22px]">
      <div className="mb-1 flex items-start justify-between gap-4">
        <div>
          <p className="mb-2.5 text-xs tracking-[0.18em] text-accent uppercase">Backend</p>
          <h2 className="text-[1.65rem]">Underwrite vendor</h2>
        </div>
        <span className="text-[0.94rem] text-muted">{backendBase}</span>
      </div>

      {(Object.keys(form) as Array<keyof UnderwritePayload>).map((key) => (
        <label key={key} className="grid gap-2 text-[0.96rem] text-muted">
          {key}
          <input
            className="field-input"
            type={key === "vendor" ? "text" : "number"}
            min={key === "vendor" ? undefined : "0"}
            step={key === "vendor" ? undefined : "1"}
            value={String(form[key])}
            onChange={(e) => onChange(key, e.target.value)}
          />
        </label>
      ))}

      <button className="btn-primary" onClick={onSubmit} disabled={!!busy}>
        {busy === "Running underwriting" ? "Posting report..." : "Run underwriting"}
      </button>

      {result ? (
        <div className="grid gap-1.5 rounded-2xl bg-[rgba(12,108,86,0.08)] p-3.5 text-accent-strong">
          <strong>Risk {result.inference.riskScore}</strong>
          <span>Cap {fmtUsd(BigInt(result.cap))}</span>
          <span>APR {fmtPct(result.interestRateBps)}</span>
          <span>Tx {fmtAddress(result.txHash)}</span>
        </div>
      ) : null}
    </article>
  );
}

type FooterSectionProps = {
  busy: string | null;
  status: string;
  onMarkDefaulted: () => void;
  onRefresh: () => void;
};

export function FooterSection({
  busy,
  status,
  onMarkDefaulted,
  onRefresh,
}: FooterSectionProps) {
  return (
    <section className="grid gap-[18px] sm:grid-cols-2">
      <article className="panel-surface grid gap-3.5 rounded-[28px] p-[22px]">
        <p className="mb-2.5 text-xs tracking-[0.18em] text-accent uppercase">Keeper</p>
        <h2 className="text-[1.65rem]">Default trigger</h2>
        <p className="leading-relaxed text-muted">
          Anyone can call `markDefaulted()` once the debt is past due and beyond the grace
          period.
        </p>
        <button className="btn-primary" onClick={onMarkDefaulted} disabled={!!busy}>
          {busy === "Marking default" ? "Submitting..." : "Mark defaulted"}
        </button>
      </article>

      <article className="panel-surface grid gap-3.5 rounded-[28px] p-[22px]">
        <p className="mb-2.5 text-xs tracking-[0.18em] text-accent uppercase">Live status</p>
        <h2 className="text-[1.65rem]">Session</h2>
        <p className="leading-relaxed text-muted">{status}</p>
        <button className="btn-primary" onClick={onRefresh} disabled={!!busy}>
          Refresh state
        </button>
      </article>
    </section>
  );
}
