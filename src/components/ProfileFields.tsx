"use client";

import { LICENSE_NUMBER_MAX, REAL_NAME_MAX } from "@/lib/limits";

import { useState } from "react";
import { OCCUPATIONS, PREFECTURES, SPECIALTIES } from "@/lib/master";
import { PillSelect } from "./PillSelect";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function ProfileFields({
  defaultUsername = "",
  defaultRealName = "",
  defaultLicenseNumber = "",
  defaultOccupation = "医師",
  defaultSpecialtyId,
  defaultPrefecture,
  /** 登録済みの本人情報（ユーザーネーム・本名・職業）は変更できない */
  lockIdentity = false,
}: {
  defaultUsername?: string;
  defaultRealName?: string;
  defaultLicenseNumber?: string;
  defaultOccupation?: string;
  defaultSpecialtyId?: number;
  defaultPrefecture?: string;
  lockIdentity?: boolean;
}) {
  const [username, setUsername] = useState(defaultUsername);
  const valid = USERNAME_RE.test(username);
  const touched = username.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="username">
          ユーザーネーム（公開・一意）
        </label>

        {lockIdentity ? (
          <>
            <p className="field flex items-center bg-slate-50 font-semibold text-muted">
              @{defaultUsername}
            </p>
            <p className="mt-1 text-xs text-muted">
              ユーザーネームは登録後に変更できません。
            </p>
          </>
        ) : (
          <>
            <input
              id="username"
              name="username"
              className="field"
              value={username}
              // 大文字や全角を入れても弾かれないように整形する
              onChange={(e) =>
                setUsername(
                  e.target.value
                    .normalize("NFKC")
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, ""),
                )
              }
              placeholder="cardio_taro"
              autoComplete="off"
              autoCapitalize="none"
              inputMode="text"
              maxLength={20}
              required
            />
            <p
              className={`mt-1 text-xs ${
                touched && !valid ? "font-semibold text-red-600" : "text-muted"
              }`}
            >
              {touched && !valid
                ? `半角英小文字・数字・アンダースコアで3〜20文字にしてください（現在${username.length}文字）`
                : "半角英小文字・数字・アンダースコアの3〜20文字。日本語・大文字・記号は自動で取り除かれます。"}
            </p>
            <p className="mt-1 text-xs font-semibold text-amber-700">
              ※ 一度登録すると変更できません。慎重に選んでください。
            </p>
          </>
        )}
      </div>

      <div>
        {lockIdentity ? (
          <>
            <p className="label">職業（公開）</p>
            <p className="field flex items-center bg-slate-50 font-semibold text-muted">
              {defaultOccupation}
            </p>
            <input type="hidden" name="occupation" value={defaultOccupation} />
            <p className="mt-1 text-xs text-muted">
              職業は登録後に変更できません。
            </p>
          </>
        ) : (
          <PillSelect
            name="occupation"
            label="職業（公開）"
            hint="普通度・偏差値の集計対象は医師の回答のみです。他の職種でも回答・コメントはできます。"
            defaultValue={defaultOccupation}
            options={OCCUPATIONS.map((o) => ({ value: o, label: o }))}
          />
        )}
      </div>

      <div>
        <label className="label" htmlFor="real_name">
          本名（非公開・必須）
        </label>
        {lockIdentity && defaultRealName ? (
          <>
            <p className="field flex items-center bg-slate-50 font-semibold text-muted">
              {defaultRealName}
            </p>
            <input type="hidden" name="real_name" value={defaultRealName} />
            <p className="mt-1 text-xs text-muted">
              本名は登録後に変更できません。他のユーザーには表示されません。
            </p>
          </>
        ) : (
          <>
            <input
              id="real_name"
              name="real_name"
              className="field"
              defaultValue={defaultRealName}
              placeholder="山田 太郎"
              autoComplete="name"
              maxLength={REAL_NAME_MAX}
              required
            />
            <p className="mt-1 text-xs text-muted">
              他のユーザーには表示されません。公開されるのはユーザーネームのみです。
              一度登録すると変更できません。
            </p>
          </>
        )}
      </div>

      <div>
        <label className="label" htmlFor="license_number">
          医籍登録番号・免許番号（非公開・任意）
        </label>
        <input
          id="license_number"
          name="license_number"
          className="field"
          defaultValue={defaultLicenseNumber}
          placeholder="123456"
          inputMode="numeric"
          maxLength={LICENSE_NUMBER_MAX}
        />
        <p className="mt-1 text-xs text-muted">
          任意です。入力する場合は半角数字で。非公開で、
          現時点では自己申告であり本サービスでの照合は行いません。
        </p>
      </div>

      <div>
        <label className="label" htmlFor="specialty_id">
          専門科（主たる1つ・公開）
        </label>
        <select
          id="specialty_id"
          name="specialty_id"
          className="field"
          defaultValue={defaultSpecialtyId ?? ""}
          required
        >
          <option value="" disabled>
            選択してください
          </option>
          {SPECIALTIES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="work_prefecture">
          勤務都道府県（非公開）
        </label>
        <select
          id="work_prefecture"
          name="work_prefecture"
          className="field"
          defaultValue={defaultPrefecture ?? ""}
          required
        >
          <option value="" disabled>
            選択してください
          </option>
          {PREFECTURES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">
          他のユーザーのプロフィールには表示されません。将来的な地域別集計にのみ利用します。
        </p>
      </div>
    </div>
  );
}
