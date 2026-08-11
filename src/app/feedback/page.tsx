import { redirect } from "next/navigation";
import { FeedbackForm } from "@/components/FeedbackForm";
import { repo } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * 運営への要望。
 * 使っていて困ったこと・ほしい機能を、そのまま運営に送れる場所。
 * 読めるのは管理者と本人だけ（RLSで担保、0029）。
 */
export default async function FeedbackPage() {
  const session = await repo.getSession();
  if (!session) redirect("/login");
  if (!session.profile) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-md space-y-4">
      <header>
        <h1 className="text-xl font-bold">運営への要望</h1>
        <p className="mt-1 text-sm text-muted">
          使いにくいところ、ほしい機能、質問の内容についてなど、
          お気づきのことをお寄せください。
        </p>
      </header>

      <FeedbackForm />

      <p className="text-xs text-muted">
        送信した内容は運営（管理者）だけが読みます。他の利用者には表示されません。
        個別の返信はお約束できませんが、すべて目を通します。
        患者を特定できる情報は書かないでください。
      </p>
    </div>
  );
}
