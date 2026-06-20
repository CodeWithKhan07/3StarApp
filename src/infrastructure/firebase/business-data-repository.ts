import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch, type DocumentReference } from "firebase/firestore";
import type { BusinessDataSet } from "@/domain/entities/business";
import { db } from "@/infrastructure/firebase/client";

const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const safeId = (value: string, index: number) => (value || `record-${index}`).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);

export class FirebaseBusinessDataRepository {
  private async deleteBatch(ownerId: string, batchId: string) {
    const base = ["businessData", ownerId, "imports", batchId] as const;
    const snapshots = await Promise.all(
      (["clients", "projects", "quotations", "invoices"] as const).map((entity) =>
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
    const profile = await getDoc(doc(db, "businessData", ownerId));
    if (!profile.exists()) return null;
    const metadata = profile.data() as { activeBatchId?: string; company?: BusinessDataSet["company"] };
    if (!metadata.activeBatchId || !metadata.company) return null;
    const base = ["businessData", ownerId, "imports", metadata.activeBatchId] as const;
    const [clients, projects, quotations, invoices] = await Promise.all([
      getDocs(collection(db, ...base, "clients")), getDocs(collection(db, ...base, "projects")),
      getDocs(collection(db, ...base, "quotations")), getDocs(collection(db, ...base, "invoices")),
    ]);
    return { company: metadata.company, clients: clients.docs.map((item) => item.data()) as BusinessDataSet["clients"], projects: projects.docs.map((item) => item.data()) as BusinessDataSet["projects"], quotations: quotations.docs.map((item) => item.data()) as BusinessDataSet["quotations"], invoices: invoices.docs.map((item) => item.data()) as BusinessDataSet["invoices"] };
  }

  async replace(ownerId: string, data: BusinessDataSet, sourceFile: string) {
    const rootRef = doc(db, "businessData", ownerId);
    const current = await getDoc(rootRef);
    const previousBatchId = current.exists()
      ? (current.data() as { activeBatchId?: string }).activeBatchId
      : undefined;
    const batchId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const operations: Array<{ ref: ReturnType<typeof doc>; value: object }> = [];
    const base = ["businessData", ownerId, "imports", batchId] as const;
    operations.push({ ref: doc(db, ...base), value: { ownerId, sourceFile, createdAt: new Date().toISOString() } });
    (["clients", "projects", "quotations", "invoices"] as const).forEach((entity) => data[entity].forEach((record, index) => operations.push({ ref: doc(db, ...base, entity, safeId(record.id, index)), value: clean(record) })));
    for (let index = 0; index < operations.length; index += 400) {
      const batch = writeBatch(db);
      operations.slice(index, index + 400).forEach((operation) => batch.set(operation.ref, operation.value));
      await batch.commit();
    }
    await setDoc(rootRef, { ownerId, activeBatchId: batchId, company: clean(data.company), sourceFile, updatedAt: serverTimestamp() });
    if (previousBatchId && previousBatchId !== batchId) {
      await this.deleteBatch(ownerId, previousBatchId).catch(() => undefined);
    }
  }
}
