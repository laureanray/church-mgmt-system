import "server-only";

import { FACE_MIN_FACE_SIZE, FACE_NETWORK_CODE, FACE_TIMEOUT_CODE } from "@/lib/face-policy";
import { TC3_CONTENT_TYPE, tc3Authorization } from "@/lib/tc3-signature";

/**
 * Tencent Cloud Face Recognition ("IAI", API version 2020-03-03), called with
 * plain fetch and the TC3 signer rather than Tencent's SDK.
 *
 * One face group per deployment, named by FACE_GROUP_ID. A member is a
 * "person" in it whose PersonId is `members.id` and whose PersonName is the
 * same id: no name, birthday or anything else leaves this app, only photos.
 *
 * PersonIds are unique across the whole Tencent account, not per group, so
 * every removal here is scoped to this deployment's group
 * (DeletePersonFromGroup). A bare DeletePerson would also remove the person
 * from any other deployment's group sharing the account.
 */

const VERSION = "2020-03-03";
const SERVICE = "iai";
const TIMEOUT_MS = 8000;
const DEFAULT_REGION = "ap-singapore";

export type FaceConfig = {
  secretId: string;
  secretKey: string;
  region: string;
  groupId: string;
};

/**
 * Face check-in is on only when every variable is set; without them the app
 * behaves exactly as it did before face recognition existed.
 */
export function faceConfig(
  env: Record<string, string | undefined> = process.env,
): FaceConfig | null {
  const secretId = env.TENCENTCLOUD_SECRET_ID?.trim();
  const secretKey = env.TENCENTCLOUD_SECRET_KEY?.trim();
  const groupId = env.FACE_GROUP_ID?.trim();
  if (!secretId || !secretKey || !groupId) return null;
  const region = env.TENCENTCLOUD_REGION?.trim() || DEFAULT_REGION;
  return { secretId, secretKey, region, groupId };
}

export function isFaceConfigured(): boolean {
  return faceConfig() !== null;
}

/** A refusal from Tencent, or the app's own timeout or network failure. */
export class TencentFaceError extends Error {
  readonly code: string;
  readonly requestId?: string;

  constructor(code: string, message: string, requestId?: string) {
    super(message);
    this.name = "TencentFaceError";
    this.code = code;
    this.requestId = requestId;
  }
}

export function isTencentFaceError(error: unknown): error is TencentFaceError {
  return error instanceof TencentFaceError;
}

/** Whether `error` is Tencent's `code`, ignoring the category prefix. */
function hasCode(error: unknown, ...codes: string[]) {
  return (
    isTencentFaceError(error) &&
    codes.some((code) => error.code === code || error.code.endsWith(`.${code}`))
  );
}

function requireConfig(): FaceConfig {
  const config = faceConfig();
  if (!config) {
    throw new TencentFaceError(
      "NotConfigured",
      "Face recognition is not configured.",
    );
  }
  return config;
}

