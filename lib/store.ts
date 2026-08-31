import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ParcelMeta } from "@/lib/parcel";

const DATA_FILE = path.join(process.cwd(), "data", "parcels.json");

function readAll(): Map<string, ParcelMeta> {
  try {
    const records = JSON.parse(readFileSync(DATA_FILE, "utf8")) as ParcelMeta[];
    return new Map(records.map((record) => [record.id, record]));
  } catch {
    return new Map();
  }
}

function writeAll(store: Map<string, ParcelMeta>): void {
  mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  writeFileSync(
    DATA_FILE,
    `${JSON.stringify([...store.values()], null, 2)}\n`,
  );
}

export function getParcelStore(): {
  get(id: string): ParcelMeta | undefined;
  set(id: string, meta: ParcelMeta): void;
} {
  return {
    get(id: string) {
      return readAll().get(id);
    },
    set(id: string, meta: ParcelMeta) {
      const store = readAll();
      store.set(id, meta);
      writeAll(store);
    },
  };
}
