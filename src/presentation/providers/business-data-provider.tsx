"use client";

import {
  parseBusinessWorkbook,
  type ImportResult,
} from "@/application/services/excel-import";
import {
  assertUniqueRecordId,
  prepareRecordForSave,
  recordIdsEqual,
  type CollectionKey,
  type EntityMap,
} from "@/application/services/business-records";
import workbook from "@/data/workbook-data.json";
import type { BusinessDataSet, TrashItem } from "@/domain/entities/business";
import { FirebaseBusinessDataRepository } from "@/infrastructure/firebase/business-data-repository";
import { useAuth } from "@/presentation/providers/auth-provider";
import {
  createNextInvoiceId,
  createNextProjectId,
  createQuotationSerial,
  ensureQuotationSerial,
} from "@/lib/record-ids";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type SyncState = "synced" | "syncing" | "offline" | "error";

interface BusinessDataContextValue {
  data: BusinessDataSet;
  loading: boolean;
  syncState: SyncState;
  lastError: string;
  trash: TrashItem[];

  importFile: (file: File) => Promise<ImportResult>;

  createRecord: <TKey extends CollectionKey>(
    key: TKey,
    record: EntityMap[TKey],
  ) => Promise<void>;

  updateRecord: <TKey extends CollectionKey>(
    key: TKey,
    record: EntityMap[TKey],
  ) => Promise<void>;

  deleteRecord: <TKey extends CollectionKey>(
    key: TKey,
    id: string,
  ) => Promise<void>;

  restoreTrashItem: (trashId: string) => Promise<void>;

  permanentlyDeleteTrashItem: (trashId: string) => Promise<void>;

  emptyTrash: () => Promise<void>;

  patchRecord: <TKey extends CollectionKey>(
    key: TKey,
    id: string,
    patch: Partial<EntityMap[TKey]>,
  ) => Promise<void>;

  createProject: (project: EntityMap["projects"]) => Promise<void>;
  updateProject: (project: EntityMap["projects"]) => Promise<void>;

  createQuotation: (quotation: EntityMap["quotations"]) => Promise<void>;

  createInvoiceFromQuotation: (
    quotationId: string,
    draft: Partial<EntityMap["invoices"]>,
  ) => Promise<void>;

  completeInvoicePayment: (id: string) => Promise<void>;

  updateProjectStatus: (
    id: string,
    status: EntityMap["projects"] extends { status: infer TStatus }
      ? TStatus
      : string,
  ) => Promise<void>;

  updateQuotationStatus: (
    id: string,
    status: EntityMap["quotations"] extends { status: infer TStatus }
      ? TStatus
      : string,
  ) => Promise<void>;

  updateInvoiceStatus: (
    id: string,
    status: EntityMap["invoices"] extends { status: infer TStatus }
      ? TStatus
      : string,
  ) => Promise<void>;

  updateInvoicePayment: (
    id: string,
    patch: Partial<EntityMap["invoices"]>,
  ) => Promise<void>;

  forceSync: () => Promise<void>;
}

const importedInitialData = workbook as unknown as BusinessDataSet;
const defaultCompanyEmail = "ksajjad324@gmail.com";
const legacyCompanyEmail = "shahzaibkhan3356@gmail.com";

function normalizeCompanyEmail(value?: string) {
  const email = value?.trim();
  if (!email || email.toLowerCase() === legacyCompanyEmail) {
    return defaultCompanyEmail;
  }

  return email;
}

const initialData: BusinessDataSet = {
  ...importedInitialData,
  trash: [],
  quotations: importedInitialData.quotations.map((quotation) => ({
    ...quotation,
    serialNumber: ensureQuotationSerial(quotation.id, quotation.serialNumber),
  })),
};

const trashRetentionDays = 30;
const dayInMs = 24 * 60 * 60 * 1000;

