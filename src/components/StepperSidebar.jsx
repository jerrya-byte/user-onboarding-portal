// Vertical sidebar stepper for the candidate paged form.
// Sections are listed top-to-bottom; the candidate can jump to any
// section freely. Completed sections show a checkmark; the current
// section is highlighted; future sections are dimmed but clickable.
//
// Accessibility:
//   - Rendered as a <nav> with aria-label so screen readers can
//     skip to it as a landmark.
//   - Each step is a <button> (real focusable element, keyboard-
//     activatable) with aria-current="step" on the active one.

export default function StepperSidebar({ sections, currentKey, completed = {}, onJump }) {
  return (
    <nav aria-label="Onboarding sections" className="gov-stepper-sidebar">
      <ol className="space-y-1 list-none p-0 m-0">
        {sections.map((s, i) => {
          const isCurrent = s.key === currentKey;
          const isDone = !!completed[s.key];
          const stateCls = isCurrent
            ? 'border-navy bg-navy text-white'
            : isDone
              ? 'border-green-700 bg-green-50 text-green-800'
              : 'border-border bg-bg text-ink-mid hover:bg-slate-50';
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => onJump?.(s.key)}
                aria-current={isCurrent ? 'step' : undefined}
                className={`w-full text-left flex items-start gap-3 p-3 rounded-md border-l-4
                            transition-colors min-h-[64px]
                            focus-visible:outline-2 focus-visible:outline-offset-2
                            focus-visible:outline-gold-light ${stateCls}`}
              >
                <span
                  aria-hidden="true"
                  className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center
                              text-[12px] font-bold ${
                                isCurrent
                                  ? 'bg-gold-light text-navy-dark'
                                  : isDone
                                    ? 'bg-green-700 text-white'
                                    : 'bg-slate-200 text-ink-mid'
                              }`}
                >
                  {isDone ? '✓' : i + 1}
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-semibold leading-tight">
                    {s.label}
                  </span>
                  {s.hint && (
                    <span className={`block text-[11px] mt-0.5 ${isCurrent ? 'text-slate1' : 'text-ink-soft'}`}>
                      {s.hint}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
