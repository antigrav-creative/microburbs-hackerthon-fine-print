import { useRef, useState } from 'react';
import Icon from '../../icons.jsx';

/** The follow-up input (Figma 2:939): pill container, teal send key, grows with the draft. */
export default function AskForm({ busy, onSend }) {
  const [value, setValue] = useState('');
  const ref = useRef(null);
  const empty = !value.trim();

  const submit = (e) => {
    e.preventDefault();
    if (busy || empty) return;
    onSend(value);
    setValue('');
    if (ref.current) ref.current.style.height = 'auto';
  };

  const grow = (el) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(e);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex shrink-0 items-center gap-2 border-t border-line bg-card px-4 py-5"
    >
      <div className="flex flex-1 items-center gap-2 rounded-[14px] border border-line bg-paper py-[7px] pl-[14px] pr-[7px] transition-colors focus-within:border-muted">
        <textarea
          ref={ref}
          rows={1}
          placeholder={busy ? 'Thinking…' : 'Ask a follow-up…'}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            grow(e.target);
          }}
          onKeyDown={onKeyDown}
          className="max-h-[120px] flex-1 resize-none border-none bg-transparent outline-none"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={busy || empty}
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border-none bg-brand p-0 text-white transition-opacity hover:opacity-85 disabled:opacity-30"
        >
          <Icon name="arrow-up" size={17} />
        </button>
      </div>
    </form>
  );
}
