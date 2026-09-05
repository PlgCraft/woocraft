declare global {
  interface Window {
    {{jsGlobal}}: {
      apiUrl: string;
      nonce: string;
    };
  }
}

/**
 * Fetch a path under the extension's REST namespace, with the WP nonce
 * attached. `path` is relative to /wp-json/{{apiNamespace}} — e.g.
 * apiFetch('/hello?message=world').
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { apiUrl, nonce } = window.{{jsGlobal}};

  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-WP-Nonce': nonce,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      // response wasn't JSON; keep the generic message
    }
    throw new Error(message);
  }

  return res.json();
}

export type HelloResponse = { greeting: string };

export const getHello = (message: string) =>
  apiFetch<HelloResponse>(`/hello?message=${encodeURIComponent(message)}`);