async function call<T>(
  config: FaceConfig,
  action: string,
  params: Record<string, unknown>,
): Promise<T> {
  const host = `${SERVICE}.${config.region}.tencentcloudapi.com`;
  const body = JSON.stringify(params);
  const timestamp = Math.floor(Date.now() / 1000);

  let response: Response;
  try {
    response = await fetch(`https://${host}/`, {
      method: "POST",
      headers: {
        Authorization: tc3Authorization({
          secretId: config.secretId,
          secretKey: config.secretKey,
          service: SERVICE,
          host,
          body,
          timestamp,
        }),
        "Content-Type": TC3_CONTENT_TYPE,
        "X-TC-Action": action,
        "X-TC-Version": VERSION,
        "X-TC-Timestamp": String(timestamp),
        "X-TC-Region": config.region,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new TencentFaceError(FACE_TIMEOUT_CODE, `${action} timed out`);
    }
    throw new TencentFaceError(
      FACE_NETWORK_CODE,
      `${action} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Tencent answers 200 with an Error object for every API-level failure; a
  // non-JSON body means something between here and there broke instead.
  let payload: { Response?: T & { Error?: { Code: string; Message: string }; RequestId?: string } };
  try {
    payload = await response.json();
  } catch {
    throw new TencentFaceError(
      FACE_NETWORK_CODE,
      `${action} returned HTTP ${response.status} without a JSON body`,
    );
  }
  const result = payload.Response;
  if (!result) {
    throw new TencentFaceError(FACE_NETWORK_CODE, `${action} returned no Response`);
  }
  if (result.Error) {
    throw new TencentFaceError(
      result.Error.Code,
      result.Error.Message,
      result.RequestId,
    );
  }
  return result;
}

const base64 = (image: Uint8Array) => Buffer.from(image).toString("base64");

/**
 * Create this deployment's group. Idempotent: an existing group is fine.
 * Model 3.0 is Tencent's current one; a group cannot change model later.
 */
export async function ensureFaceGroup(): Promise<"created" | "exists"> {
  const config = requireConfig();
  try {
    await call(config, "CreateGroup", {
      GroupId: config.groupId,
      GroupName: config.groupId,
      FaceModelVersion: "3.0",
    });
    return "created";
  } catch (error) {
    if (hasCode(error, "GroupIdAlreadyExist")) return "exists";
    // Tencent checks the name before the id, and names are unique across the
    // account too. Since the name is the id, this is usually our own group —
    // but confirm it, rather than assume, in case another group took the name.
    if (hasCode(error, "GroupNameAlreadyExist")) {
      await call(config, "GetGroupInfo", { GroupId: config.groupId });
      return "exists";
    }
    throw error;
  }
}

/**
 * Delete this deployment's whole group, and every face in it — the purge for
 * a church that stops using face check-in. Absent already is fine. A person
 * who belonged to no other group is deleted along with it, per Tencent.
 */
export async function deleteFaceGroup(): Promise<void> {
  const config = requireConfig();
  try {
    await call(config, "DeleteGroup", { GroupId: config.groupId });
  } catch (error) {
    if (hasCode(error, "GroupIdNotExist")) return;
    throw error;
  }
}

/** Remove a member from this deployment's group; absent already is fine. */
export async function removeFacePerson(personId: string): Promise<void> {
  const config = requireConfig();
  try {
    await call(config, "DeletePersonFromGroup", {
      PersonId: personId,
      GroupId: config.groupId,
    });
  } catch (error) {
    if (
      hasCode(
        error,
        "PersonIdNotExist",
        "GroupPersonMapNotExist",
        "GroupIdNotExist",
      )
    ) {
      return;
    }
    throw error;
  }
}

/**
 * Enrol `image` as the one face for `personId`, replacing whatever was there.
 * QualityControl 2 makes Tencent refuse a dark, blurred or half-hidden face
 * at enrolment, where someone can retake it, rather than matching poorly at
 * the door for months.
 */
export async function enrollFacePerson(
  personId: string,
  image: Uint8Array,
): Promise<void> {
  const config = requireConfig();
  await removeFacePerson(personId);

  const create = () =>
    call(config, "CreatePerson", {
      GroupId: config.groupId,
      PersonId: personId,
      PersonName: personId,
      Image: base64(image),
      QualityControl: 2,
    });

  try {
    await create();
  } catch (error) {
    // The first enrolment on a new deployment creates its group.
    if (!hasCode(error, "GroupIdNotExist")) throw error;
    await ensureFaceGroup();
    await create();
  }
}

export type FaceMatch = { personId: string; score: number };

type SearchPersonsResponse = {
  Results?: {
    Candidates?: { PersonId: string; Score: number }[];
    RetCode?: number;
  }[];
};

/**
 * The enrolled person most like the largest face in `image`, or null when
 * the group holds nobody like them. Throws `NoFaceInPhoto` for an empty
 * frame; the caller decides that is not worth mentioning.
 */
export async function searchFace(image: Uint8Array): Promise<FaceMatch | null> {
  const config = requireConfig();
  let result: SearchPersonsResponse;
  try {
    result = await call<SearchPersonsResponse>(config, "SearchPersons", {
      GroupIds: [config.groupId],
      Image: base64(image),
      MaxFaceNum: 1,
      MaxPersonNum: 1,
      MinFaceSize: FACE_MIN_FACE_SIZE,
    });
  } catch (error) {
    // Nobody enrolled yet, or no group yet: nobody to match.
    if (hasCode(error, "NoFaceInGroups", "GroupIdNotExist")) return null;
    throw error;
  }
  const best = result.Results?.[0]?.Candidates?.[0];
  if (!best?.PersonId) return null;
  return { personId: best.PersonId, score: best.Score };
}

/** How many people and photos this deployment's group holds. */
export async function describeFaceGroup(): Promise<{ people: number; faces: number }> {
  const config = requireConfig();
  const result = await call<{ PersonNum?: number; FaceNum?: number }>(
    config,
    "GetPersonList",
    { GroupId: config.groupId, Limit: 1 },
  );
  return { people: result.PersonNum ?? 0, faces: result.FaceNum ?? 0 };
}
