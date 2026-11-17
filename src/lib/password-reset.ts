import { ApiError, logout, requestJson } from "./api";

interface PasswordResetResponse {
  success: boolean;
  message: string;
  errorDetails?: string;
}

async function resetRequest(path: string, body: object, signal: AbortSignal) {
  const response = await requestJson<PasswordResetResponse>(`/auth/${path}`, {
    method: "POST", body, signal, skipAuthRedirect: true,
  });
  if (response?.success !== true) {
    throw new ApiError(response?.errorDetails || response?.message || "No se pudo completar la recuperación.");
  }
  return response;
}

export function requestPasswordReset(email: string, signal: AbortSignal) {
  return resetRequest("request-password-reset", { email }, signal);
}

export async function confirmPasswordReset(
  token: string, newPassword: string, confirmPassword: string, signal: AbortSignal,
) {
  const response = await resetRequest("confirm-password-reset", { token, newPassword, confirmPassword }, signal);
  // Igual que el ERP: volver a iniciar sesión con la contraseña nueva.
  logout();
  return response;
}
