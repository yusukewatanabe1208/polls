import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/OnboardingForm";
import { SetupNotice } from "@/components/SetupNotice";
import { repo } from "@/lib/repo";

export default async function OnboardingPage() {
  const session = await repo.getSession();
  if (!session) redirect("/login");
  if (session.profile) redirect("/play");

  const schema = await repo.checkSchemaReady();

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-xl font-bold">初回プロフィール登録</h1>
        <p className="mt-1 text-sm text-muted">
          登録は最初の1回だけです。次回以降は質問画面に直接移動します。
        </p>
      </div>

      {!schema.ready && <SetupNotice />}

      <OnboardingForm />
    </div>
  );
}