function preserveCompanyProfile(next: BusinessDataSet): BusinessDataSet {
  const fallback = initialData.company;
  const company = next.company || fallback;
  const keep = (value: string | undefined, defaultValue: string) =>
    value?.trim() ? value : defaultValue;
  const now = Date.now();

  return {
    ...next,
    trash: (next.trash || []).filter((item) => {
      const expires = new Date(item.deleteAfter).valueOf();
      return Number.isNaN(expires) || expires > now;
    }),
    quotations: next.quotations.map((quotation) => ({
      ...quotation,
      serialNumber: ensureQuotationSerial(quotation.id, quotation.serialNumber),
      // Legacy/imported rows may predate explicit financial metadata.
      currency: quotation.currency || company.currency || fallback.currency,
      vatRate: quotation.vatRate ?? company.vatRate ?? fallback.vatRate,
    })),
    invoices: next.invoices.map((invoice) => ({
      ...invoice,
      supplierEmail: normalizeCompanyEmail(invoice.supplierEmail),
      currency: invoice.currency || company.currency || fallback.currency,
    })),
    company: {
      businessName: keep(company.businessName, fallback.businessName),
      legalCompanyName: keep(
        company.legalCompanyName,
        fallback.legalCompanyName,
      ),
      crNumber: keep(company.crNumber, fallback.crNumber),
      vatNumber: keep(company.vatNumber, fallback.vatNumber),
      city: keep(company.city, fallback.city),
      country: keep(company.country, fallback.country),
      phone: keep(company.phone, fallback.phone),
      email: normalizeCompanyEmail(company.email || fallback.email),
      currency: keep(company.currency, fallback.currency),
      vatRate: Number.isFinite(company.vatRate)
        ? company.vatRate
        : fallback.vatRate,
    },
  };
}

const BusinessDataContext = createContext<BusinessDataContextValue | null>(
  null,
);

// Versioned keys deliberately ignore the old cache that was initialized from
// the bundled demo workbook. Only data created/imported by this app version is
// restored locally.
const localKey = "3star-business-data-v2";
const pendingKey = "3star-pending-sync-v2";

const isBrowser = () => typeof window !== "undefined";

const today = () => new Date().toISOString().slice(0, 10);

const addDaysIso = (date: Date, days: number) =>
  new Date(date.valueOf() + days * dayInMs).toISOString();

function getRecordLabel(key: CollectionKey, record: EntityMap[CollectionKey]) {
  if (key === "projects") {
    const project = record as EntityMap["projects"];
    return project.id || project.company || "Project";
  }

  if (key === "quotations") {
    const quotation = record as EntityMap["quotations"];
    return quotation.id || quotation.companyName || "Quotation";
  }

  if (key === "invoices") {
    const invoice = record as EntityMap["invoices"];
    return invoice.id || invoice.companyName || "Invoice";
  }

  const client = record as EntityMap["clients"];
  return client.companyName || client.id || "Client";
}

function getRecordCompany(key: CollectionKey, record: EntityMap[CollectionKey]) {
  if (key === "projects") return (record as EntityMap["projects"]).company || "";
  if (key === "clients") return (record as EntityMap["clients"]).companyName || "";
  return (record as EntityMap["quotations"] | EntityMap["invoices"]).companyName || "";
}

function buildProjectFromQuotation(
  quotation: EntityMap["quotations"],
  existingProjectIds: string[],
): EntityMap["projects"] {
  return {
    id: createNextProjectId(existingProjectIds),
    company: quotation.companyName,
    store: quotation.store ?? "",
    workDescription: quotation.scopeOfWork,
    category: "Other",
    quotationNo: quotation.id,
    value: quotation.amount,
    startDate: today(),
    expectedCompletion: "",
    completion: 0,
    status: "in-progress",
    priority: "medium",
  };
}

