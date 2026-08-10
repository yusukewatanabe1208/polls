import "server-only";
import { cache } from "react";
import { getBackend } from "../config";
import * as local from "./local";
import * as supa from "./supabase";

/**
 * データアクセスの入口。環境に応じて Supabase / ローカルJSON を切り替える。
 * 画面・サーバーアクションはこのモジュールだけを参照する。
 */

type Repo = typeof local;

/** local と supabase で同じ関数を持つことを型で保証する */
const _typecheck: Repo = supa;
void _typecheck;

// バックエンドは実行中に変わらないので、モジュール読み込み時に1回だけ決める
const impl: Repo = getBackend() === "supabase" ? supa : local;

/**
 * 読み取りは React の cache() でリクエスト単位にメモ化する。
 * レイアウトとページの両方で getSession() を呼んでも実際の問い合わせは1回になり、
 * 1問ずつ回答する画面（セッション・質問・結果・指標を同時に使う）が速くなる。
 */
export const repo: Repo = {
  ...impl,
  getSession: cache(impl.getSession),
  getMinOtherVotes: cache(impl.getMinOtherVotes),
  getProfileByUsername: cache(impl.getProfileByUsername),
  getFeed: cache(impl.getFeed),
  getNextUnansweredQuestionId: cache(impl.getNextUnansweredQuestionId),
  getQuestion: cache(impl.getQuestion),
  getTrialQuestions: cache(impl.getTrialQuestions),
  getTrialResult: cache(impl.getTrialResult),
  getQuestionResult: cache(impl.getQuestionResult),
  getComments: cache(impl.getComments),
  getUserMetrics: cache(impl.getUserMetrics),
  getAnsweredCount: cache(impl.getAnsweredCount),
  getRecentAnswers: cache(impl.getRecentAnswers),
  getRanking: cache(impl.getRanking),
  isFavorited: cache(impl.isFavorited),
  getFavorites: cache(impl.getFavorites),
  getLikedComments: cache(impl.getLikedComments),
  getQuestionsByAuthor: cache(impl.getQuestionsByAuthor),
  hasVoted: cache(impl.hasVoted),
  hasRequestedRemoval: cache(impl.hasRequestedRemoval),
  getMyComments: cache(impl.getMyComments),
  getReceivedLikeCount: cache(impl.getReceivedLikeCount),
};

export * from "./shapes";
