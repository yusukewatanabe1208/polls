-- =====================================================================
-- 選択肢を「はい／いいえ」に固定する
--   投稿者は質問文だけを考えればよくなる。
--   0001〜0003 のあとに実行してください。何度実行しても安全です。
-- =====================================================================

alter table public.questions
  alter column option_a set default 'はい',
  alter column option_b set default 'いいえ';

-- 既存の質問（デモを含む）も「はい／いいえ」に統一する
update public.questions
set option_a = 'はい',
    option_b = 'いいえ'
where option_a <> 'はい' or option_b <> 'いいえ';