export function BusinessDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const repository = useMemo(() => new FirebaseBusinessDataRepository(), []);

  const [data, setData] = useState<BusinessDataSet>(initialData);
  // The ref is updated synchronously before React rerenders so back-to-back
  // CRUD operations always build on the newest committed snapshot.
  const dataRef = useRef<BusinessDataSet>(initialData);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>("synced");
  const [lastError, setLastError] = useState("");
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const syncRevisionRef = useRef(0);
  const mutationRevisionRef = useRef(0);
  const localPersistRevisionRef = useRef(0);
  const pendingPersistRevisionRef = useRef(0);

  const persistLocal = useCallback((next: BusinessDataSet) => {
    dataRef.current = next;
    setData(next);

    if (!isBrowser()) return;

    const revision = ++localPersistRevisionRef.current;
    window.setTimeout(() => {
      if (revision !== localPersistRevisionRef.current) return;

      try {
        window.localStorage.setItem(localKey, JSON.stringify(next));
      } catch {
        setLastError("Local cache is full. Data remains active in memory.");
      }
    }, 0);
  }, []);

  const savePendingSync = useCallback(
    (next: BusinessDataSet, source: string) => {
      if (!isBrowser()) return;

      const revision = ++pendingPersistRevisionRef.current;
      window.setTimeout(() => {
        if (revision !== pendingPersistRevisionRef.current) return;

        try {
          window.localStorage.setItem(
            pendingKey,
            JSON.stringify({
              data: next,
              source,
            }),
          );
        } catch {
          setLastError("Pending cloud sync could not be cached locally.");
        }
      }, 0);
    },
    [],
  );

  const sync = useCallback(
    async (next: BusinessDataSet, source: string) => {
      if (!user) {
        savePendingSync(next, source);
        setSyncState("offline");
        return;
      }

      const revision = ++syncRevisionRef.current;
      setSyncState("syncing");

      const execute = async () => {
        try {
          await repository.replace(user.uid, next, source);

          if (revision === syncRevisionRef.current) {
            pendingPersistRevisionRef.current += 1;
            if (isBrowser()) window.localStorage.removeItem(pendingKey);
            setSyncState("synced");
            setLastError("");
          }
        } catch (error) {
          // An older failed write must never replace a newer pending snapshot.
          if (revision === syncRevisionRef.current) {
            savePendingSync(next, source);
            setSyncState(isBrowser() && navigator.onLine ? "error" : "offline");
            setLastError(
              error instanceof Error
                ? error.message
                : "Cloud synchronization failed.",
            );
          }
          throw error;
        }
      };

      // Full-dataset snapshots must reach Firebase in the exact order they
      // were created. Otherwise an older request can finish last and resurrect
      // records that the user already deleted.
      const queued = syncQueueRef.current.catch(() => undefined).then(execute);
      syncQueueRef.current = queued.catch(() => undefined);
      await queued;
    },
    [repository, savePendingSync, user],
  );

  const saveInstant = useCallback(
    (next: BusinessDataSet, source: string) => {
      mutationRevisionRef.current += 1;
      persistLocal(next);
      void sync(next, source).catch(() => undefined);
    },
    [persistLocal, sync],
  );

  const commitMutation = useCallback(
    (
      source: string,
      mutate: (current: BusinessDataSet) => BusinessDataSet,
    ) => {
      const next = preserveCompanyProfile(mutate(dataRef.current));
      saveInstant(next, source);
      return next;
    },
    [saveInstant],
  );

  useEffect(() => {
    if (!data.trash?.length) return;

    const purgeExpired = () => {
      const now = Date.now();
      const currentTrash = dataRef.current.trash || [];
      const activeTrash = currentTrash.filter((item) => {
        const expires = new Date(item.deleteAfter).valueOf();
        return Number.isNaN(expires) || expires > now;
      });

      if (activeTrash.length === currentTrash.length) return;

      commitMutation("trash-auto-cleanup", (current) => ({
        ...current,
        trash: activeTrash,
      }));
    };

    purgeExpired();
    const timer = window.setInterval(purgeExpired, 60 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [commitMutation, data.trash]);

  useEffect(() => {
    if (!user) {
      // Schedule the state transition outside the effect's synchronous phase.
      queueMicrotask(() => setLoading(false));
      return;
    }

    let active = true;
    const loadMutationRevision = mutationRevisionRef.current;

    queueMicrotask(() => {
      if (active) setLoading(true);
    });

    if (isBrowser()) {
      const local = window.localStorage.getItem(localKey);

      if (local) {
        try {
          const parsed = preserveCompanyProfile(
            JSON.parse(local) as BusinessDataSet,
          );
          dataRef.current = parsed;
          queueMicrotask(() => {
            if (active) setData(parsed);
          });
        } catch {
          window.localStorage.removeItem(localKey);
        }
      }
    }

    repository
      .load(user.uid)
      .then((cloud) => {
        if (!active) return;
        // Never let a startup read overwrite an edit/delete made while it was
        // still in flight.
        if (mutationRevisionRef.current !== loadMutationRevision) return;

        if (cloud) {
          const restored = preserveCompanyProfile(cloud);
          dataRef.current = restored;
          setData(restored);

          if (isBrowser()) {
            window.localStorage.setItem(localKey, JSON.stringify(restored));
          }
        } else {
          // A missing Firebase dataset is an intentional empty state. Do not
          // republish a cached snapshot and recreate manually deleted data.
          dataRef.current = initialData;
          setData(initialData);
          setSyncState("synced");
          setLastError("");
          if (isBrowser()) {
            window.localStorage.removeItem(localKey);
            window.localStorage.removeItem(pendingKey);
            window.localStorage.removeItem("3star-business-data");
            window.localStorage.removeItem("3star-pending-sync");
          }
        }
      })
      .catch((error) => {
        if (!active) return;

        setLastError(
          error instanceof Error
            ? error.message
            : "Cloud data could not be loaded.",
        );
        setSyncState(isBrowser() && navigator.onLine ? "error" : "offline");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [repository, user]);

  useEffect(() => {
    const retryPendingSync = () => {
      if (!isBrowser() || loading) return;

      const pending = window.localStorage.getItem(pendingKey);
      if (!pending) return;

      try {
        const parsed = JSON.parse(pending) as {
          data: BusinessDataSet;
          source: string;
        };

        void sync(parsed.data, parsed.source).catch(() => undefined);
      } catch {
        window.localStorage.removeItem(pendingKey);
      }
    };

    window.addEventListener("online", retryPendingSync);

    return () => window.removeEventListener("online", retryPendingSync);
  }, [loading, sync]);

  const importFile = useCallback(
    async (file: File) => {
      const parsed = await parseBusinessWorkbook(file, dataRef.current);

      // Import applies to the latest snapshot so edits made while a large file
      // is being parsed are not overwritten by the older render snapshot.
      commitMutation(file.name, (current) => {
        const projects = parsed.projects.length
          ? parsed.projects
          : current.projects;
        const quotations = parsed.quotations.length
          ? parsed.quotations
          : current.quotations;
        const linkedProjects = [...projects];
        const linkedQuotations = quotations.map((quotation) => {
          const serialized = prepareRecordForSave("quotations", {
            ...quotation,
            serialNumber: ensureQuotationSerial(
              quotation.id,
              quotation.serialNumber,
            ),
          });
          if (serialized.linkedProjectId) return serialized;

          const hasProject = linkedProjects.some(
            (project) => project.quotationNo === serialized.id,
          );
          if (hasProject) return serialized;

          const project = buildProjectFromQuotation(
            serialized,
            linkedProjects.map((item) => item.id),
          );
          linkedProjects.unshift(project);
          return { ...serialized, linkedProjectId: project.id };
        });

        return {
          company: parsed.company,
          clients: parsed.clients.length ? parsed.clients : current.clients,
          projects: linkedProjects,
          quotations: linkedQuotations,
          invoices: parsed.invoices.length ? parsed.invoices : current.invoices,
          trash: current.trash || [],
        };
      });

      return parsed;
    },
    [commitMutation],
  );

  const createRecord = useCallback(
    async <TKey extends CollectionKey>(key: TKey, record: EntityMap[TKey]) => {
      const prepared = prepareRecordForSave(key, record);
      commitMutation(`${key}-create`, (current) => {
        assertUniqueRecordId(current, key, prepared.id);
        return {
          ...current,
          [key]: [prepared, ...current[key]],
        } as BusinessDataSet;
      });
    },
    [commitMutation],
  );

  const updateRecord = useCallback(
    async <TKey extends CollectionKey>(key: TKey, record: EntityMap[TKey]) => {
      const prepared = prepareRecordForSave(key, record);
      commitMutation(`${key}-update`, (current) => {
        const exists = current[key].some((item) =>
          recordIdsEqual(key, item.id, prepared.id),
        );
        if (!exists) throw new Error("Record not found.");
        assertUniqueRecordId(current, key, prepared.id, prepared.id);

        return {
          ...current,
          [key]: current[key].map((item) =>
            recordIdsEqual(key, item.id, prepared.id) ? prepared : item,
          ),
        } as BusinessDataSet;
      });
    },
    [commitMutation],
  );

  const patchRecord = useCallback(
    async <TKey extends CollectionKey>(
      key: TKey,
      id: string,
      patch: Partial<EntityMap[TKey]>,
    ) => {
      if (!id.trim()) {
        throw new Error("Record id is required.");
      }
      if ("id" in patch && patch.id && !recordIdsEqual(key, id, String(patch.id))) {
        throw new Error("Record IDs cannot be changed by a patch operation.");
      }

      commitMutation(`${key}-patch`, (current) => {
        const existing = current[key].find((item) =>
          recordIdsEqual(key, item.id, id),
        );
        if (!existing) throw new Error("Record not found.");
        const prepared = prepareRecordForSave(key, {
          ...existing,
          ...patch,
          id: existing.id,
        } as EntityMap[TKey]);

        return {
          ...current,
          [key]: current[key].map((item) =>
            recordIdsEqual(key, item.id, id) ? prepared : item,
          ),
        } as BusinessDataSet;
      });
    },
    [commitMutation],
  );

  const deleteRecord = useCallback(
    async <TKey extends CollectionKey>(key: TKey, id: string) => {
      if (!id.trim()) {
        throw new Error("Record id is required.");
      }
      commitMutation(`${key}-delete`, (current) => {
        const record = current[key].find((item) =>
          recordIdsEqual(key, item.id, id),
        );
        if (!record) throw new Error("Record not found.");

        const deletedAt = new Date();
        const trashItem = {
          id: crypto.randomUUID(),
          collection: key,
          recordId: record.id,
          label: getRecordLabel(key, record),
          companyName: getRecordCompany(key, record),
          deletedAt: deletedAt.toISOString(),
          deleteAfter: addDaysIso(deletedAt, trashRetentionDays),
          record,
        } as TrashItem;

        return {
          ...current,
          [key]: current[key].filter(
            (item) => !recordIdsEqual(key, item.id, id),
          ),
          trash: [trashItem, ...(current.trash || [])],
        } as BusinessDataSet;
      });
    },
    [commitMutation],
  );

  const restoreTrashItem = useCallback(
    async (trashId: string) => {
      commitMutation("trash-restore", (current) => {
        const trash = current.trash || [];
        const item = trash.find((entry) => entry.id === trashId);
        if (!item) throw new Error("Trash item not found.");

        const prepared = prepareRecordForSave(
          item.collection,
          item.record as EntityMap[typeof item.collection],
        );
        assertUniqueRecordId(current, item.collection, prepared.id);

        return {
          ...current,
          [item.collection]: [prepared, ...current[item.collection]],
          trash: trash.filter((entry) => entry.id !== trashId),
        } as BusinessDataSet;
      });
    },
    [commitMutation],
  );

  const permanentlyDeleteTrashItem = useCallback(
    async (trashId: string) => {
      let removed: TrashItem | undefined;
      commitMutation("trash-delete", (current) => {
        const trash = current.trash || [];
        removed = trash.find((entry) => entry.id === trashId);
        if (!removed) throw new Error("Trash item not found.");
        return {
          ...current,
          trash: trash.filter((entry) => entry.id !== trashId),
        };
      });

      if (removed?.collection === "quotations" && user) {
        await repository.releaseQuotationId(user.uid, removed.recordId);
      }
    },
    [commitMutation, repository, user],
  );

  const emptyTrash = useCallback(async () => {
    const quotationIds = (dataRef.current.trash || [])
      .filter((item) => item.collection === "quotations")
      .map((item) => item.recordId);

    commitMutation("trash-empty", (current) => ({ ...current, trash: [] }));

    if (user) {
      await Promise.all(
        quotationIds.map((id) => repository.releaseQuotationId(user.uid, id)),
      );
    }
  }, [commitMutation, repository, user]);

  const createProject = useCallback(
    async (project: EntityMap["projects"]) => {
      await createRecord("projects", project);
    },
    [createRecord],
  );

  const updateProject = useCallback(
    async (project: EntityMap["projects"]) => {
      await updateRecord("projects", project);
    },
    [updateRecord],
  );

  const createQuotation = useCallback(
    async (quotation: EntityMap["quotations"]) => {
      const prepared = prepareRecordForSave("quotations", {
        ...quotation,
        serialNumber: quotation.serialNumber || createQuotationSerial(),
      });
      const existingIds = dataRef.current.quotations.map((item) => item.id);
      assertUniqueRecordId(dataRef.current, "quotations", prepared.id);

      if (user) {
        try {
          await repository.reserveQuotationId(user.uid, prepared.id);
        } catch {
          await repository.pruneStaleQuotationReservations(
            user.uid,
            existingIds,
          );
          await repository.reserveQuotationId(user.uid, prepared.id);
        }
      }

      try {
        commitMutation("quotations-create", (current) => {
          assertUniqueRecordId(current, "quotations", prepared.id);
          const project = prepareRecordForSave(
            "projects",
            buildProjectFromQuotation(
              prepared,
              current.projects.map((item) => item.id),
            ),
          );
          assertUniqueRecordId(current, "projects", project.id);
          const linkedQuotation: EntityMap["quotations"] = {
            ...prepared,
            linkedProjectId: project.id,
          };
          const normalizedClientName = prepared.companyName.toLocaleLowerCase();
          const shouldCreateClient = !current.clients.some(
            (client) =>
              client.companyName.trim().toLocaleLowerCase() ===
              normalizedClientName,
          );
          const autoClient = shouldCreateClient
            ? prepareRecordForSave("clients", {
                id: crypto.randomUUID(),
                companyName: prepared.companyName,
                brandName: "",
                contactPerson: "",
                mobile: "",
                email: "",
                address: prepared.customerAddress || "",
                city: prepared.customerCity || "",
                country: prepared.customerCountry || "",
                vatNumber: prepared.customerVatNumber || "",
                crNumber: prepared.customerCrNumber || "",
                storeName: prepared.store || "",
                storeLocation: prepared.storeLocation || "",
                contractStatus: "active",
              })
            : null;

          return {
            ...current,
            clients: autoClient ? [autoClient, ...current.clients] : current.clients,
            quotations: [linkedQuotation, ...current.quotations],
            projects: [project, ...current.projects],
          };
        });
      } catch (error) {
        if (user) {
          await repository.releaseQuotationId(user.uid, prepared.id).catch(() => undefined);
        }
        throw error;
      }
    },
    [commitMutation, repository, user],
  );

  const createInvoiceFromQuotation = useCallback(
    async (quotationId: string, draft: Partial<EntityMap["invoices"]>) => {
      commitMutation("invoices-create-from-quotation", (current) => {
        const quotation = current.quotations.find((item) =>
          recordIdsEqual("quotations", item.id, quotationId),
        );
        if (!quotation) throw new Error("Quotation not found.");
        if (
          current.invoices.some(
            (invoice) =>
              invoice.quotationSerialNumber === quotation.serialNumber ||
              (!invoice.quotationSerialNumber &&
                invoice.quotationNo === quotation.id),
          )
        ) {
          throw new Error(
            "This quotation already has an invoice. Open its invoice page to view or edit it.",
          );
        }

        const invoice: EntityMap["invoices"] = {
        id:
          draft.id?.trim() ||
          createNextInvoiceId(current.invoices.map((item) => item.id)),
        companyName: quotation.companyName,
        project: quotation.store || quotation.companyName,
        quotationNo: quotation.id,
        quotationSerialNumber: quotation.serialNumber,
        invoiceDate: draft.invoiceDate || today(),
        amount: draft.amount ?? quotation.amount,
        customerAddress: quotation.customerAddress || "",
        customerVatNumber: quotation.customerVatNumber || "",
        supplierName: current.company.businessName,
        supplierLegalName: current.company.legalCompanyName,
        supplierAddress: `${current.company.city}, ${current.company.country}`,
        supplierCrNumber: current.company.crNumber,
        supplierVatNumber: current.company.vatNumber,
        supplierEmail: normalizeCompanyEmail(current.company.email),
        currency: quotation.currency || current.company.currency,
        subTotal: quotation.subTotal,
        vatRate: quotation.vatRate ?? current.company.vatRate,
        vatAmount: quotation.vatAmount,
        lineItems: quotation.lineItems?.map((item, index) => ({
          id: String(index + 1),
          description: item.description,
          quantity: item.quantity,
          unitCode: "",
          unitPrice: item.unitPrice,
          amount: item.amount,
          vatRate: item.vatRate,
          vatAmount: item.vatAmount,
        })),
        received: 0,
        paymentMode: draft.paymentMode || "",
        status: "pending",
        remarks: draft.remarks || "",
        };
        const prepared = prepareRecordForSave("invoices", invoice);
        assertUniqueRecordId(current, "invoices", prepared.id);
        return { ...current, invoices: [prepared, ...current.invoices] };
      });
    },
    [commitMutation],
  );

  const completeInvoicePayment = useCallback(
    async (id: string) => {
      commitMutation("invoices-complete-payment", (current) => {
        const invoice = current.invoices.find((item) =>
          recordIdsEqual("invoices", item.id, id),
        );
        if (!invoice) throw new Error("Invoice not found.");

        const paymentDate = today();
        const updatedInvoice = prepareRecordForSave("invoices", {
          ...invoice,
          received: invoice.amount,
          status: "paid",
          paymentDate,
        });
        const linkedProject = current.projects.find((project) => {
          if (invoice.quotationNo) {
            return project.quotationNo === invoice.quotationNo;
          }
          return project.company === invoice.companyName;
        });

        return {
          ...current,
          invoices: current.invoices.map((item) =>
            recordIdsEqual("invoices", item.id, id) ? updatedInvoice : item,
          ),
          projects: linkedProject
            ? current.projects.map((project) =>
                project.id === linkedProject.id
                  ? prepareRecordForSave("projects", {
                      ...project,
                      status: "completed",
                      completion: 100,
                      actualCompletion: paymentDate,
                    })
                  : project,
              )
            : current.projects,
        };
      });
    },
    [commitMutation],
  );

  const updateProjectStatus = useCallback(
    async (
      id: string,
      status: EntityMap["projects"] extends { status: infer TStatus }
        ? TStatus
        : string,
    ) => {
      await patchRecord("projects", id, { status } as Partial<
        EntityMap["projects"]
      >);
    },
    [patchRecord],
  );

  const updateQuotationStatus = useCallback(
    async (
      id: string,
      status: EntityMap["quotations"] extends { status: infer TStatus }
        ? TStatus
        : string,
    ) => {
      await patchRecord("quotations", id, {
        status,
      } as Partial<EntityMap["quotations"]>);
    },
    [patchRecord],
  );

  const updateInvoiceStatus = useCallback(
    async (
      id: string,
      status: EntityMap["invoices"] extends { status: infer TStatus }
        ? TStatus
        : string,
    ) => {
      await patchRecord("invoices", id, {
        status,
      } as Partial<EntityMap["invoices"]>);
    },
    [patchRecord],
  );

  const updateInvoicePayment = useCallback(
    async (id: string, patch: Partial<EntityMap["invoices"]>) => {
      await patchRecord("invoices", id, patch);
    },
    [patchRecord],
  );

  const forceSync = useCallback(async () => {
    await sync(dataRef.current, "manual-force-sync");
  }, [sync]);

  const value = useMemo<BusinessDataContextValue>(
    () => ({
      data,
      loading,
      syncState,
      lastError,
      trash: data.trash || [],

      importFile,

      createRecord,
      updateRecord,
      deleteRecord,
      restoreTrashItem,
      permanentlyDeleteTrashItem,
      emptyTrash,
      patchRecord,

      createProject,
      updateProject,

      createQuotation,
      createInvoiceFromQuotation,
      completeInvoicePayment,

      updateProjectStatus,
      updateQuotationStatus,
      updateInvoiceStatus,
      updateInvoicePayment,

      forceSync,
    }),
    [
      completeInvoicePayment,
      createInvoiceFromQuotation,
      createProject,
      emptyTrash,
      createQuotation,
      createRecord,
      data,
      deleteRecord,
      forceSync,
      importFile,
      lastError,
      loading,
      patchRecord,
      permanentlyDeleteTrashItem,
      restoreTrashItem,
      syncState,
      updateInvoicePayment,
      updateInvoiceStatus,
      updateProject,
      updateProjectStatus,
      updateQuotationStatus,
      updateRecord,
    ],
  );

  return (
    <BusinessDataContext.Provider value={value}>
      {children}
    </BusinessDataContext.Provider>
  );
}

export function useBusinessData() {
  const value = useContext(BusinessDataContext);

  if (!value) {
    throw new Error(
      "useBusinessData must be used inside BusinessDataProvider.",
    );
  }

  return value;
}
