import { useState } from 'preact/hooks';
import { saveConfig, saveTemplates } from '../../data/db';
import type { RuleConfig } from '../../domain/rules/common';
import { DEFAULT_TEMPLATES } from '../../domain/trip';
import type { Requirement, Template } from '../../domain/trip';
import { config, templates } from '../../state';
import { NumberInput } from '../components/NumberInput';

const FIELDS: { key: keyof RuleConfig; label: string; scale?: number }[] = [
  { key: 'tolerance', label: '餌重寬容 %', scale: 100 },
  { key: 'hookDiff', label: '鉤號差距' },
  { key: 'rate', label: '匯率 NT$/CN¥' },
  { key: 'fee', label: '每筆手續費 NT$' },
];

export function RulesPanel() {
  const change = (key: keyof RuleConfig, value: number | undefined, scale = 1) => {
    if (value !== undefined && value >= 0) void saveConfig({ ...config.value, [key]: value / scale });
  };
  return (
    <section class="card pad">
      <h2>判斷門檻與匯率</h2>
      <div class="grid2">
        {FIELDS.map(({ key, label, scale = 1 }) => (
          <label class="field" key={key}>
            {label}
            <NumberInput
              min="0"
              value={Math.round(config.value[key] * scale * 1000) / 1000}
              onValue={(value) => change(key, value, scale)}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function parseRequired(text: string, before: Requirement[]) {
  return text
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => before.find((r) => r.label === label) ?? { label, keyword: label });
}

function TemplateForm({ template, index }: { template: Template; index: number }) {
  const [required, setRequired] = useState(template.required.map((r) => r.label).join('、'));
  const update = (next: Template) => {
    const list = [...templates.value];
    list[index] = next;
    void saveTemplates(list);
  };
  const remove = () => void saveTemplates(templates.value.filter((_, i) => i !== index));
  return (
    <details class="template">
      <summary>{template.name}</summary>
      <div class="form">
        <label class="field">
          名稱
          <input
            value={template.name}
            onChange={(e) => update({ ...template, name: e.currentTarget.value.trim() || template.name })}
          />
        </label>
        <label class="field">
          帶哪支竿
          <select
            value={template.rod}
            onChange={(e) => update({ ...template, rod: e.currentTarget.value as Template['rod'] })}
          >
            <option value="light">餌重上限最低的套組</option>
            <option value="heavy">餌重上限最高的套組</option>
          </select>
        </label>
        <label class="check">
          <input
            type="checkbox"
            checked={template.lures}
            onChange={(e) => update({ ...template, lures: e.currentTarget.checked })}
          />
          帶入適合的假餌
        </label>
        <label class="field">
          必備品（用頓號分隔，依品名關鍵字比對）
          <input
            value={required}
            onInput={(e) => setRequired(e.currentTarget.value)}
            onChange={(e) => update({ ...template, required: parseRequired(e.currentTarget.value, template.required) })}
          />
        </label>
        <button class="ghost" onClick={remove}>
          刪除這個模板
        </button>
      </div>
    </details>
  );
}

export function TemplatesPanel() {
  const add = () => {
    const name = `自訂釣法 ${templates.value.length + 1}`;
    void saveTemplates([...templates.value, { name, rod: 'heavy', lures: true, required: [] }]);
  };
  return (
    <section class="card pad">
      <h2>釣法模板</h2>
      {templates.value.map((t, i) => (
        <TemplateForm key={`${i}:${t.name}:${t.required.map((r) => r.label).join()}`} template={t} index={i} />
      ))}
      <button class="ghost" onClick={add}>
        新增模板
      </button>
      <button class="ghost" onClick={() => void saveTemplates(DEFAULT_TEMPLATES)}>
        還原預設模板
      </button>
    </section>
  );
}
