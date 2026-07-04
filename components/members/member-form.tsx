"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Loader2, Save } from "lucide-react";

import type { MemberFormState } from "@/app/(app)/members/actions";
import { Field } from "@/components/form/field";
import { FormSelect } from "@/components/form/form-select";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  GENDERS,
  GENDER_LABELS,
  MARITAL_STATUSES,
  MARITAL_STATUS_LABELS,
  SPOUSE_RELEVANT_STATUSES,
  type MaritalStatus,
} from "@/lib/constants";
import type { Member } from "@/db/schema";

const GENDER_OPTIONS = GENDERS.map((v) => ({ value: v, label: GENDER_LABELS[v] }));
const MARITAL_OPTIONS = MARITAL_STATUSES.map((v) => ({
  value: v,
  label: MARITAL_STATUS_LABELS[v],
}));

type MemberAction = (
  state: MemberFormState,
  formData: FormData,
) => Promise<MemberFormState>;

export function MemberForm({
  action,
  member,
  submitLabel = "Save member",
}: {
  action: MemberAction;
  member?: Member;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<
    MemberFormState,
    FormData
  >(action, undefined);
  const errors = state?.errors ?? {};

  const [maritalStatus, setMaritalStatus] = useState<MaritalStatus | "">(
    (member?.maritalStatus as MaritalStatus | undefined) ?? "",
  );
  const showSpouse = SPOUSE_RELEVANT_STATUSES.includes(
    maritalStatus as MaritalStatus,
  );

  return (
    <form action={formAction} className="space-y-6">
      {state?.message ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </div>
      ) : null}

      {/* Personal --------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Full Name"
            htmlFor="fullName"
            required
            error={errors.fullName}
            className="sm:col-span-2"
          >
            <Input
              id="fullName"
              name="fullName"
              defaultValue={member?.fullName ?? ""}
              placeholder="Juan Dela Cruz"
              required
            />
          </Field>

          <Field label="Gender" htmlFor="gender" error={errors.gender}>
            <FormSelect
              id="gender"
              name="gender"
              placeholder="Select gender"
              options={GENDER_OPTIONS}
              defaultValue={member?.gender}
            />
          </Field>

          <Field
            label="Marital Status"
            htmlFor="maritalStatus"
            error={errors.maritalStatus}
          >
            <FormSelect
              id="maritalStatus"
              name="maritalStatus"
              placeholder="Select status"
              options={MARITAL_OPTIONS}
              defaultValue={member?.maritalStatus}
              onValueChange={(v) => setMaritalStatus(v as MaritalStatus)}
            />
          </Field>

          <Field label="Birthdate" htmlFor="birthdate" error={errors.birthdate}>
            <Input
              id="birthdate"
              name="birthdate"
              type="date"
              defaultValue={member?.birthdate ?? ""}
            />
          </Field>

          <Field
            label="Spiritual Birthday"
            htmlFor="spiritualBirthday"
            hint="Date of water baptism / rebirth"
            error={errors.spiritualBirthday}
          >
            <Input
              id="spiritualBirthday"
              name="spiritualBirthday"
              type="date"
              defaultValue={member?.spiritualBirthday ?? ""}
            />
          </Field>

          <Field
            label="Taon na naging Kaanib ng IRM"
            htmlFor="memberSinceYear"
            hint="Year the member joined IRM"
            error={errors.memberSinceYear}
          >
            <Input
              id="memberSinceYear"
              name="memberSinceYear"
              type="number"
              inputMode="numeric"
              min={1900}
              max={new Date().getFullYear() + 1}
              placeholder="e.g. 2015"
              defaultValue={member?.memberSinceYear ?? ""}
            />
          </Field>

          <Field
            label="Occupation"
            htmlFor="occupation"
            error={errors.occupation}
          >
            <Input
              id="occupation"
              name="occupation"
              defaultValue={member?.occupation ?? ""}
              placeholder="e.g. Teacher"
            />
          </Field>
        </CardContent>
      </Card>

      {/* Family ----------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Family</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {showSpouse ? (
            <>
              <Field
                label="Name of Spouse"
                htmlFor="spouseName"
                error={errors.spouseName}
              >
                <Input
                  id="spouseName"
                  name="spouseName"
                  defaultValue={member?.spouseName ?? ""}
                  placeholder="Full name"
                />
              </Field>

              <Field
                label="Wedding Anniversary"
                htmlFor="weddingAnniversary"
                error={errors.weddingAnniversary}
              >
                <Input
                  id="weddingAnniversary"
                  name="weddingAnniversary"
                  type="date"
                  defaultValue={member?.weddingAnniversary ?? ""}
                />
              </Field>
            </>
          ) : (
            // Keep values submittable but hidden when not applicable.
            <>
              <input
                type="hidden"
                name="spouseName"
                value={member?.spouseName ?? ""}
              />
              <input
                type="hidden"
                name="weddingAnniversary"
                value={member?.weddingAnniversary ?? ""}
              />
            </>
          )}

          <Field
            label="Father's Name"
            htmlFor="fatherName"
            error={errors.fatherName}
          >
            <Input
              id="fatherName"
              name="fatherName"
              defaultValue={member?.fatherName ?? ""}
            />
          </Field>

          <Field
            label="Mother's Name"
            htmlFor="motherName"
            error={errors.motherName}
          >
            <Input
              id="motherName"
              name="motherName"
              defaultValue={member?.motherName ?? ""}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Contact & Background -------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact & Background</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Contact Number"
            htmlFor="contactNumber"
            error={errors.contactNumber}
          >
            <Input
              id="contactNumber"
              name="contactNumber"
              type="tel"
              defaultValue={member?.contactNumber ?? ""}
              placeholder="0917-123-4567"
            />
          </Field>

          <Field
            label="Educational Level"
            htmlFor="educationalLevel"
            error={errors.educationalLevel}
          >
            <Input
              id="educationalLevel"
              name="educationalLevel"
              defaultValue={member?.educationalLevel ?? ""}
              placeholder="e.g. College Graduate"
            />
          </Field>

          <Field
            label="Home Address"
            htmlFor="homeAddress"
            error={errors.homeAddress}
            className="sm:col-span-2"
          >
            <Textarea
              id="homeAddress"
              name="homeAddress"
              rows={2}
              defaultValue={member?.homeAddress ?? ""}
              placeholder="Street, Barangay, City/Municipality, Province"
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link
          href={member ? `/members/${member.id}` : "/members"}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
