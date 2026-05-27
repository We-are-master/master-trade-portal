// Per-job checklist (job_checklist_items, migration 201). The assigned partner reads, ticks,
// adds and removes steps for their own job (RLS-scoped). Keyed by the real jobs.id (MyJob.uuid).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  required: boolean;
  note: string | null;
  sortOrder: number;
}

interface Row {
  id: string;
  label: string | null;
  done: boolean | null;
  required: boolean | null;
  note: string | null;
  sort_order: number | null;
}

function mapItem(r: Row): ChecklistItem {
  return {
    id: r.id,
    label: r.label || "",
    done: !!r.done,
    required: !!r.required,
    note: r.note,
    sortOrder: r.sort_order ?? 0,
  };
}

export async function fetchChecklist(supabase: SupabaseClient, jobUuid: string): Promise<ChecklistItem[]> {
  const { data, error } = await supabase
    .from("job_checklist_items")
    .select("id,label,done,required,note,sort_order")
    .eq("job_id", jobUuid)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(mapItem);
}

export async function setChecklistItemDone(supabase: SupabaseClient, id: string, done: boolean): Promise<void> {
  const { error } = await supabase
    .from("job_checklist_items")
    .update({ done, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function addChecklistItem(supabase: SupabaseClient, jobUuid: string, label: string, sortOrder: number): Promise<ChecklistItem> {
  const { data, error } = await supabase
    .from("job_checklist_items")
    .insert({ job_id: jobUuid, label, required: false, sort_order: sortOrder })
    .select("id,label,done,required,note,sort_order")
    .single();
  if (error) throw error;
  return mapItem(data as Row);
}

export async function deleteChecklistItem(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("job_checklist_items").delete().eq("id", id);
  if (error) throw error;
}
