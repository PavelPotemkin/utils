import { describe, expect, it } from "vitest";
import * as api from "../src";

describe("public API", () => {
  it("exports exactly the runtime symbols of 2.0", () => {
    expect(Object.keys(api).sort()).toEqual(
      ["HttpClient", "HttpError", "err", "isErr", "isHttpError", "isOk", "ok", "unwrap"].sort(),
    );
  });
});
