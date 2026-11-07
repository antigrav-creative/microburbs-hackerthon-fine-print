import DomNode from './DomNode.jsx';
import { chart } from '../../charts.js';

/**
 * Reusable chart for React: <Chart type="bars" items={[{ label: 'Zetland', value: 4.7 }]} />
 * Types: bars · columns · line · meter (see charts.js). Re-draws when the props change.
 */
export default function Chart({ type, className = '', ...opts }) {
  return <DomNode className={className} build={() => chart(type, opts)} deps={[type, JSON.stringify(opts, (k, v) => (typeof v === 'function' ? String(v) : v))]} />;
}
