import Icon from '../../icons.jsx';

/** "Go beyond the listing" — agent-generated follow-up questions as full-width rows (Figma 2:925). */
export default function Starters({ busy, questions, loading, onPick }) {
  // stay mounted while busy (no layout jump) but dimmed and inert
  const inert = busy || loading;
  return (
    <div className={`flex shrink-0 flex-col px-3 pb-1 ${inert ? 'pointer-events-none opacity-45' : ''}`}>
      <div className="flex items-center gap-2 px-1 pb-1 pt-2.5 text-[14px] text-ink">
        <Icon name="sparkles" size={17} className="text-brand" />
        Go beyond the listing
      </div>
      <div className="flex flex-col">
        {questions.map((s) => (
          <button
            key={s}
            disabled={inert}
            onClick={() => onPick(s)}
            className="flex w-full items-center justify-between gap-2 rounded-none border-b-0 border-none bg-transparent px-1 py-2 text-left text-[12px] text-muted transition-colors hover:bg-card/60 hover:text-ink"
          >
            <span className="truncate">{s}</span>
            <Icon name="arrow-up-right" size={14} className="shrink-0 text-brand" />
          </button>
        ))}
      </div>
    </div>
  );
}
