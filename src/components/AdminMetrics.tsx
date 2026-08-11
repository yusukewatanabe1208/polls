import Link from "next/link";
import type { AdminDaily, AdminTotals } from "@/lib/repo";

/**
 * 管理画面の基本指標。
 *
 * 指標ごとに桁が違う（登録は1日数人、回答は1日数百件）ため、
 * ひとつのグラフに重ねず、指標ごとに独立した図に分ける。
 * 二軸のグラフは目盛りの取り方しだいでどうとでも見えてしまうので使わない。
 *
 * 図は1系列ずつなので凡例は置かず、見出しが系列名を兼ねる。
 * 色はブランド色1色（背景とのコントラスト3:1以上）。
 * 数値そのものは「数値で見る」の表で確認できるようにしてある。
 */

const RANGES = [7, 30, 90] as const;

export function AdminMetrics({
  totals,
  daily,
  days,
}: {
  totals: AdminTotals;
  daily: AdminDaily[];
  days: number;
}) {
  return (
    <section className="card space-y-5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-semibold">基本指標</h2>
          <p className="text-[0.7rem] text-muted">
            デモデータは含めていません（デモ：登録
            {totals.demoUsers.toLocaleString("ja-JP")}人・回答
            {totals.demoVotes.toLocaleString("ja-JP")}件）
          </p>
        </div>
        {/* 期間の切り替え。リンクなのでJavaScriptが無くても動く */}
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/admin?days=${r}`}
              className={`rounded-full px-3 py-1 text-xs ${
                r === days
                  ? "bg-brand font-semibold text-white"
                  : "border border-line text-muted"
              }`}
            >
              {r}日
            </Link>
          ))}
        </div>
      </div>

      {/* 現在の値。推移ではなく「いまどうか」を一目で */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="登録者数" value={totals.totalUsers} sub={`+${totals.newUsers7d} / 7日`} />
        <Stat label="アクティブ（7日）" value={totals.active7d} sub={`30日 ${totals.active30d}人`} />
        <Stat label="一人当たり回答数" value={totals.votesPerUser} sub={`総回答 ${totals.totalVotes.toLocaleString("ja-JP")}件`} />
        <Stat label="質問数" value={totals.totalQuestions} sub={`+${totals.newQuestions7d} / 7日`} />
        <Stat label="コメント数" value={totals.totalComments} />
        <Stat
          label="アクティブ率（7日）"
          value={
            totals.totalUsers === 0
              ? 0
              : Math.round((totals.active7d / totals.totalUsers) * 100)
          }
          unit="%"
        />
      </div>

      {daily.length === 0 ? (
        <p className="text-sm text-muted">推移を取得できませんでした。</p>
      ) : (
        <>
          <div className="space-y-5">
            <BarSeries
              title="新規登録"
              unit="人"
              data={daily.map((d) => ({ day: d.day, value: d.newUsers }))}
            />
            <BarSeries
              title="アクティブユーザー"
              unit="人"
              hint="その日に回答・コメント・質問投稿のいずれかをした人"
              data={daily.map((d) => ({ day: d.day, value: d.activeUsers }))}
            />
            <BarSeries
              title="回答数"
              unit="件"
              data={daily.map((d) => ({ day: d.day, value: d.votes }))}
            />
            <BarSeries
              title="質問の投稿数"
              unit="件"
              data={daily.map((d) => ({ day: d.day, value: d.newQuestions }))}
            />
            <LineSeries
              title="登録者数の累計"
              unit="人"
              data={daily.map((d) => ({ day: d.day, value: d.totalUsers }))}
            />
          </div>

          <DataTable daily={daily} />
        </>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: number;
  unit?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-bold leading-none tabular-nums">
        {value.toLocaleString("ja-JP")}
        {unit && <span className="ml-0.5 text-sm font-semibold">{unit}</span>}
      </p>
      {sub && <p className="mt-1 text-[0.7rem] text-muted">{sub}</p>}
    </div>
  );
}

type Point = { day: string; value: number };

/** 日付を M/D にする（軸のラベル用） */
function shortDay(day: string) {
  const [, m, d] = day.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** 日ごとの件数。棒で出す */
function BarSeries({
  title,
  unit,
  hint,
  data,
}: {
  title: string;
  unit: string;
  hint?: string;
  data: Point[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0);
  const latest = data[data.length - 1];

  return (
    <figure>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted tabular-nums">
          期間合計 {total.toLocaleString("ja-JP")}
          {unit} / 最大 {max.toLocaleString("ja-JP")}
          {unit}
        </span>
      </figcaption>
      {hint && <p className="text-[0.7rem] text-muted">{hint}</p>}

      <div className="mt-2 flex h-20 gap-[1px]">
        {data.map((d) => (
          <div
            key={d.day}
            className="flex h-full flex-1 items-end"
            title={`${shortDay(d.day)}：${d.value}${unit}`}
          >
            <div
              className="w-full rounded-t-[2px] bg-brand"
              style={{
                height: d.value === 0 ? 0 : `${(d.value / max) * 100}%`,
                minHeight: "1px",
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-1 flex justify-between text-[0.7rem] text-muted tabular-nums">
        <span>{shortDay(data[0].day)}</span>
        <span>
          最新 {shortDay(latest.day)}：{latest.value}
          {unit}
        </span>
      </div>
    </figure>
  );
}

/** 累計のように積み上がる値。折れ線で出す */
function LineSeries({
  title,
  unit,
  data,
}: {
  title: string;
  unit: string;
  data: Point[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value));
  const span = Math.max(max - min, 1);
  const W = 100;
  const H = 32;

  const points = data
    .map((d, i) => {
      const x = data.length === 1 ? 0 : (i / (data.length - 1)) * W;
      const y = H - ((d.value - min) / span) * H;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const latest = data[data.length - 1];
  const grew = latest.value - data[0].value;

  return (
    <figure>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted tabular-nums">
          期間で +{grew.toLocaleString("ja-JP")}
          {unit}
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-2 h-20 w-full"
        role="img"
        aria-label={`${title}の推移。${shortDay(data[0].day)}に${data[0].value}${unit}、${shortDay(latest.day)}に${latest.value}${unit}。`}
      >
        <polyline
          points={points}
          fill="none"
          stroke="#0e7490"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      <div className="mt-1 flex justify-between text-[0.7rem] text-muted tabular-nums">
        <span>
          {shortDay(data[0].day)}：{data[0].value}
          {unit}
        </span>
        <span>
          {shortDay(latest.day)}：{latest.value}
          {unit}
        </span>
      </div>
    </figure>
  );
}

/** 色や図に頼らずに数値を確かめられるようにしておく */
function DataTable({ daily }: { daily: AdminDaily[] }) {
  return (
    <details>
      <summary className="cursor-pointer text-xs text-brand">数値で見る</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted">
              <th className="py-1 pr-2 text-left font-normal">日付</th>
              <th className="py-1 px-2 text-right font-normal">新規</th>
              <th className="py-1 px-2 text-right font-normal">アクティブ</th>
              <th className="py-1 px-2 text-right font-normal">回答</th>
              <th className="py-1 px-2 text-right font-normal">質問</th>
              <th className="py-1 pl-2 text-right font-normal">累計登録</th>
            </tr>
          </thead>
          <tbody>
            {[...daily].reverse().map((d) => (
              <tr key={d.day} className="border-t border-line">
                <td className="py-1 pr-2 whitespace-nowrap">{shortDay(d.day)}</td>
                <td className="py-1 px-2 text-right tabular-nums">{d.newUsers}</td>
                <td className="py-1 px-2 text-right tabular-nums">{d.activeUsers}</td>
                <td className="py-1 px-2 text-right tabular-nums">{d.votes}</td>
                <td className="py-1 px-2 text-right tabular-nums">{d.newQuestions}</td>
                <td className="py-1 pl-2 text-right tabular-nums">{d.totalUsers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
