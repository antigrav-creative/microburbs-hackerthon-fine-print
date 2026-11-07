import { TOOL_LABELS } from '../../../agent/agent.js';

/** A finished tool call, as people see it: "✓ Checking rentals nearby" (no raw data). */
export default function ToolCall({ id, name, response }) {
  const state = !response ? 'running' : response.isError ? 'err' : 'done';
  return (
    <div data-call={id} className={`meta tool-line ${state}`}>
      {TOOL_LABELS[name] ?? name}
    </div>
  );
}
