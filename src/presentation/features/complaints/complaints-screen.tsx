"use client";

import type { Complaint } from "@/domain/entities/business";
import { PageHeader, StatusBadge } from "@/presentation/components/ui";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import {
  FilePlus2,
  ImageUp,
  LoaderCircle,
  Pencil,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

type ExtractedComplaint = Omit<
  Complaint,
  "status" | "sourceImageName" | "createdAt" | "updatedAt"
>;

type ComplaintEditorState = {
  mode: "create" | "edit";
  originalId?: string;
  complaint: Complaint;
};

const statusOptions: Array<{ label: string; value: Complaint["status"] }> = [
  { label: "Pending", value: "pending" },
  { label: "In Progress", value: "in-progress" },
  { label: "Complete", value: "complete" },
];

function emptyComplaint(): Complaint {
  return {
    id: "",
    business: "",
    stationName: "",
    area: "",
    city: "",
    description: "",
    complaintType: "",
    loggedBy: "",
    contactPerson: "",
    status: "pending",
    createdAt: "",
    updatedAt: "",
  };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("The selected image could not be read."));
    reader.readAsDataURL(file);
  });
}

export function ComplaintsScreen() {
  const {
    data,
    createRecord,
    updateRecord,
    importComplaints,
    patchRecord,
    deleteRecord,
    syncState,
  } = useBusinessData();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [area, setArea] = useState("all");
  const [complaintType, setComplaintType] = useState("all");
  const [sortBy, setSortBy] = useState("recently-modified");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [error, setError] = useState("");
  const [sourceImageName, setSourceImageName] = useState("");
  const [preview, setPreview] = useState<ExtractedComplaint[]>([]);
  const [editor, setEditor] = useState<ComplaintEditorState | null>(null);

  const areas = useMemo(
    () =>
      Array.from(new Set(data.complaints.map((item) => item.area))).sort(),
    [data.complaints],
  );
  const complaintTypes = useMemo(
    () =>
      Array.from(
        new Set(data.complaints.map((item) => item.complaintType)),
      ).sort(),
    [data.complaints],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data.complaints
      .filter((item) => {
        const searchable = [
          item.id,
          item.business,
          item.stationName,
          item.area,
          item.city,
          item.description,
          item.complaintType,
          item.loggedBy,
          item.contactPerson,
        ]
          .join(" ")
          .toLowerCase();
        return (
          (!normalizedQuery || searchable.includes(normalizedQuery)) &&
          (status === "all" || item.status === status) &&
          (area === "all" || item.area === area) &&
          (complaintType === "all" || item.complaintType === complaintType)
        );
      })
      .sort((left, right) => {
        if (sortBy === "station") {
          return left.stationName.localeCompare(right.stationName, undefined, {
            numeric: true,
          });
        }
        if (sortBy === "oldest") {
          return left.updatedAt.localeCompare(right.updatedAt);
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      });
  }, [area, complaintType, data.complaints, query, sortBy, status]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Complaint[]>();
    for (const complaint of filtered) {
      const key = `${complaint.area || "Unknown"} / ${complaint.city || "Unknown"}`;
      groups.set(key, [...(groups.get(key) || []), complaint]);
    }
    return Array.from(groups.entries()).sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [filtered]);

  async function extractImage(file?: File) {
    if (!file || extracting) return;
    setExtracting(true);
    setError("");
    setPreview([]);
    try {
      const imageDataUrl = await fileToDataUrl(file);
      let rows: ExtractedComplaint[];

      if (window.desktop?.extractComplaintsFromImage) {
        rows = await window.desktop.extractComplaintsFromImage(imageDataUrl);
      } else {
        const response = await fetch("/api/complaints/extract/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          complaints?: ExtractedComplaint[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(result.error || "Complaint extraction failed.");
        }
        rows = result.complaints || [];
      }

      if (!rows.length) throw new Error("No complaint rows were found in the image.");
      setSourceImageName(file.name);
      setPreview(rows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Complaint extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  async function saveImport() {
    if (!preview.length || saving) return;
    setSaving(true);
    setError("");
    const now = new Date().toISOString();
    try {
      await importComplaints(
        preview.map((item) => ({
          ...item,
          id: item.id.trim() || crypto.randomUUID(),
          status: "pending",
          sourceImageName,
          createdAt: now,
          updatedAt: now,
        })),
      );
      setPreview([]);
      setSourceImageName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Complaints could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function updateEditor<TKey extends keyof Complaint>(
    key: TKey,
    value: Complaint[TKey],
  ) {
    setEditor((current) =>
      current
        ? { ...current, complaint: { ...current.complaint, [key]: value } }
        : current,
    );
  }

  async function saveComplaint() {
    if (!editor || editorSaving) return;
    setEditorSaving(true);
    setError("");
    const now = new Date().toISOString();

    try {
      if (editor.mode === "create") {
        await createRecord("complaints", {
          ...editor.complaint,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await updateRecord("complaints", {
          ...editor.complaint,
          id: editor.originalId || editor.complaint.id,
        });
      }
      setEditor(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Complaint could not be saved.",
      );
    } finally {
      setEditorSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Complaints"
        description={`AI-assisted complaint intake grouped by area and city. Cloud: ${syncState}.`}
        actions={
          <>
            <button
              className="button"
              type="button"
              onClick={() => {
                setError("");
                setEditor({ mode: "create", complaint: emptyComplaint() });
              }}
            >
              <FilePlus2 size={16} />
              Add complaint
            </button>
            <button
              className="button button--primary"
              type="button"
              disabled={extracting}
              onClick={() => fileInputRef.current?.click()}
            >
              {extracting ? <LoaderCircle className="spin" size={16} /> : <ImageUp size={16} />}
              {extracting ? "Reading image" : "Import image"}
            </button>
          </>
        }
      />

      <input
        ref={fileInputRef}
        className="file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void extractImage(file);
        }}
      />

      {error ? <div className="form-message form-message--error">{error}</div> : null}

      {preview.length ? (
        <section className="card complaint-import-review">
          <header className="card__header">
            <div>
              <h2>Review import</h2>
              <p>{preview.length} rows extracted from {sourceImageName}</p>
            </div>
            <div className="row-actions">
              <button
                className="icon-button"
                type="button"
                title="Cancel import"
                aria-label="Cancel complaint import"
                onClick={() => setPreview([])}
              >
                <X size={16} />
              </button>
              <button
                className="button button--primary"
                type="button"
                disabled={saving}
                onClick={() => void saveImport()}
              >
                {saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}
                Save complaints
              </button>
            </div>
          </header>
          <div className="table-wrap">
            <table className="data-table complaint-table">
              <thead><tr><th>Comp #</th><th>Station</th><th>Area / City</th><th>Type</th><th>Description</th></tr></thead>
              <tbody>
                {preview.map((item, index) => (
                  <tr key={`${item.id}-${index}`}>
                    <td>{item.id}</td><td>{item.stationName}</td><td>{item.area}<br /><small>{item.city}</small></td><td>{item.complaintType}</td><td>{item.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="card table-toolbar complaint-toolbar">
        <label className="toolbar-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search complaint, station, person..." />
        </label>
        <select className="select" value={area} onChange={(event) => setArea(event.target.value)}>
          <option value="all">All areas</option>
          {areas.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select className="select" value={complaintType} onChange={(event) => setComplaintType(event.target.value)}>
          <option value="all">All complaint types</option>
          {complaintTypes.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select className="select" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="recently-modified">Recently modified</option>
          <option value="oldest">Oldest modified</option>
          <option value="station">Station name</option>
        </select>
      </section>

      <section className="complaint-groups">
        {grouped.map(([group, complaints]) => (
          <section className="complaint-group" key={group}>
            <header><h2>{group}</h2><span>{complaints.length}</span></header>
            <div className="table-wrap">
              <table className="data-table complaint-table">
                <thead><tr><th>Comp #</th><th>Business / Station</th><th>Complaint</th><th>Logged By</th><th>Contact</th><th>Status</th><th aria-label="Actions" /></tr></thead>
                <tbody>
                  {complaints.map((complaint) => (
                    <tr key={complaint.id}>
                      <td className="strong-cell">{complaint.id}</td>
                      <td>{complaint.business || "-"}<br /><strong>{complaint.stationName}</strong></td>
                      <td><StatusBadge value={complaint.complaintType} /><p>{complaint.description}</p></td>
                      <td>{complaint.loggedBy || "-"}</td>
                      <td>{complaint.contactPerson || "-"}</td>
                      <td>
                        <select
                          className={`inline-select complaint-status complaint-status--${complaint.status}`}
                          value={complaint.status}
                          aria-label={`Change status for complaint ${complaint.id}`}
                          onChange={(event) =>
                            void patchRecord("complaints", complaint.id, {
                              status: event.target.value as Complaint["status"],
                            })
                          }
                        >
                          {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            type="button"
                            title={`Edit complaint ${complaint.id}`}
                            aria-label={`Edit complaint ${complaint.id}`}
                            onClick={() => {
                              setError("");
                              setEditor({
                                mode: "edit",
                                originalId: complaint.id,
                                complaint: { ...complaint },
                              });
                            }}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-button icon-button--danger"
                            type="button"
                            title={`Delete complaint ${complaint.id}`}
                            aria-label={`Delete complaint ${complaint.id}`}
                            onClick={() => {
                              if (window.confirm(`Delete complaint ${complaint.id}?`)) {
                                void deleteRecord("complaints", complaint.id);
                              }
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        {!grouped.length ? (
          <div className="empty-state"><strong>No complaints found</strong><p>Add a complaint, import an image, or adjust the filters.</p></div>
        ) : null}
      </section>

      {editor ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !editorSaving) {
              setEditor(null);
            }
          }}
        >
          <form
            className="card modal-card modal-card--wide complaint-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="complaint-editor-title"
            onSubmit={(event) => {
              event.preventDefault();
              void saveComplaint();
            }}
          >
            <header className="modal-card__header">
              <div>
                <h2 id="complaint-editor-title">
                  {editor.mode === "create" ? "Add Complaint" : `Edit Complaint ${editor.originalId}`}
                </h2>
                <p>Record the complaint details, assignment contact, and current status.</p>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Close complaint editor"
                aria-label="Close complaint editor"
                disabled={editorSaving}
                onClick={() => setEditor(null)}
              >
                <X size={18} />
              </button>
            </header>

            <div className="form-grid">
              <label className="field">
                <span>Complaint Number *</span>
                <input
                  value={editor.complaint.id}
                  disabled={editor.mode === "edit"}
                  required
                  onChange={(event) => updateEditor("id", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Business</span>
                <input
                  value={editor.complaint.business}
                  onChange={(event) => updateEditor("business", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Station Name *</span>
                <input
                  value={editor.complaint.stationName}
                  required
                  onChange={(event) => updateEditor("stationName", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Complaint Type *</span>
                <input
                  value={editor.complaint.complaintType}
                  required
                  placeholder="CCTV, Electrical, Plumbing..."
                  onChange={(event) => updateEditor("complaintType", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Area *</span>
                <input
                  value={editor.complaint.area}
                  required
                  onChange={(event) => updateEditor("area", event.target.value)}
                />
              </label>
              <label className="field">
                <span>City *</span>
                <input
                  value={editor.complaint.city}
                  required
                  onChange={(event) => updateEditor("city", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Logged By</span>
                <input
                  value={editor.complaint.loggedBy}
                  onChange={(event) => updateEditor("loggedBy", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Contact Person</span>
                <input
                  value={editor.complaint.contactPerson}
                  onChange={(event) => updateEditor("contactPerson", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  value={editor.complaint.status}
                  onChange={(event) =>
                    updateEditor("status", event.target.value as Complaint["status"])
                  }
                >
                  {statusOptions.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="field field--full">
                <span>Description *</span>
                <textarea
                  rows={4}
                  value={editor.complaint.description}
                  required
                  onChange={(event) => updateEditor("description", event.target.value)}
                />
              </label>
            </div>

            <div className="form-actions">
              <button
                className="button"
                type="button"
                disabled={editorSaving}
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
              <button className="button button--primary" disabled={editorSaving}>
                {editorSaving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}
                {editorSaving ? "Saving" : editor.mode === "create" ? "Add complaint" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
