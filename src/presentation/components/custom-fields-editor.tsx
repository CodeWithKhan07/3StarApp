"use client";

import type { CustomField } from "@/domain/entities/business";
import { Plus, Trash2 } from "lucide-react";

export function CustomFieldsEditor({
  fields,
  onChange,
  documentName,
}: {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
  documentName: "quotation" | "invoice";
}) {
  return (
    <section className="quotation-custom-fields">
      <div className="quotation-items-toolbar">
        <div>
          <strong>Additional Fields</strong>
          <span>These appear in the {documentName} details on the PDF</span>
        </div>
        <button
          className="icon-button"
          type="button"
          title={`Add ${documentName} field`}
          aria-label={`Add ${documentName} field`}
          onClick={() =>
            onChange([
              ...fields,
              { id: crypto.randomUUID(), label: "", value: "" },
            ])
          }
        >
          <Plus size={16} />
        </button>
      </div>

      {fields.map((field) => (
        <div className="custom-field-row" key={field.id}>
          <label className="field">
            <span>Field name</span>
            <input
              value={field.label}
              onChange={(event) =>
                onChange(
                  fields.map((item) =>
                    item.id === field.id
                      ? { ...item, label: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </label>
          <label className="field">
            <span>Value</span>
            <input
              value={field.value}
              onChange={(event) =>
                onChange(
                  fields.map((item) =>
                    item.id === field.id
                      ? { ...item, value: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </label>
          <button
            className="icon-button icon-button--danger"
            type="button"
            title={`Remove ${field.label || "field"}`}
            aria-label={`Remove ${field.label || "field"}`}
            onClick={() =>
              onChange(fields.filter((item) => item.id !== field.id))
            }
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </section>
  );
}
