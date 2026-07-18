<script lang="ts">
	import { t } from '$lib/i18n';
	import { toast } from 'svelte-sonner';
	import Spinner from '$lib/components/common/Spinner.svelte';

	interface Props {
		ontext: (text: string) => void;
		workspace?: string;
	}
	let { ontext, workspace }: Props = $props();

	// Records audio and transcribes via the configured STT provider (same
	// /api/audio/transcribe path voice mode uses). Deliberately does NOT use the
	// browser SpeechRecognition API — that only works in Chrome + Google's cloud
	// service and breaks in Brave/Firefox/Safari. Tap to start, tap to stop.
	let recording = $state(false);
	let transcribing = $state(false);
	let recorder: MediaRecorder | null = null;
	let stream: MediaStream | null = null;
	let chunks: Blob[] = [];
	let mime = 'audio/webm';

	function pickMime() {
		if (typeof MediaRecorder === 'undefined') return '';
		for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
			if (MediaRecorder.isTypeSupported?.(m)) return m;
		}
		return '';
	}

	async function start() {
		if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
			toast.error($t('chat.dictate.unsupported'));
			return;
		}
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			toast.error($t('chat.dictate.micDenied'));
			return;
		}
		const m = pickMime();
		recorder = new MediaRecorder(stream, m ? { mimeType: m } : undefined);
		mime = recorder.mimeType || m || 'audio/webm';
		chunks = [];
		recorder.ondataavailable = (e) => {
			if (e.data.size > 0) chunks.push(e.data);
		};
		recorder.onstop = async () => {
			stream?.getTracks().forEach((tr) => tr.stop());
			stream = null;
			const blob = new Blob(chunks, { type: mime });
			chunks = [];
			if (!blob.size) return;
			transcribing = true;
			try {
				const form = new FormData();
				const ext = mime.includes('mp4') ? 'm4a' : 'webm';
				form.append('file', blob, `dictate.${ext}`);
				if (workspace) form.append('workspace', workspace);
				form.append('language', navigator.language || 'en-US');
				const res = await fetch('/api/audio/transcribe', { method: 'POST', body: form });
				if (!res.ok) {
					let detail = `${res.status}`;
					try {
						const data = await res.json();
						detail = data?.detail || data?.error || detail;
					} catch {}
					throw new Error(detail);
				}
				const data = await res.json();
				const text = (data?.text || '').trim();
				if (text) ontext(text);
			} catch (e: any) {
				toast.error(`${$t('chat.voiceProviderSttFallback')}${e?.message ? ` ${e.message}` : ''}`);
			} finally {
				transcribing = false;
			}
		};
		recorder.start();
		recording = true;
	}

	function stop() {
		recording = false;
		try {
			if (recorder && recorder.state !== 'inactive') recorder.stop();
		} catch {}
		recorder = null;
	}

	function toggle() {
		if (transcribing) return;
		if (recording) stop();
		else start();
	}
</script>

<button
	type="button"
	disabled={transcribing}
	aria-label={recording ? $t('chat.dictate.stop') : $t('chat.dictate.start')}
	class="flex items-center justify-center rounded-full p-1 transition-colors duration-100
		{recording
		? 'text-red-500 bg-red-500/10'
		: 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'} disabled:opacity-50"
	onclick={toggle}
>
	{#if transcribing}
		<Spinner size={16} />
	{:else}
		<svg
			class="size-4"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<rect x="9" y="2" width="6" height="12" rx="3" />
			<path d="M5 10a7 7 0 0 0 14 0" />
			<line x1="12" y1="19" x2="12" y2="22" />
			<line x1="8" y1="22" x2="16" y2="22" />
		</svg>
	{/if}
</button>
