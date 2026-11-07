import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Panel from './Panel.jsx';
import '../index.css';
import '../ui.css'; // the panel's design (Paper v3): shell, onboarding, overview, cards, chat, tooltips
import { initTooltips } from '../tooltip.js';

initTooltips();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Panel />
  </StrictMode>,
);
