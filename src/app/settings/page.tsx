import { redirect } from "next/navigation";
import { QuizFilterForm } from "@/components/QuizFilterForm";
import { SettingsForm } from "@/components/SettingsForm";
import { repo } from "@/lib/repo";
import { logout } from "../actions";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; shuffled?: string }>;
}) {
  const { saved, shuffled } = await searchParams;
  const session = await repo.getSession();
  if (!session) redirect("/login");
  if (!session.profile) redirect("/onboarding");

  const p = session.profile;

  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-xl font-bold">設定</h1>

      <QuizFilterForm
        categoryIds={p.filter_category_ids ?? []}
        levels={p.filter_levels ?? []}
        shuffle={p.shuffle_questions ?? true}
        saved={!!saved}
        shuffled={!!shuffled}
      />

      <SettingsForm
        username={p.username}
        realName={p.real_name ?? ""}
        licenseNumber={p.license_number ?? ""}
        occupation={p.occupation ?? "医師"}
        specialtyId={p.specialty_id}
        prefecture={p.work_prefecture}
      />

      <div className="card space-y-3 p-6">
        <h2 className="text-sm font-semibold">アカウント</h2>
        <form action={logout}>
          <button type="submit" className="btn btn-ghost w-full">
            ログアウト
          </button>
        </form>
      </div>
    </div>
  );
}
