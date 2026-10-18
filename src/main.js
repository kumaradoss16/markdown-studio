import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/editor.css';
import './styles/toolbar.css';
import './styles/preview.css';
import './styles/file-tree.css';

import { bootstrapApp } from './app/bootstrap.js';

window.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (root) {
    bootstrapApp(root);
  }
});
