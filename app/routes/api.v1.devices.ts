import type { Route } from "./+types/api.v1.devices";
import { api, apiJson, methodNotAllowed, requireDevice } from "../lib/api.server";
import { deviceJson } from "../lib/api-json.server";
import { getDb } from "../lib/db.server";
import { listDevices } from "../lib/devices.server";

export const loader = api(async ({ request }: Route.LoaderArgs) => {
  const db = getDb();
  const { device, user } = requireDevice(request, db);
  return apiJson({ devices: listDevices(db, user.id).map((d) => deviceJson(d, device.id)) });
});

export const action = api(async () => methodNotAllowed(["GET"]));
