import { requestBlob, requestJson, useApi } from "./api";

export interface SelfIndicatorComment {
  id: number;
  indicatorId: number;
  authorId: number | null;
  authorName: string | null;
  authorRole: string | null;
  commentText: string;
  createdAt: string | null;
}

export type EvidenceStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface SelfIndicatorEvidenceCapacity {
  limit: number;
  count: number;
  available: number | null;
  unlimited: boolean;
  canSubmit: boolean;
  blockedCode: string | null;
  blockedReason: string | null;
  registrationType: string | null;
  startCalificationDate: string | null;
  endCalificationDate: string | null;
}

export interface SelfIndicatorEvidenceItem {
  id: number;
  indicatorId: number;
  assignmentId: number;
  description: string | null;
  fileName: string | null;
  startDate: string | null;
  endDate: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  status: EvidenceStatus;
  hasFile: boolean;
}

export interface SelfIndicatorEvidencesResponse {
  indicatorId: number;
  assignmentId: number | null;
  capacity: SelfIndicatorEvidenceCapacity;
  evidences: SelfIndicatorEvidenceItem[];
}

export interface SubmitSelfIndicatorEvidenceInput {
  file: File;
  description?: string;
  startDate?: string;
  endDate?: string;
}

const basePath = "/indicators/me";
const transferTimeoutMs = 60_000;

export function useMyIndicatorComments(indicatorId: number | null) {
  return useApi<SelfIndicatorComment[]>(
    indicatorId != null ? `${basePath}/${indicatorId}/comments` : null,
  );
}

export function createMyIndicatorComment(
  indicatorId: number,
  commentText: string,
): Promise<SelfIndicatorComment> {
  return requestJson<SelfIndicatorComment>(
    `${basePath}/${indicatorId}/comments`,
    {
      method: "POST",
      body: { commentText },
    },
  );
}

export function useMyIndicatorEvidences(indicatorId: number | null) {
  return useApi<SelfIndicatorEvidencesResponse>(
    indicatorId != null ? `${basePath}/${indicatorId}/evidences` : null,
  );
}

export function submitMyIndicatorEvidence(
  indicatorId: number,
  input: SubmitSelfIndicatorEvidenceInput,
): Promise<SelfIndicatorEvidenceItem> {
  const body = new FormData();
  body.append("file", input.file);
  if (input.description?.trim()) {
    body.append("description", input.description.trim());
  }
  if (input.startDate) {
    body.append("startDate", input.startDate);
  }
  if (input.endDate) {
    body.append("endDate", input.endDate);
  }
  return requestJson<SelfIndicatorEvidenceItem>(
    `${basePath}/${indicatorId}/evidences`,
    {
      method: "POST",
      body,
      timeoutMs: transferTimeoutMs,
    },
  );
}

export async function downloadMyIndicatorEvidence(
  indicatorId: number,
  evidenceId: number,
): Promise<Blob> {
  const blob = await requestBlob(
    `${basePath}/${indicatorId}/evidences/${evidenceId}/download`,
    {
      method: "GET",
      timeoutMs: transferTimeoutMs,
    },
  );
  if (blob.size === 0) {
    throw new Error("El servidor devolvió un archivo vacío.");
  }
  return blob;
}
