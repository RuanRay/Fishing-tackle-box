import { Boxes, ClipboardCheck, Fish, Search, Settings as SettingsIcon } from 'lucide-preact';
import { CutDialog } from './ui/components/CutDialog';
import { GearEditor } from './ui/components/GearEditor';
import { Compare } from './ui/pages/Compare';
import { Equipment } from './ui/pages/Equipment';
import { Inventory } from './ui/pages/Inventory';
import { Settings } from './ui/pages/Settings';
import { Trips } from './ui/pages/Trips';
import { cutting, editing, gear, importedAt, lastBackupAt, loaded, tab, toast } from './state';
import type { Tab } from './state';

const BACKUP_DAYS = 14;
const NAV: { name: Tab; Icon: typeof Boxes }[] = [
  { name: '裝備', Icon: Fish },
  { name: '出發', Icon: ClipboardCheck },
  { name: '比對', Icon: Search },
  { name: '庫存', Icon: Boxes },
];

function BackupReminder() {
  const last = lastBackupAt.value ?? importedAt.value;
  if (!gear.value.length || !last || Date.now() - last < BACKUP_DAYS * 86_400_000) return null;
  return (
    <div class="banner">
      超過 {BACKUP_DAYS} 天沒備份
      <button onClick={() => (tab.value = '設定')}>去備份</button>
    </div>
  );
}

function Page() {
  if (!loaded.value) return null;
  if (tab.value === '設定') return <Settings />;
  if (!gear.value.length) {
    return (
      <section class="card pad">
        <h2>還沒有資料</h2>
        <p>到設定匯入 v2 Excel，就能開始使用。</p>
        <button class="primary" onClick={() => (tab.value = '設定')}>
          前往設定
        </button>
      </section>
    );
  }
  if (tab.value === '裝備') return <Equipment />;
  if (tab.value === '出發') return <Trips />;
  if (tab.value === '比對') return <Compare />;
  return <Inventory />;
}

export function App() {
  const current = editing.value;
  return (
    <div class="app">
      <header class="top">
        <h1>{tab.value}</h1>
        <span class="local">僅存本機</span>
        <button class="icon" aria-label="設定" onClick={() => (tab.value = '設定')}>
          <SettingsIcon size={24} aria-hidden="true" />
        </button>
      </header>
      <main class="body">
        <BackupReminder />
        <Page />
      </main>
      <nav class="nav">
        {NAV.map(({ name, Icon }) => (
          <button key={name} class={tab.value === name ? 'on' : ''} onClick={() => (tab.value = name)}>
            <Icon size={22} aria-hidden="true" />
            {name}
          </button>
        ))}
      </nav>
      {current && <GearEditor key={current === 'new' ? 'new' : current.id} source={current} />}
      {cutting.value && <CutDialog g={cutting.value} />}
      {toast.value && (
        <div class="toast" role="status">
          {toast.value.text}
          {toast.value.undo && (
            <button
              onClick={() => {
                toast.value?.undo?.();
                toast.value = null;
              }}
            >
              復原
            </button>
          )}
        </div>
      )}
    </div>
  );
}
