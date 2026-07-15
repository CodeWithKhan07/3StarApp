"use client";

import { PageHeader } from "@/presentation/components/ui";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { Building2, Calculator, Hash, ShieldCheck, Users } from "lucide-react";

export default function SettingsPage() {
  const { data } = useBusinessData();
  const { company } = data;
  return (
    <>
      <PageHeader
        title="Settings"
        description="Company details are loaded from the professional workbook."
        actions={
          <span className="status-badge status-badge--approved">
            Workbook imported
          </span>
        }
      />
      <div className="form-card card" style={{ maxWidth: "none" }}>
        <section className="form-section">
          <h2>
            <Building2 size={14} /> Company Profile
          </h2>
          <div className="form-grid">
            <div className="field">
              <label>Business Name</label>
              <input value={company.businessName} readOnly />
            </div>
            <div className="field">
              <label>Legal Company Name</label>
              <input value={company.legalCompanyName} readOnly dir="auto" />
            </div>
            <div className="field">
              <label>VAT Number</label>
              <input value={company.vatNumber} readOnly />
            </div>
            <div className="field">
              <label>CR Number</label>
              <input value={company.crNumber} readOnly />
            </div>
            <div className="field">
              <label>City</label>
              <input value={company.city} readOnly />
            </div>
            <div className="field">
              <label>Country</label>
              <input value={company.country} readOnly />
            </div>
            <div className="field">
              <label>Phone / WhatsApp</label>
              <input value={company.phone} readOnly />
            </div>
          </div>
        </section>
        <section className="form-section">
          <h2>
            <Hash size={14} /> Numbering
          </h2>
          <div className="form-grid">
            <div className="field">
              <label>Project Prefix</label>
              <input defaultValue="PRJ-" />
            </div>
            <div className="field">
              <label>Quotation Prefix</label>
              <input defaultValue="QT-" />
            </div>
            <div className="field">
              <label>Invoice Prefix</label>
              <input defaultValue="INV-" />
            </div>
            <div className="field">
              <label>Starting Number</label>
              <input type="number" defaultValue="1001" />
            </div>
          </div>
        </section>
        <section className="form-section">
          <h2>
            <Calculator size={14} /> VAT & Currency
          </h2>
          <div className="form-grid">
            <div className="field">
              <label>Default Currency</label>
              <input value={company.currency} readOnly />
            </div>
            <div className="field">
              <label>Default VAT Rate</label>
              <input value={company.vatRate} readOnly />
            </div>
          </div>
        </section>
        <section className="form-section">
          <h2>
            <Users size={14} /> User Management
          </h2>
          <p>
            Access is restricted to the configured Firebase administrator
            account.
          </p>
        </section>
        <section className="form-section">
          <h2>
            <ShieldCheck size={14} /> Security
          </h2>
          <p>
            Sessions and password resets are managed by Firebase Authentication.
          </p>
        </section>
      </div>
    </>
  );
}
