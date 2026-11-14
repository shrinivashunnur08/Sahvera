import React, { useState } from 'react';
import { calculateOperatorEconomics } from '../core/engine';
import type { EconomicsInputs, PilotFeedback } from '../core/types';

interface EconomicsPilotViewProps {
  pilotFeedback: PilotFeedback[];
  isDemoMode: boolean;
  onAddPilotFeedback: (entry: Omit<PilotFeedback, 'id' | 'orgId' | 'ownerUid' | 'createdAt'>) => Promise<void>;
}

const PRICING_OPTIONS = [
  {
    name: 'Free Limited Trial',
    audience: 'For 1–2 room validation',
    illustrativePrice: 'INR 0 / month',
    limits: 'Up to 3 active rooms · Offline rules included · Capped opt-in Gemini checks',
  },
  {
    name: 'Per-Property Hypothesis',
    audience: 'For single independent PG (20–60 beds)',
    illustrativePrice: 'INR 999 / month (illustrative)',
    limits: 'Unlimited rooms for 1 property · Full audit log · Configurable AI quota',
  },
  {
    name: 'Multi-Property Pilot',
    audience: 'For 2–5 properties (60–150 beds)',
    illustrativePrice: 'INR 2,499 / month (illustrative)',
    limits: 'Shared org roles · Cross-property isolation · Design-partner feedback support',
  },
];

const ICP_PRESETS: { id: string; label: string; values: Partial<EconomicsInputs> }[] = [
  {
    id: 'single_pg',
    label: 'Single 30-bed PG',
    values: {
      monthlyRentInr: 12000,
      turnoverEventsPerMonth: 4,
      unreadyDaysPerTurnover: 1.5,
      avoidableCoordinationHours: 6,
      hourlyAdminValueInr: 250,
      proposedMonthlyFeeInr: 999,
      monthlyDepositDisputeExposureInr: 1500,
    },
  },
  {
    id: 'high_churn_student',
    label: 'High-Churn Student Hostel (120 beds · Pune/Kota)',
    values: {
      monthlyRentInr: 10500,
      turnoverEventsPerMonth: 18,
      unreadyDaysPerTurnover: 1.5,
      avoidableCoordinationHours: 16,
      hourlyAdminValueInr: 250,
      proposedMonthlyFeeInr: 1999,
      monthlyDepositDisputeExposureInr: 4500,
    },
  },
  {
    id: 'multi_building',
    label: 'Multi-Property Operator (3 buildings / 180 beds)',
    values: {
      monthlyRentInr: 13500,
      turnoverEventsPerMonth: 24,
      unreadyDaysPerTurnover: 1.0,
      avoidableCoordinationHours: 22,
      hourlyAdminValueInr: 300,
      proposedMonthlyFeeInr: 2499,
      monthlyDepositDisputeExposureInr: 6000,
    },
  },
];

