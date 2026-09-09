import { test } from "node:test";
import assert from "node:assert/strict";
import { jobMatchesDateFilter } from "./date-range-filter";
import type { MyJob } from "@/types";

const HOJE = new Date().toISOString().slice(0, 10);
const SEMANA_PASSADA = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

const job = (extra: Partial<MyJob>): MyJob =>
  ({ id: "JOB-1", title: "x", status: "scheduled", osStatus: "scheduled", total: 0,
     needsAttention: false, scheduledDate: HOJE, ...extra } as MyJob);

test("job de hoje aparece no filtro de hoje", () => {
  assert.equal(jobMatchesDateFilter(job({}), { mode: "today", customFrom: "", customTo: "" }), true);
});

test("job da semana passada some no filtro de hoje", () => {
  assert.equal(
    jobMatchesDateFilter(job({ scheduledDate: SEMANA_PASSADA }), { mode: "today", customFrom: "", customTo: "" }),
    false,
  );
});

test("MAS job esperando o parceiro nunca some, por mais velho que seja", () => {
  // A reclamação chega depois da visita: o job está sempre no passado. Se o
  // filtro o escondesse, o parceiro nunca saberia que tem trabalho a resolver.
  assert.equal(
    jobMatchesDateFilter(
      job({ scheduledDate: SEMANA_PASSADA, needsAttention: true, osStatus: "on_hold" }),
      { mode: "today", customFrom: "", customTo: "" },
    ),
    true,
  );
});

test("nem num intervalo escolhido à mão que não o contém", () => {
  assert.equal(
    jobMatchesDateFilter(
      job({ scheduledDate: SEMANA_PASSADA, needsAttention: true }),
      { mode: "custom", customFrom: HOJE, customTo: HOJE },
    ),
    true,
  );
});

test("job sem data agendada continua fora, se não espera ninguém", () => {
  assert.equal(
    jobMatchesDateFilter(job({ scheduledDate: undefined }), { mode: "today", customFrom: "", customTo: "" }),
    false,
  );
});
