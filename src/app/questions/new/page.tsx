import { redirect } from "next/navigation";
import { NewQuestionForm } from "@/components/NewQuestionForm";
import { repo } from "@/lib/repo";

export default async function NewQuestionPage() {
  const session = await repo.getSession();
  if (!session) redirect("/login");
  if (!session.profile) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">質問を投稿</h1>
        <p className="mt-1 text-sm text-muted">
          すべての質問はA / Bの2択です。
        </p>
      </div>
      <NewQuestionForm />
    </div>
  );
}
