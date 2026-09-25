import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import {
  deleteFaceGroup,
  enrollFacePerson,
  ensureFaceGroup,
  faceConfig,
  removeFacePerson,
  searchFace,
  TencentFaceError,
} from "./tencent-face";

type Sent = { action: string; headers: Headers; body: Record<string, unknown> };

const ENV = {
  TENCENTCLOUD_SECRET_ID: "AKIDEXAMPLE",
  TENCENTCLOUD_SECRET_KEY: "example-secret-key",
  FACE_GROUP_ID: "irm-test",
};

const realFetch = globalThis.fetch;
const saved = { ...process.env };
let sent: Sent[];

/** Answer each action with the given Response body, in the order called. */
function tencent(...answers: Record<string, unknown>[]) {
  const queue = [...answers];
  globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    sent.push({
      action: headers.get("x-tc-action") ?? "",
      headers,
      body: JSON.parse(String(init?.body)),
    });
    return Response.json({ Response: { RequestId: "req", ...queue.shift() } });
  }) as unknown as typeof fetch;
}

const failure = (Code: string) => ({ Error: { Code, Message: Code } });

beforeEach(() => {
  sent = [];
  Object.assign(process.env, ENV);
  delete process.env.TENCENTCLOUD_REGION;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...saved };
});

describe("faceConfig", () => {
  it("is off unless the keys and the group are all set", () => {
    expect(faceConfig({})).toBeNull();
    expect(faceConfig({ ...ENV, FACE_GROUP_ID: " " })).toBeNull();
    expect(faceConfig({ ...ENV })).toEqual({
      secretId: "AKIDEXAMPLE",
      secretKey: "example-secret-key",
      region: "ap-singapore",
      groupId: "irm-test",
    });
  });
});

describe("requests", () => {
  it("are signed JSON posts naming the action, version and region", async () => {
    tencent({ Results: [] });
    await searchFace(new Uint8Array([1, 2, 3]));

    const [{ action, headers, body }] = sent;
    expect(action).toBe("SearchPersons");
    expect(headers.get("x-tc-version")).toBe("2020-03-03");
    expect(headers.get("x-tc-region")).toBe("ap-singapore");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("authorization")).toStartWith(
      "TC3-HMAC-SHA256 Credential=AKIDEXAMPLE/",
    );
    expect(body).toEqual({
      GroupIds: ["irm-test"],
      Image: "AQID",
      MaxFaceNum: 1,
      MaxPersonNum: 1,
      MinFaceSize: 64,
    });
  });

  it("surface Tencent's error code", async () => {
    tencent(failure("InvalidParameterValue.NoFaceInPhoto"));
    const error = await searchFace(new Uint8Array([1])).catch((e) => e);
    expect(error).toBeInstanceOf(TencentFaceError);
    expect(error).toMatchObject({
      code: "InvalidParameterValue.NoFaceInPhoto",
      requestId: "req",
    });
  });

  it("refuse to run unconfigured", async () => {
    delete process.env.FACE_GROUP_ID;
    await expect(searchFace(new Uint8Array([1]))).rejects.toMatchObject({
      code: "NotConfigured",
    });
  });
});

describe("searchFace", () => {
  it("returns the best candidate", async () => {
    tencent({ Results: [{ Candidates: [{ PersonId: "ana", Score: 97.5 }] }] });
    expect(await searchFace(new Uint8Array([1]))).toEqual({ personId: "ana", score: 97.5 });
  });

  it("finds nobody in an empty or missing group", async () => {
    tencent(failure("InvalidParameterValue.NoFaceInGroups"));
    expect(await searchFace(new Uint8Array([1]))).toBeNull();
    tencent(failure("InvalidParameterValue.GroupIdNotExist"));
    expect(await searchFace(new Uint8Array([1]))).toBeNull();
    tencent({ Results: [{ Candidates: [] }] });
    expect(await searchFace(new Uint8Array([1]))).toBeNull();
  });
});

describe("enrollFacePerson", () => {
  it("replaces the person within this group, sending the id as the name", async () => {
    tencent({}, {});
    await enrollFacePerson("member-1", new Uint8Array([1, 2, 3]));
    expect(sent.map((s) => s.action)).toEqual(["DeletePersonFromGroup", "CreatePerson"]);
    expect(sent[0].body).toEqual({ PersonId: "member-1", GroupId: "irm-test" });
    expect(sent[1].body).toEqual({
      GroupId: "irm-test",
      PersonId: "member-1",
      PersonName: "member-1",
      Image: "AQID",
      QualityControl: 2,
    });
  });

  it("creates the group on the deployment's first enrolment", async () => {
    tencent(
      failure("InvalidParameterValue.PersonIdNotExist"),
      failure("InvalidParameterValue.GroupIdNotExist"),
      {},
      {},
    );
    await enrollFacePerson("member-1", new Uint8Array([1]));
    expect(sent.map((s) => s.action)).toEqual([
      "DeletePersonFromGroup",
      "CreatePerson",
      "CreateGroup",
      "CreatePerson",
    ]);
    expect(sent[2].body).toEqual({
      GroupId: "irm-test",
      GroupName: "irm-test",
      FaceModelVersion: "3.0",
    });
  });

  it("passes a refused photo back", async () => {
    tencent({}, failure("FailedOperation.FaceQualityNotQualified"));
    await expect(enrollFacePerson("m", new Uint8Array([1]))).rejects.toMatchObject({
      code: "FailedOperation.FaceQualityNotQualified",
    });
  });
});

describe("removeFacePerson", () => {
  it("treats someone already gone as removed", async () => {
    tencent(failure("FailedOperation.GroupPersonMapNotExist"));
    await removeFacePerson("m");
    tencent(failure("AuthFailure.SignatureFailure"));
    await expect(removeFacePerson("m")).rejects.toMatchObject({
      code: "AuthFailure.SignatureFailure",
    });
  });
});

describe("ensureFaceGroup", () => {
  it("accepts a group that already exists under either error", async () => {
    tencent(failure("InvalidParameterValue.GroupIdAlreadyExist"));
    expect(await ensureFaceGroup()).toBe("exists");
    tencent(failure("InvalidParameterValue.GroupNameAlreadyExist"), { GroupId: "irm-test" });
    expect(await ensureFaceGroup()).toBe("exists");
    expect(sent.at(-1)?.action).toBe("GetGroupInfo");
  });

  it("does not mistake another group's name for ours", async () => {
    tencent(
      failure("InvalidParameterValue.GroupNameAlreadyExist"),
      failure("InvalidParameterValue.GroupIdNotExist"),
    );
    await expect(ensureFaceGroup()).rejects.toMatchObject({
      code: "InvalidParameterValue.GroupIdNotExist",
    });
  });
});

describe("deleteFaceGroup", () => {
  it("deletes this deployment's group, and accepts one already gone", async () => {
    tencent({});
    await deleteFaceGroup();
    expect(sent[0]).toMatchObject({ action: "DeleteGroup", body: { GroupId: "irm-test" } });
    tencent(failure("InvalidParameterValue.GroupIdNotExist"));
    await deleteFaceGroup();
  });
});
