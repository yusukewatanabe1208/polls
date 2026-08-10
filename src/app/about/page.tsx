import Link from "next/link";
import { repo } from "@/lib/repo";

export default async function AboutPage() {
  const min = await repo.getMinOtherVotes();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">指標について</h1>

      <section className="card p-6">
        <h2 className="text-lg font-semibold">普通度とは？</h2>
        <p className="mt-2 text-sm">
          普通度は、あなたが選んだ回答を他の回答者の何％が選んでいたかの平均です。
          普通度が高いほど、他の回答者と同じ判断をする傾向があります。
        </p>
        <div className="mt-4 rounded-lg bg-brand-soft p-4 text-sm">
          <p className="font-semibold">計算例</p>
          <pre className="mt-2 whitespace-pre-wrap text-xs leading-6">{`Q1  自分と同じ回答 67%
Q2  自分と同じ回答 52%
Q3  自分と同じ回答 81%
Q4  自分と同じ回答 44%
Q5  自分と同じ回答 71%

普通度 = (67 + 52 + 81 + 44 + 71) / 5 = 63`}</pre>
        </div>
        <p className="mt-3 text-sm text-muted">
          割合の計算では、必ずあなた自身の回答を除外します。
        </p>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold">多数派一致率とは？</h2>
        <p className="mt-2 text-sm">
          あなたが回答した質問のうち、多数派と同じ選択をした割合です。
          普通度が「多数派の強さ」まで反映するのに対し、多数派一致率は多数派を選んだかどうかだけを見ます。
        </p>
        <p className="mt-3 text-sm text-muted">
          あなたを除いた回答がちょうど50:50の質問は多数派が存在しないため、多数派一致率の分子にも分母にも含めません（普通度には反映されます）。
        </p>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold">指標に反映される質問</h2>
        <p className="mt-2 text-sm">
          少人数では割合が不安定になるため、あなた以外の回答数が
          <strong className="mx-1">{min}以上</strong>
          の質問のみを普通度・多数派一致率の計算対象とします。
          未達の質問は「回答募集中」と表示され、{min}人に到達した時点で自動的に対象になります。
        </p>
        <p className="mt-3 text-sm text-muted">
          普通度は固定値ではありません。他のユーザーの回答が増えると分布が変わるため、日々わずかに変動します。
        </p>
      </section>

      <Link href="/feed" className="btn btn-ghost">
        フィードに戻る
      </Link>
    </div>
  );
}
