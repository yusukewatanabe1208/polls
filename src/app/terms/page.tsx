import Link from "next/link";

export const metadata = {
  title: "利用規約 | 診療スタイル診断",
};

export default function TermsPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">利用規約</h1>
        <p className="mt-1 text-sm text-muted">
          本サービス（以下「本サービス」）をご利用いただく前に、必ずお読みください。
          本サービスを利用した時点で、本規約に同意したものとみなします。
        </p>
      </header>

      <section className="card border-amber-300 bg-amber-50 p-5">
        <h2 className="font-bold text-amber-900">最初にお読みください</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
          <li>本サービスの内容を、実際の診療の判断に直接用いないでください。</li>
          <li>患者を特定できる情報は、いかなる形でも投稿しないでください。</li>
          <li>運営者は本サービスの利用に関して一切の責任を負いません。</li>
          <li>本サービスは予告なく変更・停止・終了する場合があります。</li>
        </ul>
      </section>

      <section className="card space-y-4 p-5 text-sm leading-7">
        <div>
          <h2 className="font-bold">第1条（本サービスの目的）</h2>
          <p className="mt-1">
            本サービスは、医師が2択の質問に回答し、他の回答者との判断傾向の違いを
            「普通度」として可視化することを目的とした、比較・参考のためのサービスです。
            医学的な正解・不正解を判定するものではなく、多数派の回答が正しいことを
            意味するものでもありません。
          </p>
        </div>

        <div>
          <h2 className="font-bold">第2条（診療への利用の禁止）</h2>
          <p className="mt-1">
            本サービスに表示される回答分布、普通度、偏差値、ランク、コメント等の
            一切の情報は、<strong>実際の診療上の判断に直接用いてはなりません。</strong>
            診断・治療方針の決定は、利用者ご自身の専門的判断と責任において、
            最新のガイドラインおよび各医療機関の方針に基づいて行ってください。
            本サービスは医学的助言を提供するものではありません。
          </p>
        </div>

        <div>
          <h2 className="font-bold">第3条（個人情報・患者情報の禁止）</h2>
          <p className="mt-1">
            質問・コメント・画像を問わず、
            <strong>患者を特定できる情報を投稿してはなりません。</strong>
            氏名、生年月日、患者ID、電話番号、住所、顔写真、医療機関名との組み合わせで
            個人が特定できる情報、その他の個人識別情報が該当します。
            症例に基づく質問を投稿する場合は、個人が特定されないよう十分に加工してください。
          </p>
          <p className="mt-1">
            違反が確認された投稿は、予告なく非公開または削除する場合があります。
            悪質な場合はアカウントの利用を停止することがあります。
          </p>
        </div>

        <div>
          <h2 className="font-bold">第4条（利用資格）</h2>
          <p className="mt-1">
            本サービスは医師の利用を想定しています。登録時の医師である旨の確認、
            本名および医籍登録番号は自己申告であり、本サービスでは資格の照合を行いません。
            虚偽の申告があった場合、利用を停止することがあります。
          </p>
        </div>

        <div>
          <h2 className="font-bold">第5条（投稿と回答の取り扱い）</h2>
          <p className="mt-1">
            回答は1つの質問につき1回のみで、確定後の変更・取り消しはできません。
            投稿された質問は、回答の意味が変わることを避けるため、投稿後の編集ができません。
            投稿内容は、統計処理を行ったうえで他の利用者に表示されます。
            ユーザーネームと専門科は公開されます。本名・医籍登録番号・勤務都道府県は公開しません。
          </p>
        </div>

        <div>
          <h2 className="font-bold">第6条（免責）</h2>
          <p className="mt-1">
            <strong>
              運営者は、本サービスの利用または利用できなかったことに起因して生じた
              一切の損害について、責任を負いません。
            </strong>
            本サービスで提供される情報の正確性、完全性、有用性、最新性について、
            いかなる保証も行いません。表示される指標は他の利用者の回答状況によって
            変動し、統計的な参考値にすぎません。
          </p>
        </div>

        <div>
          <h2 className="font-bold">第7条（サービスの変更・終了）</h2>
          <p className="mt-1">
            <strong>
              運営者は、利用者への事前の通知なく、本サービスの内容の変更、提供の中断、
              または終了を行うことがあります。
            </strong>
            これにより投稿・回答等のデータが失われる場合がありますが、
            運営者はその責任を負いません。必要な情報は利用者ご自身で控えてください。
          </p>
        </div>

        <div>
          <h2 className="font-bold">第8条（禁止事項）</h2>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>患者情報その他の個人情報を投稿する行為</li>
            <li>誹謗中傷、差別的表現、医療と無関係な投稿</li>
            <li>虚偽の資格申告、他人へのなりすまし</li>
            <li>本サービスの運営を妨げる行為、不正アクセス、自動化された大量アクセス</li>
            <li>法令または公序良俗に反する行為</li>
          </ul>
        </div>

        <div>
          <h2 className="font-bold">第9条（規約の変更）</h2>
          <p className="mt-1">
            運営者は本規約を随時変更できるものとします。変更後に本サービスを利用した場合、
            変更後の規約に同意したものとみなします。
          </p>
        </div>
      </section>

      <section className="card p-5 text-sm">
        <h2 className="font-bold">プライバシーについて</h2>
        <p className="mt-1">
          本名・医籍登録番号・勤務都道府県・メールアドレスは他の利用者に公開しません。
          公開されるのはユーザーネーム、専門科、投稿した質問、コメント、
          および統計処理された回答傾向です。
        </p>
      </section>

      <p className="text-center text-xs text-muted">
        本サービスは開発中のため、仕様およびデータは予告なく変更される場合があります。
      </p>

      <Link href="/try" className="btn btn-ghost w-full">
        戻る
      </Link>
    </div>
  );
}
