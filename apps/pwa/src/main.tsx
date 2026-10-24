import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import App from '@/App';
import '@/index.css';

declare global {
  interface Window {
    __ombShowFatal?: (msg?: string) => void;
  }
}

/* 渲染期抛异常时 React 会把整棵树卸掉 —— 用户看到的就是一片黑。
   这里接住，交给 index.html 里那块兜底面板显示原因。 */
class FatalBoundary extends Component<{ children: ReactNode }, { dead: boolean }> {
  state = { dead: false };

  static getDerivedStateFromError() {
    return { dead: true };
  }

  componentDidCatch(error: Error) {
    window.__ombShowFatal?.(`${error.name}: ${error.message}`);
  }

  render() {
    if (this.state.dead) return null;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FatalBoundary>
      <App />
    </FatalBoundary>
  </StrictMode>,
);
