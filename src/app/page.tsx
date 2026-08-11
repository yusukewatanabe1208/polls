import { redirect } from "next/navigation";
import { repo } from "@/lib/repo";

/**
 * 入口。案内用のトップ画面は置かず、いきなり出題から始める。
 *
 * サインイン済みならそれぞれの続きへ、未サインインならお試し（5問）へ。
 * サインインの導線は、ヘッダーのリンクとお試しの成績画面にある。
 */
export default async function RootPage() {
  const session = await repo.getSession();
  if (session?.profile) redirect("/play");
  if (session) redirect("/onboarding");
  redirect("/try");
}
