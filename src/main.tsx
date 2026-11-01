import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { applyTheme, startLiveData, theme } from './state';
import './styles/base.css';
import './styles/list.css';
import './styles/shell.css';

// A home-screen app resumes instead of reloading, so it has to look for new versions itself.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration?.update();
    });
  },
});

applyTheme(theme.value);
startLiveData();
render(<App />, document.getElementById('app')!);
