import { redirect } from "next/navigation";

/**
 * 質問の詳細は1問ずつ回答する /play/[id] に統合した。
 * 既存のURL（要件定義 §50 の /questions/[id]）はそのまま使えるようリダイレクトする。
 */
export default async function QuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/play/${id}`);
}
