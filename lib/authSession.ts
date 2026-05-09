import { supabase } from "./supabase";

type SessionResponse = Awaited<ReturnType<typeof supabase.auth.getSession>>;

let sessionPromise: Promise<SessionResponse> | null = null;

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const getSafeSession = () => {
  if (!sessionPromise) {
    sessionPromise = supabase.auth
      .getSession()
      .then((response) => {
        const clearDelay = response.data.session ? 2000 : 0;
        setTimeout(() => {
          sessionPromise = null;
        }, clearDelay);
        return response;
      })
      .catch((error) => {
        sessionPromise = null;
        throw error;
      });
  }

  return sessionPromise;
};

export const waitForRestoredSession = async ({
  attempts = 8,
  intervalMs = 250,
}: {
  attempts?: number;
  intervalMs?: number;
} = {}) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const {
      data: { session },
    } = await getSafeSession();

    if (session) return session;

    if (attempt < attempts - 1) {
      await wait(intervalMs);
    }
  }

  return null;
};
