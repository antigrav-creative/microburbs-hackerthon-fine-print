import { renderMarkdown } from '../../markdown.js';

/**
 * One chat item. User = dark bubble; agent = Markdown on the page (no bubble).
 * renderMarkdown escapes ALL HTML first and emits only a fixed set of tags + http(s)
 * links, so the model can't inject markup.
 */
export default function Message({ kind, text }) {
  if (kind === 'user') return <div className="msg user">{text}</div>;
  if (kind === 'agent' || kind === 'agentPre') {
    return <div className={`msg agent md${kind === 'agentPre' ? ' pre' : ''}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(text ?? '') }} />;
  }
  return <div className="msg error">{text}</div>;
}
