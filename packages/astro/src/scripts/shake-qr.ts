/** Shake the phone to show the site's QR code (the dialog is rendered by ShakeQr.astro).
 *  Uses devicemotion, which Android browsers (Firefox, Chrome) fire without a permission prompt.
 *  iOS only allows it behind DeviceMotionEvent.requestPermission() on a tap, so iPhones are left out
 *  rather than asked. #qr in the URL opens it too, on any device. */

const THRESHOLD = 22; // m/s² of change between readings that counts as a jolt
const JOLTS = 3; // jolts needed...
const WINDOW_MS = 900; // ...within this long
const COOLDOWN_MS = 1500;

const dialog = () => document.getElementById('shake-qr') as HTMLDialogElement | null;

function open() {
	const d = dialog();
	if (d && !d.open) d.showModal();
}

function listenForShake() {
	type Motion = typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
	const Motion = (window as { DeviceMotionEvent?: Motion }).DeviceMotionEvent;
	if (!Motion || typeof Motion.requestPermission === 'function') return; // no API, or iOS
	if (!matchMedia('(pointer: coarse)').matches) return; // phones and tablets only

	let last: { x: number; y: number; z: number } | null = null;
	let jolts: number[] = [];
	let quietUntil = 0;

	addEventListener('devicemotion', (event) => {
		const a = event.accelerationIncludingGravity;
		if (a?.x == null || a.y == null || a.z == null) return;
		const now = performance.now();
		if (last) {
			const change = Math.abs(a.x - last.x) + Math.abs(a.y - last.y) + Math.abs(a.z - last.z);
			if (change > THRESHOLD && now > quietUntil) {
				jolts = [...jolts.filter((t) => now - t < WINDOW_MS), now];
				if (jolts.length >= JOLTS && !dialog()?.open) {
					jolts = [];
					quietUntil = now + COOLDOWN_MS;
					open();
				}
			}
		}
		last = { x: a.x, y: a.y, z: a.z };
	});
}

/** Clicking the dimmed backdrop (outside the panel) closes it, like Escape and the close button. */
document.addEventListener('click', (event) => {
	const d = dialog();
	if (d?.open && event.target === d) d.close();
});

listenForShake();

export function initShakeQr() {
	if (location.hash === '#qr') open();
}
