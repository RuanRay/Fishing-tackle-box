import { useEffect, useState } from 'preact/hooks';

const parse = (text: string) => (text === '' || !Number.isFinite(Number(text)) ? undefined : Number(text));

interface Props {
  value: number | undefined;
  onValue: (value: number | undefined) => void;
  min?: string;
  placeholder?: string;
  required?: boolean;
}

/** Keeps the typed text: a controlled numeric value would rewrite "3." and scramble the caret. */
export function NumberInput({ value, onValue, ...rest }: Props) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    if (parse(text) !== value) setText(value === undefined ? '' : String(value));
  }, [value]);
  return (
    <input
      {...rest}
      type="number"
      step="any"
      inputMode="decimal"
      value={text}
      onInput={(e) => {
        const next = e.currentTarget.value;
        setText(next);
        onValue(parse(next));
      }}
    />
  );
}
