"use client";

import {
  parseBusinessWorkbook,
  type ImportResult,
} from "@/application/services/excel-import";
import workbook from "@/data/workbook-data.json";
import type { BusinessDataSet, TrashItem } from "@/domain/entities/business";
import { FirebaseBusinessDataRepository } from "@/infrastructure/firebase/business-data-repository";
import { useAuth } from "@/presentation/providers/auth-provider";
import {
  createNextInvoiceId,
  createQuotationSerial,
  ensureQuotationSerial,
  normalizeInvoiceId,
  normalizeQuotationId,
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

type CollectionKey = "clients" | "projects" | "quotations" | "invoices";

type EntityMap = {
  clients: BusinessDataSet["clients"][number];
  projects: BusinessDataSet["projects"][number];
  quotations: BusinessDataSet["quotations"][number];
  invoices: BusinessDataSet["invoices"][number];
};

type EntityWithId = {
  id: string;
};

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
    })),
    invoices: next.invoices.map((invoice) => ({
      ...invoice,
      supplierEmail: normalizeCompanyEmail(invoice.supplierEmail),
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

const isEntityWithId = (value: unknown): value is EntityWithId => {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as EntityWithId).id === "string"
  );
};

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
  existingProjectCount: number,
): EntityMap["projects"] {
  return {
    id: `PROJ-${String(existingProjectCount + 1).padStart(5, "0")}`,
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
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>("synced");
  const [lastError, setLastError] = useState("");
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const syncRevisionRef = useRef(0);
  const mutationRevisionRef = useRef(0);
  const localPersistRevisionRef = useRef(0);
  const pendingPersistRevisionRef = useRef(0);

  const persistLocal = useCallback((next: BusinessDataSet) => {
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

  useEffect(() => {
    if (!data.trash?.length) return;

    const purgeExpired = () => {
      const now = Date.now();
      const activeTrash = (data.trash || []).filter((item) => {
        const expires = new Date(item.deleteAfter).valueOf();
        return Number.isNaN(expires) || expires > now;
      });

      if (activeTrash.length === data.trash?.length) return;

      saveInstant(
        {
          ...data,
          trash: activeTrash,
        },
        "trash-auto-cleanup",
      );
    };

    purgeExpired();
    const timer = window.setInterval(purgeExpired, 60 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [data, saveInstant]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let active = true;
    const loadMutationRevision = mutationRevisionRef.current;

    setLoading(true);

    if (isBrowser()) {
      const local = window.localStorage.getItem(localKey);

      if (local) {
        try {
          const parsed = preserveCompanyProfile(
            JSON.parse(local) as BusinessDataSet,
          );
          setData(parsed);
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
          setData(restored);

          if (isBrowser()) {
            window.localStorage.setItem(localKey, JSON.stringify(restored));
          }
        } else {
          // A missing Firebase dataset is an intentional empty state. Do not
          // republish a cached snapshot and recreate manually deleted data.
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
      const parsed = await parseBusinessWorkbook(file, data);

      const projects = parsed.projects.length ? parsed.projects : data.projects;
      const quotations = parsed.quotations.length
        ? parsed.quotations
        : data.quotations;

      const linkedProjects = [...projects];
      const linkedQuotations = quotations.map((quotation) => {
        const serialized = {
          ...quotation,
          serialNumber: ensureQuotationSerial(
            quotation.id,
            quotation.serialNumber,
          ),
        };
        if (serialized.linkedProjectId) return serialized;

        const hasProject = linkedProjects.some(
          (project) => project.quotationNo === serialized.id,
        );
        if (hasProject) return serialized;

        const project = buildProjectFromQuotation(
          serialized,
          linkedProjects.length,
        );
        linkedProjects.unshift(project);

        return { ...serialized, linkedProjectId: project.id };
      });

      const next: BusinessDataSet = {
        company: parsed.company,
        clients: parsed.clients.length ? parsed.clients : data.clients,
        projects: linkedProjects,
        quotations: linkedQuotations,
        invoices: parsed.invoices.length ? parsed.invoices : data.invoices,
      };

      saveInstant(next, file.name);

      return parsed;
    },
    [data, saveInstant],
  );

  const createRecord = useCallback(
    async <TKey extends CollectionKey>(key: TKey, record: EntityMap[TKey]) => {
      if (key === "invoices" && isEntityWithId(record)) {
        const requestedId = normalizeInvoiceId(record.id || "");
        const existingIds = data.invoices.map((item) =>
          normalizeInvoiceId(item.id),
        );

        if (!requestedId) {
          throw new Error("Invoice number is required.");
        }

        if (existingIds.includes(requestedId)) {
          throw new Error(`Invoice number ${requestedId} is already used.`);
        }

        record = { ...record, id: requestedId } as EntityMap[TKey];
      }

      const next: BusinessDataSet = {
        ...data,
        [key]: [record, ...data[key]],
      };

      saveInstant(next, `${key}-create`);
    },
    [data, saveInstant],
  );

  const updateRecord = useCallback(
    async <TKey extends CollectionKey>(key: TKey, record: EntityMap[TKey]) => {
      if (!isEntityWithId(record)) {
        throw new Error("Record must contain a valid id.");
      }

      const next: BusinessDataSet = {
        ...data,
        [key]: data[key].map((item) => {
          if (!isEntityWithId(item)) return item;
          return item.id === record.id ? record : item;
        }),
      };

      saveInstant(next, `${key}-update`);
    },
    [data, saveInstant],
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

      const next: BusinessDataSet = {
        ...data,
        [key]: data[key].map((item) => {
          if (!isEntityWithId(item)) return item;
          return item.id === id ? { ...item, ...patch } : item;
        }),
      };

      saveInstant(next, `${key}-patch`);
    },
    [data, saveInstant],
  );

  const deleteRecord = useCallback(
    async <TKey extends CollectionKey>(key: TKey, id: string) => {
      if (!id.trim()) {
        throw new Error("Record id is required.");
      }

      const record = data[key].find((item) => {
        if (!isEntityWithId(item)) return false;
        return item.id === id;
      });

      if (!record) {
        throw new Error("Record not found.");
      }

      const deletedAt = new Date();
      const trashItem: TrashItem = {
        id: crypto.randomUUID(),
        collection: key,
        recordId: id,
        label: getRecordLabel(key, record),
        companyName: getRecordCompany(key, record),
        deletedAt: deletedAt.toISOString(),
        deleteAfter: addDaysIso(deletedAt, trashRetentionDays),
        record,
      };

      const next: BusinessDataSet = {
        ...data,
        [key]: data[key].filter((item) => {
          if (!isEntityWithId(item)) return true;
          return item.id !== id;
        }),
        trash: [trashItem, ...(data.trash || [])],
      };

      saveInstant(next, `${key}-delete`);

    },
    [data, saveInstant],
  );

  const restoreTrashItem = useCallback(
    async (trashId: string) => {
      const trash = data.trash || [];
      const item = trash.find((entry) => entry.id === trashId);

      if (!item) {
        throw new Error("Trash item not found.");
      }

      if (
        data[item.collection].some((record) => {
          if (!isEntityWithId(record)) return false;
          return record.id === item.recordId;
        })
      ) {
        throw new Error(
          `Cannot restore ${item.label} because another ${item.collection.slice(0, -1)} has the same id.`,
        );
      }

      const next: BusinessDataSet = {
        ...data,
        [item.collection]: [item.record, ...data[item.collection]],
        trash: trash.filter((entry) => entry.id !== trashId),
      };

      saveInstant(next, `${item.collection}-restore`);
    },
    [data, saveInstant],
  );

  const permanentlyDeleteTrashItem = useCallback(
    async (trashId: string) => {
      const trash = data.trash || [];
      const item = trash.find((entry) => entry.id === trashId);
      const next: BusinessDataSet = {
        ...data,
        trash: trash.filter((entry) => entry.id !== trashId),
      };

      saveInstant(next, "trash-delete");

      if (item?.collection === "quotations" && user) {
        await repository.releaseQuotationId(user.uid, item.recordId);
      }
    },
    [data, repository, saveInstant, user],
  );

  const emptyTrash = useCallback(async () => {
    const quotationIds = (data.trash || [])
      .filter((item) => item.collection === "quotations")
      .map((item) => item.recordId);

    const next: BusinessDataSet = {
      ...data,
      trash: [],
    };

    saveInstant(next, "trash-empty");

    if (user) {
      await Promise.all(
        quotationIds.map((id) => repository.releaseQuotationId(user.uid, id)),
      );
    }
  }, [data, repository, saveInstant, user]);

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
      const existingIds = data.quotations.map((item) => item.id);
      const requestedId = normalizeQuotationId(quotation.id || "");
      const normalizedExisting = new Set(
        existingIds.map((id) => normalizeQuotationId(id)),
      );

      if (!requestedId) {
        throw new Error("Quotation number is required.");
      }

      if (normalizedExisting.has(requestedId)) {
        throw new Error(`Quotation number ${requestedId} is already used.`);
      }

      if (user) {
        try {
          await repository.reserveQuotationId(user.uid, requestedId);
        } catch {
          await repository.pruneStaleQuotationReservations(
            user.uid,
            existingIds,
          );
          await repository.reserveQuotationId(user.uid, requestedId);
        }
      }

      const serialized = {
        ...quotation,
        id: requestedId,
        serialNumber: quotation.serialNumber || createQuotationSerial(),
      };
      const project = buildProjectFromQuotation(
        serialized,
        data.projects.length,
      );
      const linkedQuotation: EntityMap["quotations"] = {
        ...serialized,
        linkedProjectId: project.id,
      };
      const normalizedClientName = quotation.companyName.trim().toLowerCase();
      const shouldCreateClient =
        Boolean(normalizedClientName) &&
        !data.clients.some(
          (client) => client.companyName.trim().toLowerCase() === normalizedClientName,
        );
      const autoClient: EntityMap["clients"] | null = shouldCreateClient
        ? {
            id: crypto.randomUUID(),
            companyName: quotation.companyName.trim(),
            brandName: "",
            contactPerson: "",
            mobile: "",
            email: "",
            address: quotation.customerAddress || "",
            city: quotation.customerCity || "",
            country: quotation.customerCountry || "",
            vatNumber: quotation.customerVatNumber || "",
            crNumber: quotation.customerCrNumber || "",
            storeName: quotation.store || "",
            storeLocation: quotation.storeLocation || "",
            contractStatus: "active",
          }
        : null;

      const next: BusinessDataSet = {
        ...data,
        clients: autoClient ? [autoClient, ...data.clients] : data.clients,
        quotations: [linkedQuotation, ...data.quotations],
        projects: [project, ...data.projects],
      };

      saveInstant(next, "quotations-create");
    },
    [data, repository, saveInstant, user],
  );

  const createInvoiceFromQuotation = useCallback(
    async (quotationId: string, draft: Partial<EntityMap["invoices"]>) => {
      const quotation = data.quotations.find((item) => item.id === quotationId);

      if (!quotation) {
        throw new Error("Quotation not found.");
      }
      if (
        data.invoices.some(
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

      const invoiceId = normalizeInvoiceId(
        draft.id?.trim() ||
          createNextInvoiceId(data.invoices.map((item) => item.id)),
      );

      if (
        data.invoices.some(
          (invoice) => normalizeInvoiceId(invoice.id) === invoiceId,
        )
      ) {
        throw new Error(`Invoice number ${invoiceId} is already used.`);
      }

      const invoice: EntityMap["invoices"] = {
        id: invoiceId,
        companyName: quotation.companyName,
        project: quotation.store || quotation.companyName,
        quotationNo: quotation.id,
        quotationSerialNumber: quotation.serialNumber,
        invoiceDate: draft.invoiceDate || today(),
        amount: draft.amount ?? quotation.amount,
        customerAddress: quotation.customerAddress || "",
        customerVatNumber: quotation.customerVatNumber || "",
        supplierName: data.company.businessName,
        supplierLegalName: data.company.legalCompanyName,
        supplierAddress: `${data.company.city}, ${data.company.country}`,
        supplierCrNumber: data.company.crNumber,
        supplierVatNumber: data.company.vatNumber,
        supplierEmail: normalizeCompanyEmail(data.company.email),
        currency: quotation.currency || data.company.currency,
        subTotal: quotation.subTotal,
        vatRate: quotation.vatRate ?? data.company.vatRate,
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

      const next: BusinessDataSet = {
        ...data,
        invoices: [invoice, ...data.invoices],
      };

      saveInstant(next, "invoices-create-from-quotation");
    },
    [data, saveInstant],
  );

  const completeInvoicePayment = useCallback(
    async (id: string) => {
      const invoice = data.invoices.find((item) => item.id === id);

      if (!invoice) {
        throw new Error("Invoice not found.");
      }

      const paymentDate = today();

      const updatedInvoice: EntityMap["invoices"] = {
        ...invoice,
        received: invoice.amount,
        status: "paid",
        paymentDate,
      };

      const linkedProject = data.projects.find((project) => {
        if (invoice.quotationNo)
          return project.quotationNo === invoice.quotationNo;
        return project.company === invoice.companyName;
      });

      const next: BusinessDataSet = {
        ...data,
        invoices: data.invoices.map((item) =>
          item.id === id ? updatedInvoice : item,
        ),
        projects: linkedProject
          ? data.projects.map((project) =>
              project.id === linkedProject.id
                ? {
                    ...project,
                    status: "completed",
                    completion: 100,
                    actualCompletion: paymentDate,
                  }
                : project,
            )
          : data.projects,
      };

      saveInstant(next, "invoices-complete-payment");
    },
    [data, saveInstant],
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
    await sync(data, "manual-force-sync");
  }, [data, sync]);

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
