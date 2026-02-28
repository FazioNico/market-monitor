type LandingExperienceProps = {
  onEnter: () => void;
};

const dashboardCapabilities = [
  {
    title: "Clarity",
    detail: "See the important move",
  },
  {
    title: "Confidence",
    detail: "Decide with context",
  },
  {
    title: "Discipline",
    detail: "Read risk before acting",
  },
  {
    title: "Consistency",
    detail: "A fresh brief every day",
  },
];

export function LandingExperience({ onEnter }: LandingExperienceProps) {
  return (
    <div className="landing-stage">
      <div className="landing-aurora landing-aurora-cyan" />
      <div className="landing-aurora landing-aurora-gold" />
      <div className="landing-grid-plane" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1600px] items-center px-4 py-8 sm:px-6 lg:px-10">
        <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)] lg:items-center">
          <section className="space-y-8">

            <div className="space-y-6">
              <p className="max-w-xl text-sm font-medium uppercase tracking-[0.28em] text-zinc-400">
                Precision for daily decisions
              </p>
              <h1 className="max-w-4xl font-display text-5xl font-bold leading-[0.94] tracking-[-0.03em] text-white sm:text-6xl lg:text-7xl">
                Trade with clarity.
                <br />
                Decide with confidence.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-zinc-300 sm:text-lg">
                Get a clearer view of the market, understand the key risks,
                and review the latest daily brief so you can make decisions
                with more context, more discipline, and less noise.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={onEnter}
                className="landing-cta inline-flex items-center justify-center rounded-full px-7 py-3.5 font-display text-sm font-semibold uppercase tracking-[0.24em] text-ink-950"
              >
                Open the dashboard
              </button>

            </div>
          </section>

          <section className="landing-glass relative overflow-hidden rounded-[2rem] p-5 sm:p-6">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />

            <div className="relative z-10 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-zinc-400">
                    Outcome
                  </p>
                  <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-white">
                    Your edge
                  </p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-gold-300">
                  Every day
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 sm:p-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  {dashboardCapabilities.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08]">
                          <span className="relative block h-4 w-4">
                            <span className="absolute inset-x-0 top-0 h-[2px] rounded-full bg-cyan-200" />
                            <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-cyan-300" />
                            <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-gold-300" />
                          </span>
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {item.title}
                          </p>
                          <p className="text-xs leading-5 text-zinc-400">
                            {item.detail}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08] px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/70">
                    Daily report
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-200">
                    A concise written read of the market, generated each day.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
