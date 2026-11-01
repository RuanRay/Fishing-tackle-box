import { render } from 'preact';
import { App } from './app';
import { applyTheme, startLiveData, theme } from './state';
import './styles/base.css';
import './styles/list.css';
import './styles/shell.css';

applyTheme(theme.value);
startLiveData();
render(<App />, document.getElementById('app')!);
