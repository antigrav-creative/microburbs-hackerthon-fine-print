import Icon from '../../icons.jsx';
import { openPage } from '../../open-page.js';

const k = (n) => `$${Math.round(n / 1000)}K`;

/** Night-chrome header (Figma 2:765): brand, toolbar, and the investor criteria strip. */
export default function Header({ brief, onBrief, onNew, onClose }) {
  const criteria =
    brief?.onboarded && brief.budget
      ? [`${k(brief.budget)} budget`, `≥${brief.minYield}% yield`, `${brief.holdYears}y hold`]
      : ['brief: not set'];
  const iconBtn =
    'grid h-[30px] w-[30px] place-items-center rounded-[8px] border-none bg-transparent p-0 text-night-muted transition-colors hover:bg-night-line hover:text-night-text';
  return (
    <header className="shrink-0 bg-night px-[18px] pb-[14px] pt-[16px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[10px]">
          <span className="grid h-[30px] w-[30px] place-items-center rounded-[7px] bg-[#f3f8fa] text-[21px] leading-none text-night">F</span>
          <span className="text-[19px] leading-none tracking-[-0.5px] text-night-text">Fine Print</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            title="Open your shortlist"
            onClick={() => openPage('src/ui/shortlist.html')}
            className="flex items-center gap-1.5 rounded-[8px] border border-night-line bg-transparent px-2.5 py-[7px] text-[12px] text-night-text transition-colors hover:bg-night-line"
          >
            <Icon name="bookmark" size={14} className="text-night-muted" />
            Shortlist
          </button>
          <button
            title="Start a new thread"
            onClick={onNew}
            className="rounded-[8px] border border-night-line bg-transparent px-2.5 py-[7px] text-[12px] text-night-text transition-colors hover:bg-night-line"
          >
            New
          </button>
          <button title="Keys and settings" aria-label="Settings" onClick={() => openPage('options.html')} className={iconBtn}>
            <Icon name="settings-2" size={18} />
          </button>
          <button title="Hide" aria-label="Hide" onClick={onClose} className={iconBtn}>
            <Icon name="x" size={18} />
          </button>
        </div>
      </div>
      <div className="mt-[14px] flex w-full items-center justify-between">
        <span className="text-[10px] font-semibold tracking-[1.5px] text-night-muted">PROPERTY INTELLIGENCE</span>
        <button
          title="Edit your investor brief"
          onClick={onBrief}
          className="flex items-center gap-3 border-none bg-transparent p-0 text-[11px] text-night-text"
        >
          {criteria.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </button>
      </div>
    </header>
  );
}
