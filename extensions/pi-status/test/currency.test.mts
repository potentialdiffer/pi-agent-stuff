import assert from "node:assert/strict";
import { test } from "node:test";
import { EuroCostDisplay, parseEcbRate } from "../currency.ts";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const xml = (rate = "1.25") => `<Envelope><Cube><Cube time='2026-10-21'>
	<Cube currency='GBP' rate='0.86'/><Cube currency='USD' rate='${rate}'/>
</Cube></Cube></Envelope>`;
const response = (body = xml(), ok = true) => ({ ok, text: async () => body });

test("inverts ECB's USD-per-EUR quote", () => {
	assert.deepEqual(parseEcbRate(xml()), { eurPerUsd: 0.8, date: "2026-10-21" });
});

test("accepts double quotes and either attribute order", () => {
	assert.equal(parseEcbRate('<Cube time="2026-10-21"><Cube rate="2" currency="USD"/></Cube>').eurPerUsd, 0.5);
});

for (const body of ["", "<html>Unavailable</html>", xml("0"), xml("-1"), xml("NaN"), xml("Infinity"),
	xml(""), xml().replace("USD", "CAD"), xml().replace("2026-10-21", "invalid")]) {
	test(`rejects invalid ECB data: ${body.slice(0, 65)}`, () => {
		assert.throws(() => parseEcbRate(body), /Invalid ECB USD exchange rate/);
	});
}

test("shows explicit USD before a rate is available, never relabels dollars", () => {
	const display = new EuroCostDisplay(async () => response());
	assert.equal(display.format(1.25), "US$1.250");
	for (const cost of [0, -1, NaN, Infinity]) assert.equal(display.format(cost), "");
});

test("fetches the official ECB feed and formats estimated euros to three decimals", async () => {
	const display = new EuroCostDisplay(async (url, { signal }) => {
		assert.equal(url, "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml");
		assert.ok(signal instanceof AbortSignal);
		return response();
	});
	await display.refresh();
	assert.equal(display.format(1.25), "≈€1.000");
	assert.equal(display.format(0.001), "≈€0.001");
	assert.equal(display.format(0), "");
});

test("uses the cached rate for 24 hours; rendering never fetches", async () => {
	let now = 0;
	let calls = 0;
	const display = new EuroCostDisplay(async () => {
		calls++;
		return response();
	}, () => now);
	await display.refresh();
	for (let i = 0; i < 10; i++) display.format(i);
	now = DAY - 1;
	await display.refresh();
	assert.equal(calls, 1);
	now = DAY;
	await display.refresh();
	assert.equal(calls, 2);
});

test("updates the conversion when a new daily rate arrives", async () => {
	let now = 0;
	const display = new EuroCostDisplay(async () => response(xml(now === 0 ? "1.25" : "2")), () => now);
	await display.refresh();
	assert.equal(display.format(1), "≈€0.800");
	now = DAY;
	await display.refresh();
	assert.equal(display.format(1), "≈€0.500");
});

for (const failure of ["http", "network", "xml", "body"]) {
	test(`${failure} failure keeps USD fallback; retries after five minutes`, async () => {
		let now = 0;
		let calls = 0;
		const display = new EuroCostDisplay(async () => {
			calls++;
			if (calls > 1) return response();
			if (failure === "http") return response("", false);
			if (failure === "network") throw new Error("offline");
			if (failure === "body") return { ok: true, text: async () => { throw new Error("body interrupted"); } };
			return response("invalid XML");
		}, () => now);
		await display.refresh();
		assert.equal(display.format(1), "US$1.000");
		now = 5 * MINUTE - 1;
		await display.refresh();
		assert.equal(calls, 1);
		now = 5 * MINUTE;
		await display.refresh();
		assert.equal(calls, 2);
		assert.equal(display.format(1), "≈€0.800");
	});
}

test("refresh failure preserves the last successful rate", async () => {
	let now = 0;
	const display = new EuroCostDisplay(async () => {
		if (now > 0) throw new Error("offline");
		return response();
	}, () => now);
	await display.refresh();
	now = DAY;
	await display.refresh();
	assert.equal(display.format(1), "≈€0.800");
});

test("concurrent refreshes share one network request", async () => {
	let calls = 0;
	let resolve!: (value: ReturnType<typeof response>) => void;
	const pending = new Promise<ReturnType<typeof response>>((done) => { resolve = done; });
	const display = new EuroCostDisplay(async () => { calls++; return pending; });
	const first = display.refresh();
	await display.refresh();
	assert.equal(calls, 1);
	resolve(response());
	await first;
	assert.equal(display.format(1), "≈€0.800");
});

test("disposal aborts in-flight requests and prevents future fetches", async () => {
	let calls = 0;
	let signal!: AbortSignal;
	const display = new EuroCostDisplay(async (_url, options) => {
		calls++;
		signal = options.signal;
		return new Promise((_resolve, reject) => {
			signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
		});
	});
	const pending = display.refresh();
	display.dispose();
	display.dispose();
	assert.equal(signal.aborted, true);
	await pending;
	await display.refresh();
	assert.equal(calls, 1);
});

test("ignores late responses after disposal even if the fetcher ignores abort", async () => {
	let resolve!: (value: ReturnType<typeof response>) => void;
	const display = new EuroCostDisplay(() => new Promise((done) => { resolve = done; }));
	const pending = display.refresh();
	display.dispose();
	resolve(response());
	await pending;
	assert.equal(display.format(1), "US$1.000");
});

test("times out stalled requests after five seconds", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let signal!: AbortSignal;
	const display = new EuroCostDisplay(async (_url, options) => {
		signal = options.signal;
		return new Promise((_resolve, reject) => {
			signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
		});
	});
	const pending = display.refresh();
	t.mock.timers.tick(4999);
	assert.equal(signal.aborted, false);
	t.mock.timers.tick(1);
	assert.equal(signal.aborted, true);
	await pending;
	assert.equal(display.format(1), "US$1.000");
});

test("successful refresh clears the request timeout", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let signal!: AbortSignal;
	const display = new EuroCostDisplay(async (_url, options) => {
		signal = options.signal;
		return response();
	});
	await display.refresh();
	t.mock.timers.tick(5000);
	assert.equal(signal.aborted, false);
	display.dispose();
});
