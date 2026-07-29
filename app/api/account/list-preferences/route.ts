import { requireAuthUser } from "@/lib/auth";
import {
  apiError,
  assertSameOrigin,
  readJsonObject,
} from "@/lib/api";
import {
  ListValidationError,
  setListInclusionPreference,
} from "@/lib/lists";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser(request);
    return Response.json(
      { allowListInclusion: user.allowListInclusion },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser(request);
    const body = await readJsonObject(request);
    if (typeof body.allowListInclusion !== "boolean") {
      throw new ListValidationError("allowListInclusion must be a boolean.");
    }
    await setListInclusionPreference(user, body.allowListInclusion);
    return Response.json(
      { allowListInclusion: body.allowListInclusion },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
