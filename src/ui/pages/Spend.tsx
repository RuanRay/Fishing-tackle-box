import { useEffect, useRef } from 'preact/hooks';
import { byCategory, byMonth, byShop } from '../../domain/spend';
import type { Bucket } from '../../domain/spend';
import { summary } from '../../domain/stock';
import { gear, logs, theme } from '../../state';

const money = (n: number) => `NT$${n.toLocaleString('zh-TW', { maximumFractionDigits: 1 })}`;

function BarChart({ title, data, horizontal }: { title: string; data: Bucket[]; horizontal?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const currentTheme = theme.value;

  useEffect(() => {
    let cancelled = false;
    let destroy = () => {};
    void import('chart.js').then(({ BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip }) => {
      if (cancelled || !canvas.current) return;
      Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);
      const css = getComputedStyle(canvas.current);
      const ink = css.getPropertyValue('--text-muted').trim();
      const grid = css.getPropertyValue('--grid').trim();
      const chart = new Chart(canvas.current, {
        type: 'bar',
        data: {
          labels: data.map((b) => b.label),
          datasets: [
            {
              data: data.map((b) => b.amount),
              backgroundColor: css.getPropertyValue('--primary').trim(),
              borderRadius: 4,
              maxBarThickness: 24,
            },
          ],
        },
        options: {
          indexAxis: horizontal ? 'y' : 'x',
          maintainAspectRatio: false,
          animation: false,
          plugins: { tooltip: { callbacks: { label: (c) => money(c.parsed[horizontal ? 'x' : 'y'] ?? 0) } } },
          scales: {
            x: { ticks: { color: ink }, grid: { color: horizontal ? grid : 'transparent' } },
            y: { ticks: { color: ink, autoSkip: !horizontal }, grid: { color: horizontal ? 'transparent' : grid } },
          },
        },
      });
      destroy = () => chart.destroy();
    });
    return () => {
      cancelled = true;
      destroy();
    };
  }, [data, horizontal, currentTheme]);

  const height = horizontal ? Math.max(160, data.length * 36 + 40) : 220;
  return (
    <section class="card chart">
      <h2>{title}</h2>
      <div style={{ height: `${height}px`, position: 'relative' }}>
        <canvas ref={canvas} role="img" aria-label={`${title}長條圖，數值見下方表格`} />
      </div>
      <details>
        <summary>查看數字</summary>
        <table>
          <tbody>
            {data.map((b) => (
              <tr key={b.label}>
                <th scope="row">{b.label}</th>
                <td>{money(b.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

export function Spend() {
  const s = summary(gear.value, logs.value);
  return (
    <>
      <div class="stats">
        <div class="stat wide">
          <small>購入合計</small>
          <b>{money(s.amount)}</b>
        </div>
        <div class="stat">
          <small>品項</small>
          <b>{s.items}</b>
        </div>
        <div class="stat">
          <small>件數</small>
          <b>{s.pieces}</b>
        </div>
      </div>
      <BarChart title="按月份" data={byMonth(gear.value)} />
      <BarChart title="按分類" data={byCategory(gear.value)} horizontal />
      <BarChart title="按賣場" data={byShop(gear.value)} horizontal />
    </>
  );
}
