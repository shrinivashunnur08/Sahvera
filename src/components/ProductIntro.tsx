import React from 'react';
import { ArrowRight, CheckCircle2, ShieldCheck, AlertTriangle } from 'lucide-react';

interface ProductIntroProps {
  onTryDemo: () => void;
  onSignIn: () => void;
  onOpenEvaluators: () => void;
  isSignedIn: boolean;
  onOpenRealWorkspace: () => void;
  authBusy: boolean;
  authError: string | null;
}

export const ProductIntro: React.FC<ProductIntroProps> = ({
  onTryDemo,
  onSignIn,
  onOpenEvaluators,
  isSignedIn,
  onOpenRealWorkspace,
  authBusy,
  authError,
}) => {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:py-14">
      <section className="grid gap-10 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-7 space-y-6">
          <p className="text-sm font-medium text-[#0F4C4C]">
            Room-handover exception engine for Indian PG, hostel &amp; co-living operators
          </p>

          <h1
            className="font-display text-3xl font-bold tracking-tight text-[#111C1B] sm:text-5xl leading-[1.12]"
            style={{ textWrap: 'balance' }}
          >
            Sahvera — Room Ready, With Proof.
          </h1>

          <p className="max-w-2xl text-base leading-relaxed text-[#4A5957] sm:text-lg">
            Turn messy Hinglish, Hindi, Marathi, or English vendor WhatsApp updates and voice notes
            into clear downstream room risk, targeted clarification questions, and human-approved
            next actions—so residents never arrive at 7 PM with luggage to an unready room.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {isSignedIn ? (
              <button
                type="button"
                onClick={onOpenRealWorkspace}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#0F4C4C] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0A3838] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C4C]"
              >
                <span>Open my workspace</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSignIn}
                disabled={authBusy}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#0F4C4C] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0A3838] disabled:opacity-60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C4C]"
              >
                <span>{authBusy ? 'Signing in…' : 'Sign in with Google'}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={onTryDemo}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-[#DEDBD2] bg-white px-5 py-2.5 text-sm font-semibold text-[#111C1B] hover:bg-[#EFEDE6] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C4C]"
            >
              Try Interactive Sandbox
            </button>

            <button
              type="button"
              onClick={onOpenEvaluators}
              className="inline-flex min-h-[44px] items-center px-3 py-2 text-sm font-medium text-[#4A5957] hover:text-[#0F4C4C] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C4C]"
            >
              AI Evaluation &amp; Architecture
            </button>
          </div>

          {authError && (
            <div
              role="alert"
              className="rounded-md border border-[#B91C1C]/30 bg-red-50 px-4 py-3 text-sm text-[#991B1B]"
            >
              {authError}
            </div>
          )}

          <p className="text-xs text-[#4A5957]">
            Operator workspaces are isolated per verified Google account in Cloud Firestore. External
            Gemini AI runs only when explicitly opted in.
          </p>
        </div>

        <aside className="lg:col-span-5 rounded-lg border border-[#DEDBD2] bg-white p-6 space-y-5">
          <h2 className="font-display text-base font-semibold text-[#111C1B]">
            One workflow, start to proof
          </h2>
          <ol className="space-y-3.5 text-sm text-[#4A5957]">
            <li className="flex items-start gap-3">
              <span className="font-mono-num mt-0.5 text-xs font-semibold text-[#0F4C4C]">01</span>
              <span>
                <strong className="font-medium text-[#111C1B]">Ordered room checklist</strong> —
                painting, electrical, cleaning, inspection, plus independent tasks in a cycle-checked dependency graph.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-mono-num mt-0.5 text-xs font-semibold text-[#0F4C4C]">02</span>
              <span>
                <strong className="font-medium text-[#111C1B]">Safe vendor intake</strong> —
                paste Hinglish/Hindi/Marathi/English replies (e.g. &ldquo;Bhai, plumber 2 ghante late hoga&rdquo;) or transcribe opt-in voice notes.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-mono-num mt-0.5 text-xs font-semibold text-[#0F4C4C]">03</span>
              <span>
                <strong className="font-medium text-[#111C1B]">Explicit uncertainty</strong> —
                bare times like &ldquo;11 AM&rdquo; or &ldquo;kal&rdquo; without a calendar date are never silently converted into confirmed slots.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-mono-num mt-0.5 text-xs font-semibold text-[#0F4C4C]">04</span>
              <span>
                <strong className="font-medium text-[#111C1B]">Human sign-off &amp; handover gate</strong> —
                downstream teams flag at risk; final handover stays locked until vendor confirmations and safety checks pass.
              </span>
            </li>
          </ol>
        </aside>
      </section>

      <section className="mt-12 border-t border-[#DEDBD2] pt-10 grid gap-8 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-[#111C1B]">
            Focused on the pre-move-in dependency gap
          </h2>
          <p className="text-sm leading-relaxed text-[#4A5957]">
            Property ledgers and rent-collection apps already handle room rosters, payment
            reminders, and tenant complaints. Sahvera focuses specifically on the multi-vendor
            turnover chain before a resident moves in—ensuring an electrical delay never leaves
            housekeeping waiting or guests stranded at check-in.
          </p>
        </div>

        <div className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold text-[#111C1B]">
            Product boundaries
          </h3>
          <ul className="space-y-2 text-sm text-[#4A5957]">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[#15803D]" aria-hidden="true" />
              <span>Included: Turnover DAG, offline &amp; opt-in Gemini parsing, human approvals, follow-up queue, verified handover checklist.</span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#B45309]" aria-hidden="true" />
              <span>Excluded: No rent collection, payments, KYC, marketplace listings, or unattended auto-replies to vendors.</span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-[#0F4C4C]" aria-hidden="true" />
              <span>Built for 20–150 bed independent PGs, hostels, and co-living operators across Indian cities.</span>
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
};
