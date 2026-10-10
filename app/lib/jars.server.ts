import { isUniqueViolation, nowIso, type Db } from "./db.server";
import { newId, newSlugSuffix } from "./ids.server";
import { slugify, withSuffix } from "./slugs";

export type Visibility = "private" | "public";

export interface Jar {
  id: string;
  ownerId: string;
  publicSlug: string;
  title: string;
  description: string;
  fineAmount: number;
  currency: string;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
}

export interface JarInput {
  title: string;
  description: string;
  fineAmount: number;
  currency: string;
  visibility: Visibility;
  /** Requested public slug; null means derive one from the title. */
  publicSlug: string | null;
}

export interface JarSummary extends Jar {
  unsettledTotal: number;
  unsettledCount: number;
}

/** The requested public slug belongs to another jar. */
export class SlugTakenError extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super(`Public slug already taken: ${slug}`);
    this.name = "SlugTakenError";
    this.slug = slug;
  }
}

interface JarRow {
  id: string;
  owner_id: string;
  public_slug: string;
  title: string;
  description: string;
  fine_amount: number;
  currency: string;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
}

interface JarSummaryRow extends JarRow {
  unsettled_total: number;
  unsettled_count: number;
}

function rowToJar(row: JarRow): Jar {
  return {
    id: row.id,
    ownerId: row.owner_id,
    publicSlug: row.public_slug,
    title: row.title,
    description: row.description,
    fineAmount: row.fine_amount,
    currency: row.currency,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SUFFIX_ATTEMPTS = 5;

/**
 * Runs `attempt` with the requested slug, or with the title-derived slug and then
 * suffixed variants when that one is taken. An explicitly requested slug that is
 * taken throws SlugTakenError; a derived slug that stays taken after five suffixes
 * throws a plain Error.
 */
function withSlug<T>(input: Pick<JarInput, "title" | "publicSlug">, suffix: () => string, attempt: (slug: string) => T): T {
  if (input.publicSlug) {
    try {
      return attempt(input.publicSlug);
    } catch (error) {
      if (isUniqueViolation(error, "jars.public_slug")) throw new SlugTakenError(input.publicSlug);
      throw error;
    }
  }
  const base = slugify(input.title);
  const candidates = [base, ...Array.from({ length: SUFFIX_ATTEMPTS }, () => () => withSuffix(base, suffix()))];
  for (const candidate of candidates) {
    const slug = typeof candidate === "string" ? candidate : candidate();
    try {
      return attempt(slug);
    } catch (error) {
      if (!isUniqueViolation(error, "jars.public_slug")) throw error;
    }
  }
  throw new Error("Could not allocate a unique public slug");
}

export function createJar(db: Db, ownerId: string, input: JarInput, suffix: () => string = newSlugSuffix): Jar {
  const id = newId();
  const ts = nowIso();
  const insert = db.prepare(
    `INSERT INTO jars (id, owner_id, public_slug, title, description, fine_amount, currency, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  return withSlug(input, suffix, (slug) => {
    insert.run(id, ownerId, slug, input.title, input.description, input.fineAmount, input.currency, input.visibility, ts, ts);
    return getJarById(db, id) as Jar;
  });
}

export function isSlugAvailable(db: Db, slug: string, exceptJarId?: string): boolean {
  const row = db.prepare<[string], { id: string }>("SELECT id FROM jars WHERE public_slug = ?").get(slug);
  return !row || row.id === exceptJarId;
}

export function getJarById(db: Db, id: string): Jar | null {
  const row = db.prepare<[string], JarRow>("SELECT * FROM jars WHERE id = ?").get(id);
  return row ? rowToJar(row) : null;
}

export function getJarForOwner(db: Db, id: string, ownerId: string): Jar | null {
  const row = db.prepare<[string, string], JarRow>("SELECT * FROM jars WHERE id = ? AND owner_id = ?").get(id, ownerId);
  return row ? rowToJar(row) : null;
}

export function getPublicJarBySlug(db: Db, slug: string): Jar | null {
  const row = db
    .prepare<[string], JarRow>("SELECT * FROM jars WHERE public_slug = ? AND visibility = 'public'")
    .get(slug);
  return row ? rowToJar(row) : null;
}

export function listJarsForOwner(db: Db, ownerId: string): JarSummary[] {
  const rows = db
    .prepare<[string], JarSummaryRow>(
      `SELECT j.*,
         COALESCE((SELECT SUM(t.amount) FROM fines t WHERE t.jar_id = j.id AND t.settlement_id IS NULL), 0) AS unsettled_total,
         (SELECT COUNT(*) FROM fines t WHERE t.jar_id = j.id AND t.settlement_id IS NULL) AS unsettled_count
       FROM jars j
       WHERE j.owner_id = ?
       ORDER BY j.created_at DESC, j.rowid DESC`,
    )
    .all(ownerId);
  return rows.map((row) => ({ ...rowToJar(row), unsettledTotal: row.unsettled_total, unsettledCount: row.unsettled_count }));
}

export function updateJar(db: Db, id: string, input: JarInput, suffix: () => string = newSlugSuffix): Jar | null {
  if (!getJarById(db, id)) return null;
  const update = db.prepare(
    `UPDATE jars SET title = ?, description = ?, fine_amount = ?, currency = ?, visibility = ?, public_slug = ?, updated_at = ? WHERE id = ?`,
  );
  return withSlug(input, suffix, (slug) => {
    update.run(input.title, input.description, input.fineAmount, input.currency, input.visibility, slug, nowIso(), id);
    return getJarById(db, id);
  });
}

export function deleteJar(db: Db, id: string): boolean {
  return db.prepare("DELETE FROM jars WHERE id = ?").run(id).changes > 0;
}

export interface Fine {
  id: string;
  jarId: string;
  amount: number;
  note: string | null;
  settlementId: string | null;
  createdAt: string;
}

export interface Settlement {
  id: string;
  jarId: string;
  total: number;
  note: string | null;
  createdAt: string;
  fineCount: number;
}

export interface Balance {
  total: number;
  count: number;
}

export interface History {
  unsettled: Fine[];
  settlements: Settlement[];
}

interface FineRow {
  id: string;
  jar_id: string;
  amount: number;
  note: string | null;
  settlement_id: string | null;
  created_at: string;
}

interface SettlementRow {
  id: string;
  jar_id: string;
  total: number;
  note: string | null;
  created_at: string;
  fine_count: number;
}

function rowToFine(row: FineRow): Fine {
  return { id: row.id, jarId: row.jar_id, amount: row.amount, note: row.note, settlementId: row.settlement_id, createdAt: row.created_at };
}

function rowToSettlement(row: SettlementRow): Settlement {
  return { id: row.id, jarId: row.jar_id, total: row.total, note: row.note, createdAt: row.created_at, fineCount: row.fine_count };
}

export function addFine(db: Db, jarId: string, note: string | null): Fine | null {
  const jar = getJarById(db, jarId);
  if (!jar) return null;
  const fine: Fine = { id: newId(), jarId, amount: jar.fineAmount, note, settlementId: null, createdAt: nowIso() };
  db.prepare("INSERT INTO fines (id, jar_id, amount, note, settlement_id, created_at) VALUES (?, ?, ?, ?, NULL, ?)").run(
    fine.id,
    fine.jarId,
    fine.amount,
    fine.note,
    fine.createdAt,
  );
  return fine;
}

export function deleteFine(db: Db, jarId: string, fineId: string): "deleted" | "settled" | "missing" {
  const row = db
    .prepare<[string, string], { settlement_id: string | null }>("SELECT settlement_id FROM fines WHERE id = ? AND jar_id = ?")
    .get(fineId, jarId);
  if (!row) return "missing";
  if (row.settlement_id) return "settled";
  db.prepare("DELETE FROM fines WHERE id = ?").run(fineId);
  return "deleted";
}

export function getBalance(db: Db, jarId: string): Balance {
  const row = db
    .prepare<[string], { total: number; count: number }>(
      "SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM fines WHERE jar_id = ? AND settlement_id IS NULL",
    )
    .get(jarId);
  return row ?? { total: 0, count: 0 };
}

export function settle(db: Db, jarId: string, note: string | null): Settlement | null {
  return db.transaction((): Settlement | null => {
    const balance = getBalance(db, jarId);
    if (balance.count === 0) return null;
    const settlement: Settlement = { id: newId(), jarId, total: balance.total, note, createdAt: nowIso(), fineCount: balance.count };
    db.prepare("INSERT INTO settlements (id, jar_id, total, note, created_at) VALUES (?, ?, ?, ?, ?)").run(
      settlement.id,
      jarId,
      settlement.total,
      note,
      settlement.createdAt,
    );
    db.prepare("UPDATE fines SET settlement_id = ? WHERE jar_id = ? AND settlement_id IS NULL").run(settlement.id, jarId);
    return settlement;
  })();
}

export function getHistory(db: Db, jarId: string): History {
  const unsettled = db
    .prepare<[string], FineRow>("SELECT * FROM fines WHERE jar_id = ? AND settlement_id IS NULL ORDER BY created_at DESC, rowid DESC")
    .all(jarId)
    .map(rowToFine);
  const settlements = db
    .prepare<[string], SettlementRow>(
      `SELECT s.*, (SELECT COUNT(*) FROM fines t WHERE t.settlement_id = s.id) AS fine_count
       FROM settlements s WHERE s.jar_id = ? ORDER BY s.created_at DESC, s.rowid DESC`,
    )
    .all(jarId)
    .map(rowToSettlement);
  return { unsettled, settlements };
}
