/** The chat window behind the "ask" button.
 *
 *  Each question is posted as {message, previous} to the address set in the CMS (AI Chat >
 *  Endpoint), and whatever comes back as {reply} is shown. `previous` is the last question and
 *  its answer, nothing older: the assistant remembers one exchange, on purpose. That is enough
 *  for "and what about the second one?", and it keeps every request small and cheap.
 *
 *  The service at that address belongs to the site's owner. examples/chat-worker in the
 *  LagomCMS repository is one that works as it is. */

let controller: AbortController | null = null;

/** Shown when the service has had enough for now, unless the owner wrote their own line for it. */
const BUSY = "I've answered a lot of questions today and have to stop for now. Try again tomorrow.";

/** Has the service run out? A 429 says so plainly. Cloudflare's Workers AI says it in words
 *  instead (error 4006, "daily free allocation"), so those are looked for as well. */
const isQuota = (detail: unknown) => {
	const s = String(detail ?? '').toLowerCase();
	return s.includes('4006') || s.includes('daily free allocation') || s.includes('free allocation');
};

export function initChat() {
	controller?.abort();
	controller = new AbortController();
	const { signal } = controller;

	const root = document.getElementById('chat-widget');
	const launch = document.getElementById('chat-launch') as HTMLButtonElement | null;
	const panel = document.getElementById('chat-panel');
	const close = document.getElementById('chat-close');
	const form = document.getElementById('chat-form') as HTMLFormElement | null;
	const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
	const log = document.getElementById('chat-log');
	const send = document.getElementById('chat-send') as HTMLButtonElement | null;
	const endpoint = root?.dataset.endpoint;
	const avatar = root?.dataset.avatar;
	/** the one exchange the assistant gets to remember; only set after a real answer */
	let previous: { question: string; answer: string } | null = null;
	if (!root || !launch || !panel || !close || !form || !input || !log || !send || !endpoint) return;

	// The panel hangs above the launcher, which rises when it docks above the footer: cap the panel to the room left.
	let raf = 0;
	const fit = () => {
		raf = 0;
		root.style.setProperty('--chat-room', `${launch.getBoundingClientRect().top}px`);
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
		el.className = `chat-message chat-message--${who}`;
		if (who === 'bot' && avatar) {
			const img = document.createElement('img');
			img.src = avatar;
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
			// Three bouncing dots while the answer is on its way; screen readers hear "Thinking" once via the log.
			const label = document.createElement('span');
			label.className = 'sr-only';
			label.textContent = 'Thinking';
			const dots = document.createElement('span');
			dots.className = 'chat-typing';
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
					throw new Error(isQuota(detail) || res.status === 429 ? root.dataset.busy || BUSY : `I couldn't get an answer: ${detail || `the request failed (${res.status})`}`);
				}
				text.textContent = data?.reply || "I don't have a useful answer for that.";
				previous = data?.reply ? { question: message, answer: data.reply } : null;
			} catch (err) {
				text.textContent = err instanceof Error ? err.message : "I couldn't get an answer.";
			} finally {
				input.disabled = send.disabled = false;
				input.focus();
				log.scrollTop = log.scrollHeight;
			}
		},
		{ signal },
	);
}
