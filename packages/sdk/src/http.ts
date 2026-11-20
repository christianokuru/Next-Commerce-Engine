import { CommerceError, parseRetryAfter, toCommerceError, friendlyMessage } from "./errors.js";

export type Query = Record<string, string | number | boolean | null | undefined>;

export type RequestOptions = {
	method?: "GET" | "POST" | "PATCH" | "DELETE";
	query?: Query;
	body?: unknown;
	/** Attach the customer's token (Authorization: Bearer). Public catalogue calls never do, so they stay cacheable and preflight-free. */
	auth?: boolean;
	signal?: AbortSignal;
	/** Extra fetch init, e.g. `{ next: { revalidate: 60 } }` in Next.js server components. */
	init?: RequestInit & Record<string, unknown>;
	/** Override retries for this call (only ever applied to GET). */
	retries?: number;
	timeoutMs?: number;
};

export type HttpConfig = {
	baseUrl: string;
	fetch: typeof fetch;
	timeoutMs: number;
	retries: number;
	credentials: RequestCredentials;
	getToken: () => Promise<string | null>;
	onToken: (token: string) => Promise<void>;
	onUnauthorized: () => Promise<void>;
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_BACKOFF_MS = 8000;

const sleep = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		if (signal?.aborted) return reject(signal.reason);
		const t = setTimeout(resolve, ms);
		signal?.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason); }, { once: true });
	});

export function buildUrl(baseUrl: string, path: string, query?: Query) {
	const url = new URL(baseUrl.replace(/\/+$/, "") + path);
	for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
	return url.toString();
}

/** Encode a path segment (handles, ids) so user input can never change the route. */
export const seg = (s: string) => encodeURIComponent(String(s));

export class Http {
	constructor(private cfg: HttpConfig) {}

	get baseUrl() {
		return this.cfg.baseUrl;
	}

	async request<T>(path: string, o: RequestOptions = {}): Promise<T> {
		const method = o.method ?? "GET";
		const idempotent = method === "GET";
		// Never retry writes: a retried POST could add an item twice or start a second payment.
		const maxRetries = idempotent ? (o.retries ?? this.cfg.retries) : 0;
		let attempt = 0;
		for (;;) {
			try {
				return await this.once<T>(path, method, o);
			} catch (e) {
				const err = e as CommerceError;
				const retryable = err.code === "network_error" || err.code === "timeout" || RETRYABLE_STATUS.has(err.status);
				if (!retryable || attempt >= maxRetries || o.signal?.aborted) throw err;
				const backoff = Math.min(MAX_BACKOFF_MS, 300 * 2 ** attempt) * (0.5 + Math.random() / 2);
				await sleep(err.retryAfter !== undefined ? Math.min(err.retryAfter * 1000, 10_000) : backoff, o.signal);
				attempt++;
			}
		}
	}

	private async once<T>(path: string, method: string, o: RequestOptions): Promise<T> {
		if (o.signal?.aborted) throw new CommerceError("aborted", "Request was cancelled", { cause: o.signal.reason });
		const headers = new Headers(o.init?.headers);
		headers.set("Accept", "application/json");
		if (o.body !== undefined) headers.set("Content-Type", "application/json");
		if (o.auth) {
			const token = await this.cfg.getToken();
			if (token) headers.set("Authorization", `Bearer ${token}`);
		}

		const timeout = new AbortController();
		const timer = setTimeout(() => timeout.abort(new DOMException("Timed out", "TimeoutError")), o.timeoutMs ?? this.cfg.timeoutMs);
		const signal = o.signal ? anySignal([o.signal, timeout.signal]) : timeout.signal;

		let res: Response;
		try {
			res = await this.cfg.fetch(buildUrl(this.cfg.baseUrl, path, o.query), {
				...o.init,
				method,
				headers,
				body: o.body === undefined ? undefined : JSON.stringify(o.body),
				credentials: this.cfg.credentials,
				signal,
			});
		} catch (e) {
			if (o.signal?.aborted) throw new CommerceError("aborted", "Request was cancelled", { cause: e });
			if (timeout.signal.aborted) throw new CommerceError("timeout", friendlyMessage("timeout")!, { cause: e });
			throw new CommerceError("network_error", friendlyMessage("network_error")!, { cause: e });
		} finally {
			clearTimeout(timer);
		}

		const token = res.headers.get("set-auth-token");
		if (token) await this.cfg.onToken(token);

		const text = await res.text().catch(() => "");
		let data: unknown = null;
		if (text) {
			try {
				data = JSON.parse(text);
			} catch {
				// HTML error pages from proxies/CDNs, truncated bodies…
				if (!res.ok) throw new CommerceError(res.status >= 500 ? "unexpected" : "unexpected", friendlyMessage("unexpected")!, { status: res.status, retryAfter: parseRetryAfter(res.headers.get("retry-after")) });
				throw new CommerceError("unexpected", "The store sent an unreadable response", { status: res.status });
			}
		}
		if (!res.ok) {
			const err = toCommerceError(res.status, data, res.headers);
			if (err.code === "unauthorized" && o.auth) await this.cfg.onUnauthorized();
			throw err;
		}
		return data as T;
	}
}

/** AbortSignal.any with a fallback for older runtimes. */
function anySignal(signals: AbortSignal[]): AbortSignal {
	const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
	if (any) return any(signals);
	const c = new AbortController();
	for (const s of signals) {
		if (s.aborted) { c.abort(s.reason); break; }
		s.addEventListener("abort", () => c.abort(s.reason), { once: true });
	}
	return c.signal;
}
