/** OLIV, the portfolio chatbot. Posts {message, previous} to a Cloudflare Worker and shows {reply}.
 *  `previous` is the last question and answer only: OLIV deliberately remembers one exchange. */

let controller: AbortController | null = null;

/** Shown when the service behind the assistant has used up its allowance for the day. */
const tired = (owner: string) =>
	`I've been working a lot today it seems... I'm tired. Get a hold of ${owner} if you need to know anything immediately, otherwise I might be able to answer you tomorrow.`;

const isQuota = (detail: unknown) => {
	const s = String(detail ?? '').toLowerCase();
	return s.includes('4006') || s.includes('daily free allocation') || s.includes('free allocation');
};

export function initOliv() {
	controller?.abort();
	controller = new AbortController();
	const { signal } = controller;

	const root = document.getElementById('oliv-chat');
	const launch = document.getElementById('oliv-launch') as HTMLButtonElement | null;
	const panel = document.getElementById('oliv-panel');
	const close = document.getElementById('oliv-close');
	const form = document.getElementById('oliv-form') as HTMLFormElement | null;
	const input = document.getElementById('oliv-input') as HTMLTextAreaElement | null;
	const log = document.getElementById('oliv-log');
	const send = document.getElementById('oliv-send') as HTMLButtonElement | null;
	const endpoint = root?.dataset.endpoint;
	/** the one exchange OLIV gets to remember; only set after a real answer */
	let previous: { question: string; answer: string } | null = null;
	if (!root || !launch || !panel || !close || !form || !input || !log || !send || !endpoint) return;

	// The panel hangs above the launcher, which rises when it docks above the footer: cap the panel to the room left.
	let raf = 0;
	const fit = () => {
		raf = 0;
		root.style.setProperty('--oliv-room', `${launch.getBoundingClientRect().top}px`);
	};
	const queueFit = () => panel.hidden || raf || (raf = requestAnimationFrame(fit));
	addEventListener('scroll', queueFit, { passive: true, signal });
	addEventListener('resize', queueFit, { passive: true, signal });

	const setOpen = (open: boolean) => {
		panel.hidden = !open;
		launch.setAttribute('aria-expanded', String(open));
		root.classList.toggle('is-open', open);
		if (open) {
			fit();
			input.focus();
		}
	};

	const addMessage = (who: 'bot' | 'user', text: string) => {
		const el = document.createElement('div');
		el.className = `oliv-message oliv-message--${who}`;
		if (who === 'bot') {
			const img = document.createElement('img');
			img.src = '/img/oliv-avatar.webp';
			img.alt = '';
			img.width = 32;
			img.height = 32;
			el.appendChild(img);
		}
		const p = document.createElement('p');
		p.textContent = text;
		el.appendChild(p);
		log.appendChild(el);
		log.scrollTop = log.scrollHeight;
		return el;
	};

	launch.addEventListener('click', () => setOpen(Boolean(panel.hidden)), { signal });
	close.addEventListener('click', () => setOpen(false), { signal });
	document.addEventListener(
		'keydown',
		(e) => {
			if (e.key === 'Escape' && !panel.hidden) {
				setOpen(false);
				launch.focus();
			}
		},
		{ signal },
	);
	input.addEventListener(
		'keydown',
		(e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				form.requestSubmit();
			}
		},
		{ signal },
	);

	form.addEventListener(
		'submit',
		async (e) => {
			e.preventDefault();
			const message = input.value.trim();
			if (!message) return;
			addMessage('user', message);
			input.value = '';
			input.disabled = send.disabled = true;
			const pending = addMessage('bot', '');
			const text = pending.querySelector('p')!;
			// Three bouncing dots while the worker answers; screen readers hear "Thinking" once via the log.
			const label = document.createElement('span');
			label.className = 'sr-only';
			label.textContent = 'Thinking';
			const dots = document.createElement('span');
			dots.className = 'oliv-typing';
			dots.setAttribute('aria-hidden', 'true');
			dots.append(document.createElement('span'), document.createElement('span'), document.createElement('span'));
			text.append(label, dots);
			try {
				const res = await fetch(endpoint, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(previous ? { message, previous } : { message }),
				});
				const data = await res.json().catch(() => null);
				if (!res.ok) {
					const detail = data?.detail || data?.error || '';
					throw new Error(isQuota(detail) || res.status === 429 ? tired(root.dataset.owner || 'the author') : `I couldn't reach the worker: ${detail || `Request failed (${res.status})`}`);
				}
				text.textContent = data?.reply || "I don't have a useful answer for that.";
				previous = data?.reply ? { question: message, answer: data.reply } : null;
			} catch (err) {
				text.textContent = err instanceof Error ? err.message : "I couldn't reach the worker.";
			} finally {
				input.disabled = send.disabled = false;
				input.focus();
				log.scrollTop = log.scrollHeight;
			}
		},
		{ signal },
	);
}
