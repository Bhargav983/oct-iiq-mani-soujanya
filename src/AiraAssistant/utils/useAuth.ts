import { useContext } from 'react';
import { AuthContext } from '../../Components/AuthContext/AuthContext';

export type AuthUserShape = {
  userId?: string;
  id?: string;
  customer_id?: string;
  delegate_id?: string;
  company_id?: string;
  companyId?: string;
  [key: string]: unknown;
};

export interface AuthContextValue {
  user: AuthUserShape | null;
}

export interface AuthParams {
  userId: string;
  companyId: string;
}

/**
 * Thin, typed wrapper around the application's primary <AuthContext />.
 *
 * Exists so the AiraAssistant pipeline (n8n API calls, WebSocket handshake)
 * can read `userId` and `companyId` without re-implementing the
 * `useContext(AuthContext)` boilerplate at every call site — and so the
 * AiraAssistant feature owns the typed surface it needs.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext) as AuthContextValue | null | undefined;
  return {
    user: ctx?.user ?? null,
  };
}

/**
 * Resolves the canonical (userId, companyId) pair for the AiraAssistant
 * pipeline. Order of precedence:
 *
 *   1. React <AuthContext /> state (the PRIMARY source of truth — live,
 *      reflects login/logout/refresh).
 *   2. localStorage — ONLY as a cold-start fallback when AuthContext has
 *      not yet been hydrated (e.g. very first render after a hard reload,
 *      before AuthProvider's useEffect writes the user back). Never used
 *      as the primary source.
 *
 * Returns empty strings if no source has the data — callers can decide
 * whether to short-circuit (e.g. n8n webhook call) or proceed without IDs.
 */
export function getAuthContext(authUser: AuthUserShape | null | undefined): AuthParams {
  const fromContext = readFromContext(authUser);
  if (fromContext.userId && fromContext.companyId) {
    return fromContext;
  }
  return readFromLocalStorage(fromContext);
}

function readFromContext(user: AuthUserShape | null | undefined): AuthParams {
  const userId =
    user?.userId ??
    user?.id ??
    user?.customer_id ??
    user?.delegate_id ??
    '';
  const companyId = user?.company_id ?? user?.companyId ?? '';
  return { userId, companyId };
}

function readFromLocalStorage(fallback: AuthParams): AuthParams {
  if (typeof window === 'undefined') return fallback;

  let lsUserId = '';
  let lsCompanyId = '';
  try {
    lsUserId = window.localStorage.getItem('userId') || '';
  } catch {
    /* localStorage may be unavailable (private mode, SSR) — ignore. */
  }
  try {
    lsCompanyId = window.localStorage.getItem('company_id') || '';
  } catch {
    /* ignore */
  }

  // selectedService is the JSON blob the rest of the app uses to stash the
  // active company; we extract `company` from it as a final fallback so
  // we don't regress flows that historically relied on it.
  if (!lsCompanyId) {
    try {
      const selectedService = window.localStorage.getItem('selectedService');
      if (selectedService) {
        const parsed = JSON.parse(selectedService) as { company?: string };
        if (parsed?.company) lsCompanyId = parsed.company;
      }
    } catch {
      /* ignore malformed JSON */
    }
  }

  return {
    userId: fallback.userId || lsUserId,
    companyId: fallback.companyId || lsCompanyId,
  };
}
