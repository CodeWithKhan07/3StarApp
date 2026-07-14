import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc, writeBatch, type DocumentReference } from "firebase/firestore";
import type { BusinessDataSet } from "@/domain/entities/business";
import type { BusinessDataRepository } from "@/domain/repositories/repositories";
import { getFirebaseDb } from "@/infrastructure/firebase/client";

const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const safeId = (value: string, index: number) => (value || `record-${index}`).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);
const reservationId = (value: string) => value.trim().toUpperCase().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);

export class FirebaseBusinessDataRepository implements BusinessDataRepository {
  private async deleteBatch(ownerId: string, batchId: string) {
    const db = getFirebaseDb();
    const base = ["businessData", ownerId, "imports", batchId] as const;
    const snapshots = await Promise.all(
      // Trash is part of the same snapshot so restore/delete behavior is
      // consistent across devices, not only in one browser cache.
      (["clients", "projects", "quotations", "invoices", "trash"] as const).map((entity) =>
        getDocs(collection(db, ...base, entity))
      )
    );
    const refs: DocumentReference[] = snapshots.flatMap((snapshot) => snapshot.docs.map((item) => item.ref));
    refs.push(doc(db, ...base));
    for (let index = 0; index < refs.length; index += 400) {
      const batch = writeBatch(db);
      refs.slice(index, index + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  }

  async load(ownerId: string): Promise<BusinessDataSet | null> {
    const db = getFirebaseDb();
    const profile = await getDoc(doc(db, "businessData", ownerId));
    if (!profile.exists()) return null;
    const metadata = profile.data() as { activeBatchId?: string; company?: BusinessDataSet["company"] };
    if (!metadata.activeBatchId || !metadata.company) return null;
    const base = ["businessData", ownerId, "imports", metadata.activeBatchId] as const;
    const [clients, projects, quotations, invoices, trash] = await Promise.all([
      getDocs(collection(db, ...base, "clients")), getDocs(collection(db, ...base, "projects")),
      getDocs(collection(db, ...base, "quotations")), getDocs(collection(db, ...base, "invoices")),
      getDocs(collection(db, ...base, "trash")),
    ]);
    return { company: metadata.company, clients: clients.docs.map((item) => item.data()) as BusinessDataSet["clients"], projects: projects.docs.map((item) => item.data()) as BusinessDataSet["projects"], quotations: quotations.docs.map((item) => item.data()) as BusinessDataSet["quotations"], invoices: invoices.docs.map((item) => item.data()) as BusinessDataSet["invoices"], trash: trash.docs.map((item) => item.data()) as NonNullable<BusinessDataSet["trash"]> };
  }

  async replace(ownerId: string, data: BusinessDataSet, sourceFile: string) {
    const db = getFirebaseDb();
    const rootRef = doc(db, "businessData", ownerId);
    const current = await getDoc(rootRef);
    const previousBatchId = current.exists()
      ? (current.data() as { activeBatchId?: string }).activeBatchId
      : undefined;
    const batchId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const operations: Array<{ ref: ReturnType<typeof doc>; value: object; merge?: boolean }> = [];
    const base = ["businessData", ownerId, "imports", batchId] as const;
    operations.push({ ref: doc(db, ...base), value: { ownerId, sourceFile, createdAt: new Date().toISOString() } });
    (["clients", "projects", "quotations", "invoices"] as const).forEach((entity) => data[entity].forEach((record, index) => operations.push({ ref: doc(db, ...base, entity, safeId(record.id, index)), value: clean(record) })));
    (data.trash || []).forEach((record, index) => operations.push({ ref: doc(db, ...base, "trash", safeId(record.id, index)), value: clean(record) }));
    data.quotations.forEach((quotation) => {
      const id = reservationId(quotation.id || "");
      if (!id) return;
      operations.push({
        ref: doc(db, "businessData", ownerId, "quotationNumberReservations", id),
        value: {
          ownerId,
          quotationId: String(quotation.id || "").trim().toUpperCase(),
          syncedAt: serverTimestamp(),
        },
        merge: true,
      });
    });
    for (let index = 0; index < operations.length; index += 400) {
      const batch = writeBatch(db);
      operations.slice(index, index + 400).forEach((operation) => {
        if (operation.merge) {
          batch.set(operation.ref, operation.value, { merge: true });
          return;
        }

        batch.set(operation.ref, operation.value);
      });
      await batch.commit();
    }
    await setDoc(rootRef, { ownerId, activeBatchId: batchId, company: clean(data.company), sourceFile, updatedAt: serverTimestamp() });
    if (previousBatchId && previousBatchId !== batchId) {
      await this.deleteBatch(ownerId, previousBatchId).catch(() => undefined);
    }
  }

  async reserveQuotationId(ownerId: string, quotationId: string) {
    const db = getFirebaseDb();
    const id = reservationId(quotationId);
    const ref = doc(db, "businessData", ownerId, "quotationNumberReservations", id);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);

      if (snapshot.exists()) {
        throw new Error(`Quotation number ${quotationId} is already reserved.`);
      }

      transaction.set(ref, {
        ownerId,
        quotationId,
        reservedAt: serverTimestamp(),
      });
    });
  }

  async releaseQuotationId(ownerId: string, quotationId: string) {
    const db = getFirebaseDb();
    const id = reservationId(quotationId);
    if (!id) return;

    await deleteDoc(doc(db, "businessData", ownerId, "quotationNumberReservations", id));
  }

  async pruneStaleQuotationReservations(ownerId: string, activeQuotationIds: string[]) {
    const db = getFirebaseDb();
    const activeIds = new Set(activeQuotationIds.map(reservationId).filter(Boolean));
    const snapshot = await getDocs(
      collection(db, "businessData", ownerId, "quotationNumberReservations"),
    );

    await Promise.all(
      snapshot.docs.map((reservation) => {
        if (activeIds.has(reservation.id)) return Promise.resolve();
        return deleteDoc(reservation.ref);
      }),
    );
  }
}
