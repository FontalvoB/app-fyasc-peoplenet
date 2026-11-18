import { requestJson } from "./api";

const photoPath = "/profile/me/photo";
const passwordPath = "/profile/me/password";

interface ProfilePhotoResponse {
  url: string | null;
}

export function getProfilePhoto(signal?: AbortSignal) {
  return requestJson<ProfilePhotoResponse>(photoPath, { signal });
}

export function replaceProfilePhoto(file: File) {
  const body = new FormData();
  body.append("file", file);
  return requestJson<ProfilePhotoResponse>(photoPath, { method: "PUT", body, timeoutMs: 60_000 });
}

export function removeProfilePhoto() {
  return requestJson<void>(photoPath, { method: "DELETE" });
}

export function requestProfilePasswordCode() {
  return requestJson<void>(`${passwordPath}/otp`, { method: "POST", timeoutMs: 60_000 });
}

export function changeProfilePassword(otp: string, newPassword: string, confirmPassword: string) {
  return requestJson<void>(passwordPath, {
    method: "PUT",
    body: { otp, newPassword, confirmPassword },
  });
}
