/** ローカル開発用に投入したダミー質問であることを示すバッジ */
export function DemoBadge({ show }: { show: boolean | undefined }) {
  if (!show) return null;
  return (
    <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">
      デモ
    </span>
  );
}
