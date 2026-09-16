import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

/**
 * Success/error notifications (SweetAlert2 modals).
 *
 * Single source for action feedback in the admin and member apps: CRUD
 * saves, approvals, copies, password changes - every `toast()` call has been
 * migrated here and the legacy `ToastProvider` was removed. Keep these
 * wrappers (not raw `Swal.fire`) so tests can assert on them and the visual
 * contract stays in one place.
 */

export interface NotifyInput {
  title: string;
  message?: string;
}

const baseClasses = {
  container: 'jad-swal-container',
  popup: 'jad-swal-popup',
  title: 'jad-swal-title',
  htmlContainer: 'jad-swal-text',
  confirmButton: 'jad-swal-confirm',
  timerProgressBar: 'jad-swal-timer',
} as const;

/** Successful action - centered, auto-dismissing notice. */
export function notifySuccess(input: NotifyInput): void {
  void Swal.fire({
    toast: true,
    position: 'center',
    icon: 'success',
    title: input.title,
    text: input.message,
    timer: 2400,
    timerProgressBar: true,
    showConfirmButton: false,
    customClass: { ...baseClasses },
  });
}

/** Failed action - stays open until dismissed. */
export function notifyError(input: NotifyInput): void {
  void Swal.fire({
    icon: 'error',
    title: input.title,
    text: input.message,
    confirmButtonText: 'OK',
    customClass: { ...baseClasses },
  });
}

/** Non-blocking warning (e.g. a side effect that needs attention). */
export function notifyWarning(input: NotifyInput): void {
  void Swal.fire({
    icon: 'warning',
    title: input.title,
    text: input.message,
    confirmButtonText: 'OK',
    customClass: { ...baseClasses },
  });
}
