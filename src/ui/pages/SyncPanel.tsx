import { useEffect, useState } from 'preact/hooks';
import { liveQuery } from 'dexie';
import { db } from '../../data/db';
import type { Conflict } from '../../data/db';
import { dropConflict, restoreConflict } from '../../data/sync';
import { showToast } from '../../state';
import {
  accountEmail,
  failedPhotos,
  pendingCount,
  requestSync,
  resolveFirstSync,
  signIn,
  signOut,
  syncAvailable,
  syncStatus,
} from '../../syncClient';

const STATUS_TEXT = {
  off: '尚未設定',
  signedOut: '尚未登入',
  syncing: '同步中',
  synced: '已同步',
  pending: '等待同步',
  offline: '離線，連線後自動同步',
  error: '同步失敗，稍後會再試',
  choose: '需要你選擇',
};

function loginError(e: unknown) {
  const code = (e as { code?: string }).code ?? '';
  if (code === 'auth/too-many-requests') return '嘗試太多次，請稍後再試';
  if (code === 'auth/network-request-failed') return '目前沒有網路';
  return '帳號或密碼不正確';
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email.trim(), password);
      setPassword('');
    } catch (err) {
      setError(loginError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form class="form" onSubmit={submit}>
      <label class="field">
        Email
        <input
          required
          type="email"
          autoComplete="username"
          value={email}
          onInput={(e) => setEmail(e.currentTarget.value)}
        />
      </label>
      <label class="field">
        密碼
        <input
          required
          type="password"
          autoComplete="current-password"
          value={password}
          onInput={(e) => setPassword(e.currentTarget.value)}
        />
      </label>
      {error && <p class="error">{error}</p>}
      <button class="primary" type="submit" disabled={busy}>
        登入
      </button>
    </form>
  );
}

function FirstSyncChoice() {
  const [confirming, setConfirming] = useState<'cloud' | 'device'>();
  const label = { cloud: '用雲端資料取代這台裝置', device: '用這台裝置取代雲端資料' };
  return (
    <>
      <p class="error">這台裝置和雲端都有資料。先在下方匯出 Excel 備份，再選擇要保留哪一邊。</p>
      {confirming ? (
        <>
          <button class="danger" onClick={() => void resolveFirstSync(confirming)}>
            確定{label[confirming]}？另一邊的資料會消失
          </button>
          <button class="ghost" onClick={() => setConfirming(undefined)}>
            取消
          </button>
        </>
      ) : (
        <>
          <button class="ghost" onClick={() => setConfirming('cloud')}>
            {label.cloud}
          </button>
          <button class="ghost" onClick={() => setConfirming('device')}>
            {label.device}
          </button>
        </>
      )}
    </>
  );
}

const describe = (c: Conflict) => String(c.data.name ?? c.data.key ?? c.rowId);

function Conflicts() {
  const [rows, setRows] = useState<Conflict[]>([]);
  useEffect(() => {
    const sub = liveQuery(() => db.conflicts.orderBy('at').reverse().toArray()).subscribe(setRows);
    return () => sub.unsubscribe();
  }, []);
  if (!rows.length) return null;
  return (
    <details>
      <summary>被覆蓋的舊版本（{rows.length}）</summary>
      {rows.map((c) => (
        <div class="row" key={c.id}>
          <span class="info">
            <span class="name">{describe(c)}</span>
            <small>{new Date(c.at).toLocaleString('zh-TW')}</small>
          </span>
          <button class="small" onClick={() => restoreConflict(c.id).catch(() => showToast('還原失敗，請再試一次'))}>
            還原
          </button>
          <button class="ghost" onClick={() => void dropConflict(c.id)}>
            丟棄
          </button>
        </div>
      ))}
    </details>
  );
}

export function SyncPanel() {
  if (!syncAvailable) {
    return (
      <section class="card pad">
        <h2>雲端同步</h2>
        <p>這個版本尚未設定同步，資料只存在這台裝置。</p>
      </section>
    );
  }
  const status = syncStatus.value;
  return (
    <section class="card pad">
      <h2>雲端同步</h2>
      {status === 'signedOut' ? (
        <>
          <p>登入後，手機和電腦會自動同步。這裡不提供註冊。</p>
          <LoginForm />
        </>
      ) : (
        <>
          <p>帳號：{accountEmail.value}</p>
          <p>
            狀態：{STATUS_TEXT[status]}
            {pendingCount.value > 0 && `，待同步 ${pendingCount.value} 筆`}
          </p>
          {failedPhotos.value > 0 && <p class="error">有 {failedPhotos.value} 張照片無法上傳，其他資料已同步。</p>}
          {status === 'choose' && <FirstSyncChoice />}
          <Conflicts />
          {status !== 'choose' && (
            <button class="ghost" onClick={() => requestSync(0)}>
              立即同步
            </button>
          )}
          <button class="ghost" onClick={() => void signOut()}>
            登出（資料留在這台裝置）
          </button>
        </>
      )}
    </section>
  );
}

export const topBarText = () => {
  if (syncStatus.value === 'off') return '僅存本機';
  if (syncStatus.value === 'pending') return `待同步 ${pendingCount.value} 筆`;
  return { ...STATUS_TEXT, signedOut: '未登入', offline: '離線', error: '同步失敗', choose: '需要選擇' }[
    syncStatus.value
  ];
};
