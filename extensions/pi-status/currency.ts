const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const REFRESH_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 5000;

interface EuroRate {
	eurPerUsd: number;
	date: string;
}

type FetchXml = (url: string, options: { signal: AbortSignal }) => Promise<{
	ok: boolean;
	text(): Promise<string>;
}>;

/** ECB quotes USD per EUR, so invert the rate before converting USD costs. */
export function parseEcbRate(xml: string): EuroRate {
	const date = xml.match(/<Cube\b[^>]*\btime=['"](\d{4}-\d{2}-\d{2})['"]/);
	const usdCube = xml.match(/<Cube\b[^>]*\bcurrency=['"]USD['"][^>]*>/)?.[0];
	const usdPerEur = Number(usdCube?.match(/\brate=['"]([0-9]+(?:\.[0-9]+)?)['"]/)?.[1]);
	const eurPerUsd = 1 / usdPerEur;
	if (!date || !Number.isFinite(usdPerEur) || usdPerEur <= 0 || !Number.isFinite(eurPerUsd)) {
		throw new Error("Invalid ECB USD exchange rate");
	}
	return { eurPerUsd, date: date[1] };
}

/** In-memory rate cache. Network failures never turn USD amounts into fake euros. */
export class EuroCostDisplay {
	private rate: EuroRate | null = null;
	private nextFetchAt = 0;
	private fetching = false;
	private stopped = false;
	private controller: AbortController | undefined;
	private fetchXml: FetchXml;
	private now: () => number;

	constructor(fetchXml: FetchXml, now: () => number = Date.now) {
		this.fetchXml = fetchXml;
		this.now = now;
	}

	format(usd: number): string {
		if (!Number.isFinite(usd) || usd <= 0) return "";
		return this.rate
			? `≈€${(usd * this.rate.eurPerUsd).toFixed(3)}`
			: `US$${usd.toFixed(3)}`;
	}

	async refresh(): Promise<void> {
		if (this.stopped || this.fetching || this.now() < this.nextFetchAt) return;
		this.fetching = true;
		this.nextFetchAt = this.now() + RETRY_MS;
		const controller = new AbortController();
		this.controller = controller;
		const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
		try {
			const response = await this.fetchXml(ECB_URL, { signal: controller.signal });
			if (!response.ok) return;
			const rate = parseEcbRate(await response.text());
			if (!this.stopped) {
				this.rate = rate;
				this.nextFetchAt = this.now() + REFRESH_MS;
			}
		} catch {
			// Keep the last successful rate, or explicitly display USD until one is available.
		} finally {
			clearTimeout(timeout);
			this.controller = undefined;
			this.fetching = false;
		}
	}

	dispose(): void {
		this.stopped = true;
		this.controller?.abort();
	}
}
