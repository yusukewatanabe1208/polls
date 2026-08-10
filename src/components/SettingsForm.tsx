"use client";

import { useActionState } from "react";
import { updateSettings, type FormState } from "@/app/actions";
import { ProfileFields } from "./ProfileFields";

const initial: FormState = {};

export function SettingsForm({
  username,
  realName,
  licenseNumber,
  occupation,
  specialtyId,
  prefecture,
}: {
  username: string;
  realName: string;
  licenseNumber: string;
  occupation: string;
  specialtyId: number;
  prefecture: string;
}) {
  const [state, formAction, pending] = useActionState(updateSettings, initial);

  return (
    <form action={formAction} className="card space-y-5 p-6">
      <ProfileFields
        defaultUsername={username}
        defaultRealName={realName}
        defaultLicenseNumber={licenseNumber}
        defaultOccupation={occupation}
        defaultSpecialtyId={specialtyId}
        defaultPrefecture={prefecture}
        lockIdentity
      />

      {state.error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-brand-soft p-3 text-sm text-brand">
          {state.success}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "保存中…" : "保存する"}
      </button>
    </form>
  );
}
