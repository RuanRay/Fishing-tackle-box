import { useEffect, useState } from 'preact/hooks';
import { clearAll, importData, setSetting } from '../../data/db';
import { today } from '../../domain/date';
import type { Parsed } from '../../data/excel';
import { summary } from '../../domain/stock';
import {
  applyTheme,
  config,
  gear,
  lastBackupAt,
  logs,
  orders,
  showToast,
  tab,
  templates,
  theme,
  trips,
} from '../../state';
import type { Theme } from '../../state';
import { RulesPanel, TemplatesPanel } from './SettingsRules';

const message = (e: unknown) => (e instanceof Error ? e.message : '操作失敗');
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function prepareFile() {
  const { buildWorkbook, workbookBytes } = await import('../../data/excel');
  const extras = {
    config: JSON.stringify(config.value),
    templates: JSON.stringify(templates.value),
    trips: trips.value,
  };
  const bytes = workbookBytes(buildWorkbook(gear.value, orders.value, logs.value, extras));
  return new File([bytes], `釣具盤點-${today()}.xlsx`, { type: XLSX_TYPE });
}

function download(file: File) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

const UNCONFIRMED = '分享失敗，已改用下載。請確認檔案有存下來，再重試一次分享';

/**
 * iOS standalone apps cannot use <a download>; the share sheet offers "Save to Files".
 * 'unconfirmed' means the file went out by a route we cannot verify.
 */
async function deliver(file: File): Promise<'sent' | 'unconfirmed' | 'cancelled'> {
  if (!navigator.canShare?.({ files: [file] })) {
    download(file);
    return 'sent';
  }
  try {
    await navigator.share({ files: [file] });
    return 'sent';
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'cancelled';
    download(file);
    return 'unconfirmed';
  }
}

// Built up front for the same reason as the backup file: share() needs the tap.
let sampleBuild: Promise<File> | undefined;
function buildSample() {
  sampleBuild ??= import('../../data/sample')
    .then(({ sampleFile }) => new File([sampleFile()], '釣具箱-範例.xlsx', { type: XLSX_TYPE }))
    .catch((e: unknown) => {
      sampleBuild = undefined;
      throw e;
    });
  return sampleBuild;
}

function ImportPanel() {
  const [parsed, setParsed] = useState<Parsed>();
  const [error, setError] = useState('');
  const hasData = gear.value.length + orders.value.length + trips.value.length > 0;
  const [sample, setSample] = useState<File>();

  useEffect(() => {
    buildSample().then(setSample, () => setError('範例檔準備失敗，請重新開啟 App'));
  }, []);

  const saveSample = async () => {
    if (!sample) return;
    setError('');
    const result = await deliver(sample);
    if (result === 'sent') showToast('已下載範例 Excel');
    if (result === 'unconfirmed') showToast(UNCONFIRMED);
  };

  const pick = async (file?: File) => {
    if (!file) return;
    setError('');
    setParsed(undefined);
    try {
      const { parseWorkbook } = await import('../../data/excel');
      setParsed(parseWorkbook(await file.arrayBuffer()));
    } catch (e) {
      setError(message(e));
    }
  };

  const commit = async () => {
    if (!parsed) return;
    try {
      await importData(parsed);
      await navigator.storage?.persist?.();
      setParsed(undefined);
      tab.value = '庫存';
      showToast('匯入完成');
    } catch (e) {
      setError(message(e));
    }
  };

  const preview = parsed && summary(parsed.gear, []);
  return (
    <section class="card pad">
      <h2>匯入 v2 Excel</h2>
      {hasData ? (
        <p>裝置上已有資料。匯入前要先清空，避免覆蓋現有紀錄。</p>
      ) : (
        <input
          type="file"
          aria-label="選擇 v2 Excel"
          accept=".xlsx"
          onChange={(e) => void pick(e.currentTarget.files?.[0])}
        />
      )}
      <button class="ghost" disabled={!sample} onClick={() => void saveSample()}>
        下載範例 Excel
      </button>
      {error && <p class="error">{error}</p>}
      {preview && parsed && (
        <>
          <table>
            <tbody>
              <tr>
                <th scope="row">器材</th>
                <td>{preview.rows} 筆</td>
              </tr>
              <tr>
                <th scope="row">不含已不在</th>
                <td>
                  {preview.items} 項、{preview.pieces} 件
                </td>
              </tr>
              <tr>
                <th scope="row">購入合計</th>
                <td>NT${preview.amount}</td>
              </tr>
              <tr>
                <th scope="row">訂單明細</th>
                <td>{parsed.orders.length} 行</td>
              </tr>
            </tbody>
          </table>
          <button class="primary" onClick={() => void commit()}>
            確認匯入
          </button>
        </>
      )}
    </section>
  );
}

function BackupPanel() {
  const [persisted, setPersisted] = useState<boolean>();
  useEffect(() => void navigator.storage?.persisted?.().then(setPersisted), []);
  const [file, setFile] = useState<File>();
  const [g, l, o, c, t, ts] = [gear.value, logs.value, orders.value, config.value, templates.value, trips.value];
  // share() must run straight from the tap on iOS, so the file is built ahead of time.
  useEffect(() => {
    setFile(undefined);
    if (!g.length) return;
    let stale = false;
    const timer = setTimeout(() => {
      void prepareFile().then((built) => {
        if (!stale) setFile(built);
      });
    }, 500);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [g, l, o, c, t, ts]);
  const run = async () => {
    if (!file) return;
    const result = await deliver(file);
    if (result === 'unconfirmed') showToast(UNCONFIRMED);
    if (result !== 'sent') return;
    await setSetting('lastBackupAt', Date.now());
    showToast('已匯出備份');
  };
  const last = lastBackupAt.value;
  return (
    <section class="card pad">
      <h2>備份</h2>
      <p>資料只存在這台裝置。上次備份：{last ? new Date(last).toLocaleDateString('zh-TW') : '尚未備份'}</p>
      <p>持續性儲存：{persisted === undefined ? '不支援' : persisted ? '已啟用' : '未啟用'}。Excel 備份不含照片。</p>
      <button class="primary" disabled={!file} onClick={() => void run()}>
        {file || !gear.value.length ? '匯出 Excel' : '準備備份檔…'}
      </button>
    </section>
  );
}

function DangerPanel() {
  const [confirming, setConfirming] = useState(false);
  if (!gear.value.length && !orders.value.length && !trips.value.length) return null;
  const clear = async () => {
    await clearAll();
    setConfirming(false);
    showToast('已清空');
  };
  return (
    <section class="card pad">
      <h2>清空資料</h2>
      {confirming ? (
        <button class="danger" onClick={() => void clear()}>
          確定清空？器材、紀錄、照片都無法復原
        </button>
      ) : (
        <button class="ghost" onClick={() => setConfirming(true)}>
          清空這台裝置的資料
        </button>
      )}
    </section>
  );
}

export function Settings() {
  return (
    <>
      <section class="card pad">
        <h2>外觀</h2>
        <label class="field">
          深淺色
          <select value={theme.value} onChange={(e) => applyTheme(e.currentTarget.value as Theme)}>
            <option value="auto">跟隨系統</option>
            <option value="light">淺色</option>
            <option value="dark">深色</option>
          </select>
        </label>
      </section>
      <BackupPanel />
      <ImportPanel />
      <RulesPanel />
      <TemplatesPanel />
      <DangerPanel />
      <p class="empty">版本 {__BUILD__} UTC</p>
    </>
  );
}
