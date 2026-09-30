import React from 'react';
import ReactDOM from 'react-dom/client';
import PerfHarness from './PerfHarness';
import './index.css';

const root = document.getElementById('perf-root');
if (!root) throw new Error('The performance page root is missing.');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <PerfHarness />
  </React.StrictMode>,
);
