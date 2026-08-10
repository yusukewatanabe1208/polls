/**
 * ラジオボタンをボタン風に並べる選択UI。
 * ネイティブのradioなので、JavaScriptが無くても選択・送信できる。
 */
export function PillSelect({
  name,
  label,
  hint,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  hint?: string;
  options: { value: string; label: string; description?: string }[];
  defaultValue?: string;
}) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="pill-group">
        {options.map((o) => (
          <label key={o.value} className="pill">
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={defaultValue === o.value}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </fieldset>
  );
}
