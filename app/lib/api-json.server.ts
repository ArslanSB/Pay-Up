import type { Device } from "./devices.server";
import type { Fine, JarSummary, Settlement } from "./jars.server";
import type { User } from "./users.server";

// The JSON shapes of spec section 5.4. Money in minor units, times in UTC ISO strings, no formatted labels.

export function userJson(user: User) {
  return { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, provider: user.provider };
}

export function deviceJson(device: Device, currentId: string) {
  return { id: device.id, kind: device.kind, name: device.name, createdAt: device.createdAt, lastUsedAt: device.lastUsedAt, current: device.id === currentId };
}

export function jarJson(jar: JarSummary, appUrl: string) {
  return {
    id: jar.id,
    title: jar.title,
    description: jar.description,
    fineAmount: jar.fineAmount,
    currency: jar.currency,
    visibility: jar.visibility,
    publicSlug: jar.publicSlug,
    publicUrl: `${appUrl}/j/${jar.publicSlug}`,
    unsettledTotal: jar.unsettledTotal,
    unsettledCount: jar.unsettledCount,
    createdAt: jar.createdAt,
    updatedAt: jar.updatedAt,
  };
}

export function fineJson(fine: Fine) {
  return { id: fine.id, amount: fine.amount, note: fine.note, createdAt: fine.createdAt };
}

export function settlementJson(settlement: Settlement) {
  return { id: settlement.id, total: settlement.total, note: settlement.note, fineCount: settlement.fineCount, createdAt: settlement.createdAt };
}
