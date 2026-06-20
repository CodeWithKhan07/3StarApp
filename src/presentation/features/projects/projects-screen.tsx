"use client";

import type { BusinessDataSet } from "@/domain/entities/business";
import { routes } from "@/lib/routes";
import { EmptyTableRow, PageHeader, StatusBadge } from "@/presentation/components/ui";
import { money } from "@/presentation/data/sample-data";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { Edit3, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type Project = BusinessDataSet["projects"][number];
type ProjectStatus = Project["status"];
const statuses: Array<{label:string;value:ProjectStatus}>=[{label:"Upcoming",value:"upcoming"},{label:"In Progress",value:"in-progress"},{label:"On Hold",value:"on-hold"},{label:"Completed",value:"completed"},{label:"Cancelled",value:"cancelled"}];
const categories=["Automatic Door","Rolling Shutter","Glass Work","Aluminium Work","Maintenance","Installation","Other"];
const record=(value:unknown)=>typeof value==="object"&&value!==null?value as Record<string,unknown>:{};
const firstString=(value:Record<string,unknown>,keys:string[],fallback="")=>{for(const key of keys){const item=value[key];if(typeof item==="string"&&item.trim())return item;}return fallback;};
const firstNumber=(value:Record<string,unknown>,keys:string[])=>{for(const key of keys){const item=Number(value[key]);if(Number.isFinite(item))return item;}return 0;};
function normalize(project:Project){const value=record(project);return{raw:project,id:firstString(value,["id","projectId"]),company:firstString(value,["company","companyName","clientName"],"Unnamed Company"),store:firstString(value,["store","storeBranch","branch"]),location:firstString(value,["location","site"]),description:firstString(value,["workDescription","description","scope"]),category:firstString(value,["category"],"Other"),quotationNo:firstString(value,["quotationNo","quotationNumber"]),woNo:firstString(value,["woNo","workOrderNo"]),amount:firstNumber(value,["value","projectValue","amount"]),startDate:firstString(value,["startDate"]),expected:firstString(value,["expectedCompletion","expectedCompletionDate"]),status:firstString(value,["status"],"upcoming") as ProjectStatus,completion:firstNumber(value,["completion","completionPercentage"]),remarks:firstString(value,["remarks","notes"])};}

export function ProjectsScreen(){
  const {data,syncState,updateProjectStatus,deleteRecord}=useBusinessData();
  const [query,setQuery]=useState("");const [status,setStatus]=useState("all");const [category,setCategory]=useState("all");
  const projects=useMemo(()=>data.projects.map(normalize),[data.projects]);
  const availableCategories=useMemo(()=>Array.from(new Set(projects.map(item=>item.category).filter(Boolean))),[projects]);
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return projects.filter(item=>(!q||Object.values(item).filter(v=>typeof v==="string").join(" ").toLowerCase().includes(q))&&(status==="all"||item.status===status)&&(category==="all"||item.category===category));},[projects,query,status,category]);
  async function remove(item:ReturnType<typeof normalize>){if(window.confirm(`Delete project "${item.id}" for "${item.company}"?`))await deleteRecord("projects",item.id);}
  return <><PageHeader title="Projects" description={`Project register with full-page editing and quick status changes. Cloud: ${syncState}.`} actions={<Link className="button button--primary" href={routes.newProject}><Plus size={14}/>New Project</Link>}/>
    <section className="card table-toolbar"><label className="toolbar-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search project, company, location, quotation, WO..."/></label><select className="select" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All Status</option>{statuses.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select><select className="select" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All Categories</option>{[...availableCategories,...categories.filter(item=>!availableCategories.includes(item))].map(item=><option key={item}>{item}</option>)}</select></section>
    <section className="card"><div className="table-wrap"><table className="data-table" style={{minWidth:1500}}><thead><tr><th>Project ID</th><th>Company</th><th>Store / Branch</th><th>Location</th><th>Work Description</th><th>Category</th><th>Quotation No</th><th>WO No</th><th>Value</th><th>Start Date</th><th>Expected</th><th>Status</th><th>Completion</th><th>Remarks</th><th>Actions</th></tr></thead><tbody>{filtered.length?filtered.map(item=><tr key={item.id}><td className="strong-cell">{item.id}</td><td>{item.company}</td><td>{item.store||"—"}</td><td>{item.location||"—"}</td><td><span className="description-cell">{item.description||"—"}</span></td><td>{item.category}</td><td>{item.quotationNo||"—"}</td><td>{item.woNo||"—"}</td><td className="money-cell">{money(item.amount)}</td><td>{item.startDate||"—"}</td><td>{item.expected||"—"}</td><td><select className="inline-select status-inline-select" value={item.status} onChange={e=>void updateProjectStatus(item.id,e.target.value as ProjectStatus)}>{statuses.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select><div className="status-under-select"><StatusBadge value={item.status}/></div></td><td>{item.completion}%</td><td>{item.remarks||"—"}</td><td><div className="row-actions"><Link className="icon-button" href={`${routes.editProject}?id=${encodeURIComponent(item.id)}`} title="Edit full project"><Edit3 size={17}/></Link><button className="icon-button icon-button--danger" type="button" onClick={()=>void remove(item)} title="Delete"><Trash2 size={17}/></button></div></td></tr>):<EmptyTableRow columns={15} message="No projects found."/>}</tbody></table></div></section>
  </>;
}
