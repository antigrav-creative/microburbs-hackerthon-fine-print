import { useEffect, useMemo, useRef } from 'react';
import { FIRST_READ_TEXT } from '../../../agent/agent.js';
import { normaliseBlockArgs } from '../../../agent/ui-blocks.js';
import { renderBlock } from '../../blocks.js';
import { renderMarkdown } from '../../markdown.js';
import DomNode from './DomNode.jsx';
import Message from './Message.jsx';
import ToolCall from './ToolCall.jsx';

const META_CLASS = 'shrink-0 self-center font-mono text-[10px] text-muted';

/**
 * Transcript records → render items:
 * - "Read this listing." (the automatic trigger) isn't shown
 * - a retried card call repeats its prose and a concluding reply repeats it again — show it once
 * - render_ui_block calls become cards (body from the tool RESULT — cards fill themselves
 *   from the brief); a failed card shows a small note, dropped once a retry in the same
 *   turn succeeds
 */
export function deriveItems(messages) {
  const items = [];
  const byCall = new Map();
  let lastProse = null;
  let turn = 0;
  for (const m of messages) {
    if (m.role === 'system') continue; // legacy hidden trigger — never rendered
    if (m.role === 'user') {
      turn++;
      lastProse = null;
      if (m.text !== FIRST_READ_TEXT) items.push({ key: items.length, kind: 'user', text: m.text });
    } else if (m.role === 'agent') {
      if ((m.text ?? '').trim() !== lastProse) items.push({ key: items.length, kind: 'agent', text: m.text ?? '' });
    } else if (m.role === 'tool_request') {
      const onlyCards = (m.calls ?? []).every((c) => c.name === 'render_ui_block');
      const prose = (m.text ?? '').trim();
      if (prose && prose !== lastProse) items.push({ key: items.length, kind: onlyCards ? 'agent' : 'agentPre', text: m.text });
      if (prose) lastProse = prose;
      for (const c of m.calls ?? []) {
        const item = { key: items.length, kind: c.name === 'render_ui_block' ? 'card' : 'tool', id: c.id, name: c.name, args: c.args, turn, response: null };
        byCall.set(c.id, item);
        items.push(item);
      }
    } else if (m.role === 'tool_response') {
      const item = byCall.get(m.call_id);
      if (item) item.response = { text: m.text, isError: Boolean(m.is_error) };
    }
  }
  const drawnTurns = new Set(items.filter((i) => i.kind === 'card' && i.response && !i.response.isError).map((i) => i.turn));
  return items.filter((i) => !(i.kind === 'card' && (!i.response || (i.response.isError && drawnTurns.has(i.turn)))));
}

function cardOf(item) {
  if (item.response.isError) {
    let why = item.response.text;
    try {
      why = JSON.parse(item.response.text).error;
    } catch {
      /* raw */
    }
    return { failed: String(why).slice(0, 160) };
  }
  let { template, body } = normaliseBlockArgs(item.args);
  try {
    const res = JSON.parse(item.response.text);
    if (res.body) ({ template, body } = { template: res.template ?? template, body: res.body });
  } catch {
    /* older result shape */
  }
  return { template, body };
}

export default function Thread({ overview, messages, liveText, statusLine, eventLines, turnMeta, turnError }) {
  const items = useMemo(() => deriveItems(messages), [messages]);
  const mainRef = useRef(null);
  const prevUsers = useRef(0);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    // follow the stream only if the reader is at the bottom; always follow a sent message
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    const users = items.reduce((n, i) => n + (i.kind === 'user' ? 1 : 0), 0);
    if (nearBottom || users !== prevUsers.current) el.scrollTop = el.scrollHeight;
    prevUsers.current = users;
  }, [items, liveText, eventLines.length, statusLine, turnMeta, turnError]);

  return (
    <main ref={mainRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-5">
      {overview}
      {!overview && items.length === 0 && liveText === null && (
        <div className="meta mt-6 self-center text-center">
          Open a listing on realestate.com.au or Domain
          <br />
          and it appears here, scored against your brief.
        </div>
      )}
      {items.map((it) => {
        if (it.kind === 'tool') return <ToolCall key={it.key} {...it} />;
        if (it.kind === 'card') {
          const c = cardOf(it);
          return c.failed ? (
            <div key={it.key} className={META_CLASS}>{`✕ card not drawn: ${c.failed}`}</div>
          ) : (
            <DomNode key={it.key} build={() => renderBlock(c.template, c.body)} deps={[it.response?.text]} />
          );
        }
        return <Message key={it.key} {...it} />;
      })}
      {statusLine && <div className={META_CLASS}>{statusLine}</div>}
      {eventLines.map((line) => (
        <div key={line.id} className={META_CLASS}>
          {line.text}
        </div>
      ))}
      {liveText !== null && (
        <div className="md fp-live shrink-0 self-stretch px-0.5 text-[13.5px] leading-[1.6]" dangerouslySetInnerHTML={{ __html: renderMarkdown(liveText) }} />
      )}
      {turnMeta && <div className={META_CLASS}>{turnMeta}</div>}
      {turnError && <Message kind="error" text={turnError} />}
    </main>
  );
}