export const EconomicsPilotView: React.FC<EconomicsPilotViewProps> = ({
  pilotFeedback,
  isDemoMode,
  onAddPilotFeedback,
}) => {
  const [inputs, setInputs] = useState<EconomicsInputs>({
    monthlyRentInr: 12000,
    turnoverEventsPerMonth: 4,
    unreadyDaysPerTurnover: 1.5,
    avoidableCoordinationHours: 6,
    hourlyAdminValueInr: 250,
    hasMeasuredBaseline: false,
    proposedMonthlyFeeInr: 999,
    marginalAiCloudCostInr: 85,
    marginalSupportMinutes: 20,
    supportHourlyCostInr: 400,
    monthlyDepositDisputeExposureInr: 1500,
  });
  const [activePresetId, setActivePresetId] = useState<string>('single_pg');

  const outputs = calculateOperatorEconomics(inputs);

  const [partnerAlias, setPartnerAlias] = useState('');
  const [consentRecorded, setConsentRecorded] = useState(false);
  const [baselineHours, setBaselineHours] = useState('0');
  const [firstSessionMins, setFirstSessionMins] = useState('4');
  const [majorBlocker, setMajorBlocker] = useState('');
  const [wtpInr, setWtpInr] = useState('0');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSaveFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackError(null);
    if (!partnerAlias.trim() || !consentRecorded) {
      setFeedbackError('Partner alias and explicit interview consent checkbox are required.');
      return;
    }
    setSubmitting(true);
    try {
      await onAddPilotFeedback({
        partnerAlias: partnerAlias.trim(),
        consentRecorded,
        dataClassification: isDemoMode ? 'synthetic_example' : 'anonymized_pilot_note',
        baselineCoordinationHours: Number(baselineHours) || 0,
        firstSessionMinutes: Number(firstSessionMins) || 0,
        majorBlocker: majorBlocker.trim() || 'None reported',
        willingnessToPayInr: Number(wtpInr) || 0,
      });
      setPartnerAlias('');
      setMajorBlocker('');
      setConsentRecorded(false);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Unable to save pilot note.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Value Hypothesis Calculator */}
      <section className="rounded-lg border border-[#DEDBD2] bg-white p-6 space-y-6">
        <div className="space-y-2">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-semibold text-[#111C1B]">
              Operator economics &amp; value hypothesis (unvalidated assumptions)
            </h2>
            <p className="text-xs text-[#4A5957]">
              Customer acquisition, churn, conversion, and willingness to pay are NOT yet measured.
              Pick an ICP segment preset or adjust inputs below to inspect the unit economics transparently.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-medium text-[#4A5957]">ICP segment preset:</span>
            {ICP_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setActivePresetId(preset.id);
                  setInputs((prev) => ({ ...prev, ...preset.values }));
                }}
                className={`min-h-[32px] rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  activePresetId === preset.id
                    ? 'border-[#0F4C4C] bg-[#F0F5F4] text-[#0F4C4C]'
                    : 'border-[#DEDBD2] bg-white text-[#4A5957] hover:text-[#111C1B]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7 grid gap-4 sm:grid-cols-2 text-xs">
            <div>
              <label htmlFor="econ-rent" className="block font-medium text-[#111C1B] mb-1">
                Monthly room/bed rent (INR)
              </label>
              <input
                id="econ-rent"
                type="number"
                min={0}
                value={inputs.monthlyRentInr}
                onChange={(e) =>
                  setInputs({ ...inputs, monthlyRentInr: Number(e.target.value) || 0 })
                }
                className="font-mono-num min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-3 py-1.5"
              />
            </div>

            <div>
              <label htmlFor="econ-turnovers" className="block font-medium text-[#111C1B] mb-1">
                Turnover events / month
              </label>
              <input
                id="econ-turnovers"
                type="number"
                min={0}
                value={inputs.turnoverEventsPerMonth}
                onChange={(e) =>
                  setInputs({ ...inputs, turnoverEventsPerMonth: Number(e.target.value) || 0 })
                }
                className="font-mono-num min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-3 py-1.5"
              />
            </div>

            <div>
              <label htmlFor="econ-days" className="block font-medium text-[#111C1B] mb-1">
                Observed unready days / turnover
              </label>
              <input
                id="econ-days"
                type="number"
                min={0}
                step="0.5"
                value={inputs.unreadyDaysPerTurnover}
                onChange={(e) =>
                  setInputs({ ...inputs, unreadyDaysPerTurnover: Number(e.target.value) || 0 })
                }
                className="font-mono-num min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-3 py-1.5"
              />
            </div>

            <div>
              <label htmlFor="econ-hours" className="block font-medium text-[#111C1B] mb-1">
                Avoidable coordination hours / month
              </label>
              <input
                id="econ-hours"
                type="number"
                min={0}
                value={inputs.avoidableCoordinationHours}
                onChange={(e) =>
                  setInputs({ ...inputs, avoidableCoordinationHours: Number(e.target.value) || 0 })
                }
                className="font-mono-num min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-3 py-1.5"
              />
            </div>

            <div>
              <label htmlFor="econ-hourly" className="block font-medium text-[#111C1B] mb-1">
                Operator hourly admin value (INR)
              </label>
              <input
                id="econ-hourly"
                type="number"
                min={0}
                value={inputs.hourlyAdminValueInr}
                onChange={(e) =>
                  setInputs({ ...inputs, hourlyAdminValueInr: Number(e.target.value) || 0 })
                }
                className="font-mono-num min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-3 py-1.5"
              />
            </div>

            <div>
              <label htmlFor="econ-fee" className="block font-medium text-[#111C1B] mb-1">
                Proposed monthly software fee (INR)
              </label>
              <input
                id="econ-fee"
                type="number"
                min={0}
                value={inputs.proposedMonthlyFeeInr}
                onChange={(e) =>
                  setInputs({ ...inputs, proposedMonthlyFeeInr: Number(e.target.value) || 0 })
                }
                className="font-mono-num min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-3 py-1.5"
              />
            </div>

            <div>
              <label htmlFor="econ-ai-cost" className="block font-medium text-[#111C1B] mb-1">
                Marginal AI/cloud cost (INR/mo)
              </label>
              <input
                id="econ-ai-cost"
                type="number"
                min={0}
                value={inputs.marginalAiCloudCostInr}
                onChange={(e) =>
                  setInputs({ ...inputs, marginalAiCloudCostInr: Number(e.target.value) || 0 })
                }
                className="font-mono-num min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-3 py-1.5"
              />
            </div>

            <div>
              <label htmlFor="econ-support-mins" className="block font-medium text-[#111C1B] mb-1">
                Support time (minutes/mo)
              </label>
              <input
                id="econ-support-mins"
                type="number"
                min={0}
                value={inputs.marginalSupportMinutes}
                onChange={(e) =>
                  setInputs({ ...inputs, marginalSupportMinutes: Number(e.target.value) || 0 })
                }
                className="font-mono-num min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-3 py-1.5"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="econ-deposit-dispute" className="block font-medium text-[#111C1B] mb-1">
                Monthly deposit dispute exposure (INR — optional Move-In vs Move-Out photo baseline)
              </label>
              <input
                id="econ-deposit-dispute"
                type="number"
                min={0}
                value={inputs.monthlyDepositDisputeExposureInr ?? 0}
                onChange={(e) =>
                  setInputs({
                    ...inputs,
                    monthlyDepositDisputeExposureInr: Number(e.target.value) || 0,
                  })
                }
                className="font-mono-num min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-3 py-1.5"
              />
            </div>

            <div className="sm:col-span-2 pt-1">
              <label className="inline-flex items-center gap-2 text-xs text-[#111C1B]">
                <input
                  type="checkbox"
                  checked={inputs.hasMeasuredBaseline}
                  onChange={(e) => setInputs({ ...inputs, hasMeasuredBaseline: e.target.checked })}
                  className="h-4 w-4 accent-[#0F4C4C]"
                />
                <span>
                  Measured operator baseline exists (when unchecked, verified admin time &amp; deposit
                  dispute value stay INR 0)
                </span>
              </label>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-md border border-[#DEDBD2] bg-[#F7F6F2] p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-3 border-b border-[#DEDBD2] pb-2">
              <span className="text-[#4A5957]">
                Potential rent exposure (opportunity-cost illustration, NOT proved loss)
              </span>
              <strong className="font-mono-num shrink-0 whitespace-nowrap text-sm text-[#111C1B]">
                INR {outputs.potentialRentExposureInr.toLocaleString('en-IN')}
              </strong>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-[#DEDBD2] pb-2">
              <span className="text-[#4A5957]">
                Admin time value ({inputs.hasMeasuredBaseline ? 'baseline checked' : 'unverified / no baseline'})
              </span>
              <strong className="font-mono-num shrink-0 whitespace-nowrap text-sm text-[#111C1B]">
                INR {outputs.adminTimeValueInr.toLocaleString('en-IN')}
              </strong>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-[#DEDBD2] pb-2">
              <span className="text-[#4A5957]">
                Deposit dispute avoidance ({inputs.hasMeasuredBaseline ? 'baseline checked' : 'unverified / no baseline'})
              </span>
              <strong className="font-mono-num shrink-0 whitespace-nowrap text-sm text-[#111C1B]">
                INR {outputs.depositDisputeAvoidedInr.toLocaleString('en-IN')}
              </strong>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-[#DEDBD2] pb-2">
              <span className="text-[#4A5957]">Operator net hypothesis (value − fee)</span>
              <strong className="font-mono-num shrink-0 whitespace-nowrap text-sm text-[#0F4C4C]">
                INR {outputs.operatorNetHypothesisInr.toLocaleString('en-IN')}
              </strong>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-[#DEDBD2] pb-2">
              <span className="text-[#4A5957]">
                Vendor gross margin hypothesis (before sales &amp; fixed costs)
              </span>
              <strong className="font-mono-num shrink-0 whitespace-nowrap text-sm text-[#111C1B]">
                INR {outputs.vendorGrossMarginHypothesisInr.toLocaleString('en-IN')}
              </strong>
            </div>

            <ul className="space-y-1 pt-1 text-[11px] text-[#92400E]">
              <li>• Potential vacancy exposure != realized lost revenue</li>
              <li>• Estimated time &amp; deposit savings != verified savings</li>
              <li>• Subscription projections != actual turnover or MRR</li>
            </ul>
          </div>
        </div>

        {/* Testable B2B pricing options */}
        <div className="border-t border-[#DEDBD2] pt-5 space-y-3">
          <h3 className="font-display text-sm font-semibold text-[#111C1B]">
            Testable B2B pricing hypotheses (illustrative; to be validated with operators)
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            {PRICING_OPTIONS.map((opt) => (
              <div key={opt.name} className="rounded-md border border-[#DEDBD2] p-4 space-y-1.5">
                <div className="text-xs text-[#4A5957]">{opt.audience}</div>
                <div className="font-display text-sm font-semibold text-[#111C1B]">{opt.name}</div>
                <div className="font-mono-num text-sm font-bold text-[#0F4C4C]">
                  {opt.illustrativePrice}
                </div>
                <p className="text-xs text-[#4A5957]">{opt.limits}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Design Partner Research Module (empty by default) & Competition Evidence */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold text-[#111C1B]">
              Design partner research log (empty by default)
            </h2>
            <p className="text-xs text-[#4A5957]">
              Captures consenting operator interviews without real PII. Zero entries until collected.
            </p>
          </div>

          <form onSubmit={handleSaveFeedback} className="space-y-3 text-xs">
            {feedbackError && (
              <div role="alert" className="text-[#B91C1C]">
                {feedbackError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="partner-alias" className="block text-[#4A5957] mb-1">
                  Partner alias (anonymized)
                </label>
                <input
                  id="partner-alias"
                  type="text"
                  placeholder="e.g. Pune-PG-Operator-01"
                  value={partnerAlias}
                  onChange={(e) => setPartnerAlias(e.target.value)}
                  className="min-h-[36px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1"
                />
              </div>
              <div>
                <label htmlFor="partner-wtp" className="block text-[#4A5957] mb-1">
                  Willingness to pay (INR/mo)
                </label>
                <input
                  id="partner-wtp"
                  type="number"
                  min={0}
                  value={wtpInr}
                  onChange={(e) => setWtpInr(e.target.value)}
                  className="font-mono-num min-h-[36px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1"
                />
              </div>
              <div>
                <label htmlFor="partner-baseline-hrs" className="block text-[#4A5957] mb-1">
                  Baseline coordination hrs/wk
                </label>
                <input
                  id="partner-baseline-hrs"
                  type="number"
                  min={0}
                  value={baselineHours}
                  onChange={(e) => setBaselineHours(e.target.value)}
                  className="font-mono-num min-h-[36px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1"
                />
              </div>
              <div>
                <label htmlFor="partner-session-mins" className="block text-[#4A5957] mb-1">
                  1st session completion (min)
                </label>
                <input
                  id="partner-session-mins"
                  type="number"
                  min={0}
                  value={firstSessionMins}
                  onChange={(e) => setFirstSessionMins(e.target.value)}
                  className="font-mono-num min-h-[36px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1"
                />
              </div>
            </div>
            <div>
              <label htmlFor="partner-blocker" className="block text-[#4A5957] mb-1">
                Major blocker observed
              </label>
              <input
                id="partner-blocker"
                type="text"
                placeholder="e.g. Plumber arrives unannounced; warden unsure if cleaning can start"
                value={majorBlocker}
                onChange={(e) => setMajorBlocker(e.target.value)}
                className="min-h-[36px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1"
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={consentRecorded}
                onChange={(e) => setConsentRecorded(e.target.checked)}
                className="h-4 w-4 accent-[#0F4C4C]"
              />
              <span>Operator explicitly consented to anonymized research notes</span>
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[38px] rounded-md bg-[#0F4C4C] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0A3838]"
            >
              {submitting ? 'Saving…' : 'Record interview note'}
            </button>
          </form>

          <div className="border-t border-[#DEDBD2] pt-3">
            {pilotFeedback.length === 0 ? (
              <p className="text-xs text-[#4A5957]">
                0 interview entries recorded (truthful empty default).
              </p>
            ) : (
              <ul className="divide-y divide-[#DEDBD2] text-xs">
                {pilotFeedback.map((pf) => (
                  <li key={pf.id} className="py-2">
                    <div className="font-semibold text-[#111C1B]">
                      {pf.partnerAlias} · {pf.dataClassification.replace(/_/g, ' ')} · WTP INR{' '}
                      <span className="font-mono-num">{pf.willingnessToPayInr}</span>
                    </div>
                    <div className="text-[#4A5957]">{pf.majorBlocker}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Evidence Grouping Table */}
        <section className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-4">
          <h2 className="font-display text-base font-semibold text-[#111C1B]">
            Competition &amp; evidence classification
          </h2>
          <div className="space-y-3 text-xs">
            <div className="rounded-md border border-[#DEDBD2] p-3">
              <div className="font-semibold text-[#111C1B]">Synthetic (Demo only)</div>
              <p className="text-[#4A5957] mt-0.5">
                Room 203 Pune walkthrough &amp; sample Hinglish/English messages demonstrating
                deterministic DAG flagging and missing-date guards.
              </p>
            </div>
            <div className="rounded-md border border-[#DEDBD2] p-3">
              <div className="font-semibold text-[#111C1B]">Founder-reported</div>
              <p className="text-[#4A5957] mt-0.5">
                Fresh TypeScript/Node + Firestore re-implementation of Sahvera workflow; RentOk
                feature overlap observed via public product descriptions (rooms, tickets, rent
                reminders, WhatsApp updates).
              </p>
            </div>
            <div className="rounded-md border border-[#DEDBD2] p-3">
              <div className="font-semibold text-[#111C1B]">Direct operator feedback</div>
              <p className="text-[#4A5957] mt-0.5">
                {pilotFeedback.filter((p) => p.dataClassification === 'anonymized_pilot_note').length}{' '}
                entry/entries recorded in workspace.
              </p>
            </div>
            <div className="rounded-md border border-[#DEDBD2] p-3">
              <div className="font-semibold text-[#111C1B]">Independently verified</div>
              <p className="text-[#4A5957] mt-0.5">
                None claimed yet. Automated unit tests verify engine invariants locally; commercial
                willingness to pay remains unverified.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* 8-Part Commercial Model & 5-Question Validation Interview Script */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-7 rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold text-[#111C1B]">
              Eight-part commercial hypothesis (pre-validation)
            </h2>
            <p className="text-xs text-[#4A5957]">
              Explicit assumptions for operator interviews; zero live sales or revenue claimed.
            </p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2 text-xs">
            <li className="rounded-md border border-[#DEDBD2] p-3 space-y-1">
              <div className="font-semibold text-[#111C1B]">1. Initial customer segment</div>
              <p className="text-[#4A5957]">
                Independent PGs, hostels &amp; co-living operators (~20–150 beds) in Mumbai, Pune,
                and Bengaluru with recurring monthly turnover and multi-vendor coordination.
              </p>
            </li>
            <li className="rounded-md border border-[#DEDBD2] p-3 space-y-1">
              <div className="font-semibold text-[#111C1B]">2. Alternatives &amp; RentOk</div>
              <p className="text-[#4A5957]">
                RentOk, spreadsheets, and WhatsApp groups already cover room ledgers, rent reminders,
                and complaint tickets. Sahvera targets the unhandled pre-move-in dependency chain.
              </p>
            </li>
            <li className="rounded-md border border-[#DEDBD2] p-3 space-y-1">
              <div className="font-semibold text-[#111C1B]">3. Cost of current workflow</div>
              <p className="text-[#4A5957]">
                Preventable move-in friction at 7 PM, wasted housekeeping visits when upstream
                repairs slip, and warden/owner call-chasing across Hinglish/Marathi/Hindi threads.
              </p>
            </li>
            <li className="rounded-md border border-[#DEDBD2] p-3 space-y-1">
              <div className="font-semibold text-[#111C1B]">4. Distribution strategy</div>
              <p className="text-[#4A5957]">
                Founder-led property visits in Pune/Mumbai/Bengaluru corridors and local PG operator
                clusters using the free 1–2 room walkthrough as an immediate trust wedge.
              </p>
            </li>
            <li className="rounded-md border border-[#DEDBD2] p-3 space-y-1">
              <div className="font-semibold text-[#111C1B]">5. Per-property pricing</div>
              <p className="text-[#4A5957]">
                Illustrative tiers: INR 0 limited trial (up to 3 rooms), INR 999/mo per property,
                INR 2,499/mo multi-property pilot — subject to WTP testing.
              </p>
            </li>
            <li className="rounded-md border border-[#DEDBD2] p-3 space-y-1">
              <div className="font-semibold text-[#111C1B]">6. Variable AI &amp; support cost</div>
              <p className="text-[#4A5957]">
                Offline rules cost INR 0. Opt-in Gemini text/audio calls are capped per property/hr
                (est. ~INR 85/mo cloud+AI + ~20 min/mo onboarding support in calculator).
              </p>
            </li>
            <li className="rounded-md border border-[#DEDBD2] p-3 space-y-1">
              <div className="font-semibold text-[#111C1B]">7. WTP validation method</div>
              <p className="text-[#4A5957]">
                Run the 5-question interview below on real last-week turnover incidents before asking
                for paid commitments; log anonymized answers above only with consent.
              </p>
            </li>
            <li className="rounded-md border border-[#DEDBD2] p-3 space-y-1">
              <div className="font-semibold text-[#111C1B]">8. Retention &amp; usage</div>
              <p className="text-[#4A5957]">
                Retention depends on monthly bed churn (2–6+ handovers/property/mo) and whether
                wardens adopt Sahvera alongside WhatsApp without extra data-entry fatigue.
              </p>
            </li>
          </ol>
        </section>

        <section className="lg:col-span-5 rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold text-[#111C1B]">
              Five-question operator interview script
            </h2>
            <p className="text-xs text-[#4A5957]">
              Non-leading questions to validate urgency, baseline friction, and willingness to pay.
            </p>
          </div>
          <ol className="list-decimal pl-4 space-y-2.5 text-xs text-[#111C1B]">
            <li>
              <strong>Last handover incident:</strong> &ldquo;Walk me through the last time a new
              resident arrived and a room was not ready. Which vendor or step slipped?&rdquo;
            </li>
            <li>
              <strong>Cascading rework:</strong> &ldquo;When an electrician or plumber runs late,
              how do housekeeping and your warden find out before wasting a trip?&rdquo;
            </li>
            <li>
              <strong>WhatsApp ambiguity:</strong> &ldquo;How do you track unconfirmed vendor replies
              like &lsquo;kal 11 baje koshish karunga&rsquo; across 5+ vacant rooms?&rdquo;
            </li>
            <li>
              <strong>Existing tools:</strong> &ldquo;What do you already use (RentOk, Excel,
              registers), and what still falls through the cracks before move-in?&rdquo;
            </li>
            <li>
              <strong>Real price test:</strong> &ldquo;If Sahvera prevented one delayed room
              handover a month, would you pilot it free for 2 weeks, and what monthly price per
              property feels fair versus a waste?&rdquo;
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
};
