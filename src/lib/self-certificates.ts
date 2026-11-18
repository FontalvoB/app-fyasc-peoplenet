import { requestBlob, requestJson, useApi } from "./api";
import type { CertificateResponse } from "./api-types";

export type SelfCertificate = Pick<
  CertificateResponse,
  "id" | "certificateNumber" | "certificateType" | "status" |
  "companyName" | "issueDate" | "certifyingOfficer" | "createdAt"
>;

interface SelfCertificatePage {
  content: SelfCertificate[];
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

const path = "/certificates/me";
const timeoutMs = 60_000;

export function useSelfCertificates(page: number) {
  return useApi<SelfCertificatePage>(`${path}?page=${page}`);
}

async function requestFile(filePath: string, type: string, method: "GET" | "POST") {
  const blob = await requestBlob(filePath, { method, timeoutMs });
  if (blob.size === 0 || blob.type.split(";")[0] !== type) {
    throw new Error("El servidor no devolvió el archivo esperado.");
  }
  return blob;
}

export function previewSelfCertificate() {
  return requestFile(`${path}/preview`, "image/png", "POST");
}

export function issueSelfCertificate() {
  return requestJson<SelfCertificate>(path, { method: "POST", timeoutMs });
}

export function downloadSelfCertificate(id: number) {
  return requestFile(`${path}/${id}/download`, "application/pdf", "GET");
}
