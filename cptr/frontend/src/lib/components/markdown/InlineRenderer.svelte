<script lang="ts">
	import type { Token } from 'marked';
	import { openFileTab, setFileBrowserCwd, setActiveTab, currentWorkspace } from '$lib/stores';
	import { t } from '$lib/i18n';

	interface Props {
		items: Token[];
	}

	let { items }: Props = $props();

	// Code spans that look like workspace file paths become clickable openers.
	// Common code/doc extensions — a bare filename only linkifies if its
	// extension is here, so things like `np.array` or `obj.method` don't.
	const FILE_EXTS = new Set([
		'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'svelte', 'vue', 'py', 'rs', 'go', 'java',
		'kt', 'swift', 'rb', 'php', 'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'css', 'scss', 'less',
		'html', 'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'md',
		'mdx', 'txt', 'rst', 'sh', 'bash', 'zsh', 'sql', 'xml', 'csv', 'tsv', 'lock', 'dockerfile',
		'gitignore', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'pdf', 'log'
	]);
	const PATH_RE = /^(?:~\/|\.{0,2}\/)?(?:[\w.@-]+\/)*[\w.@-]+\.([A-Za-z0-9]{1,8})$/;

	/** If a code-span string looks like a real file path, return it; else null. */
	function asFilePath(raw: string): string | null {
		const t = raw.trim();
		if (!t || t.length > 240 || /\s/.test(t)) return null;
		if (/^[a-z]+:\/\//i.test(t)) return null; // urls
		const m = t.match(PATH_RE);
		if (!m) return null;
		const hasSlash = t.includes('/');
		const extOk = FILE_EXTS.has(m[1].toLowerCase());
		// A path needs either a directory separator or a recognized extension.
		return hasSlash || extOk ? t : null;
	}

	/** Resolve a (possibly relative) path against the current workspace root. */
	function resolveFilePath(p: string, wsRoot: string): string {
		if (p.startsWith('/') || p.startsWith('~/')) return p;
		const base = wsRoot.replace(/\/+$/, '');
		return `${base}/${p.replace(/^\.\//, '')}`;
	}

	// Code spans that are bare URLs become clickable links: click opens the URL
	// in a new tab, and the browser's native right-click menu offers "Copy link
	// address" (this works over plain HTTP, where navigator.clipboard does not).
	const URL_RE = /^(?:https?:\/\/|www\.)[^\s<>()]+$/i;

	/** If a code-span string is a bare URL, return a normalized href; else null. */
	function asUrl(raw: string): string | null {
		const s = raw.trim();
		if (!s || s.length > 2048 || /\s/.test(s)) return null;
		if (!URL_RE.test(s)) return null;
		return s.startsWith('www.') ? `https://${s}` : s;
	}

	// Open a URL in a new tab/window explicitly. Relying on the anchor's
	// target="_blank" alone is unreliable inside the standalone PWA window
	// (it can hijack the app window instead of spawning a new tab), so for a
	// plain left-click we take over and window.open. Modified clicks
	// (ctrl/cmd/shift/middle) fall through to the browser's native behavior.
	function openUrl(e: MouseEvent, href: string) {
		if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
		e.preventDefault();
		window.open(href, '_blank', 'noopener,noreferrer');
	}

	let decoder: HTMLTextAreaElement | undefined;
	function decodeEntities(text: string): string {
		if (typeof document === 'undefined') return text;
		if (!text.includes('&')) return text;
		if (!decoder) decoder = document.createElement('textarea');
		decoder.innerHTML = text;
		return decoder.value;
	}

	const WIKILINK_HTML_RE = /^<wikilink data-target="([^"]+)">([^<]+)<\/wikilink>$/;

	function parseWikilink(raw: string): { target: string; label: string } | null {
		const match = raw.trim().match(WIKILINK_HTML_RE);
		if (match) return { target: match[1], label: match[2] };
		return null;
	}
</script>

{#each items as item}
	{#if item.type === 'text'}
		{#if 'tokens' in item && item.tokens}
			<svelte:self items={item.tokens} />
		{:else}
			{decodeEntities('text' in item ? item.text : item.raw)}
		{/if}
	{:else if item.type === 'strong'}
		<strong
			>{#if 'tokens' in item && item.tokens}<svelte:self
					items={item.tokens}
				/>{:else}{item.raw}{/if}</strong
		>
	{:else if item.type === 'em'}
		<em
			>{#if 'tokens' in item && item.tokens}<svelte:self
					items={item.tokens}
				/>{:else}{item.raw}{/if}</em
		>
	{:else if item.type === 'del'}
		<del
			>{#if 'tokens' in item && item.tokens}<svelte:self
					items={item.tokens}
				/>{:else}{item.raw}{/if}</del
		>
	{:else if item.type === 'codespan'}
		{@const csText = ('text' in item ? item.text : item.raw) as string}
		{@const fp = $currentWorkspace?.path ? asFilePath(csText) : null}
		{@const url = fp ? null : asUrl(csText)}
		{#if fp && $currentWorkspace?.path}
			{@const resolved = resolveFilePath(fp, $currentWorkspace.path)}
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<code
				class="codespan codespan-file cursor-pointer"
				role="link"
				tabindex="0"
				title="Open {resolved}"
				onclick={() => openFileTab(resolved)}
				onkeydown={(e) => {
					if (e.key === 'Enter') openFileTab(resolved);
				}}>{csText}</code
			>
		{:else if url}
			<a
				class="codespan codespan-url cursor-pointer"
				href={url}
				target="_blank"
				rel="noopener noreferrer"
				title="Open {url}"
				onclick={(e) => openUrl(e, url)}>{csText}</a
			>
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<code
				class="codespan cursor-pointer"
				onclick={() => navigator.clipboard.writeText(csText)}>{csText}</code
			>
		{/if}
	{:else if item.type === 'link'}
		{@const href = 'href' in item ? item.href : ''}
		{#if href?.startsWith('file:///')}
			{@const rawPath = decodeURIComponent(href.replace('file://', ''))}
			{@const isDirectory = rawPath.endsWith('/')}
			{@const filePath = isDirectory ? rawPath.slice(0, -1) : rawPath}
			{@const fileName = filePath.split('/').pop() || filePath}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<button
				class="inline-flex items-center gap-1 px-1 py-px rounded text-[0.8125rem] leading-snug font-medium cursor-pointer border-none text-blue-500 dark:text-blue-400 hover:bg-blue-500/8 transition-colors align-baseline"
				title={filePath}
				onclick={(e) => {
					e.preventDefault();
					if (isDirectory) {
						setFileBrowserCwd(filePath);
						setActiveTab('files');
					} else {
						openFileTab(filePath);
					}
				}}
			>
				{#if isDirectory}
					<svg
						class="w-3.5 h-3.5 shrink-0"
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path
							d="M2.5 3A1.5 1.5 0 0 1 4 1.5h2.172a1.5 1.5 0 0 1 1.06.44l.768.767a1.5 1.5 0 0 0 1.06.439H12A1.5 1.5 0 0 1 13.5 4.5v8A1.5 1.5 0 0 1 12 14H4a1.5 1.5 0 0 1-1.5-1.5V3Z"
						/>
					</svg>
				{:else}
					<svg
						class="w-3.5 h-3.5 shrink-0"
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path
							d="M9 1.5H4a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 4 14.5h8a1.5 1.5 0 0 0 1.5-1.5V6L9 1.5Z"
						/>
						<path d="M9 1.5V6h4.5" />
					</svg>
				{/if}
				{fileName}
			</button>
		{:else}
			<a href={href || '#'} target="_blank" rel="noopener noreferrer">
				{#if 'tokens' in item && item.tokens}
					<svelte:self items={item.tokens} />
				{:else}
					{'text' in item ? item.text : item.raw}
				{/if}
			</a>
		{/if}
	{:else if item.type === 'image'}
		<img
			src={'href' in item ? item.href : ''}
			alt={'text' in item ? item.text : ''}
			title={'title' in item ? item.title : undefined}
			loading="lazy"
		/>
	{:else if item.type === 'br'}
		<br />
	{:else if item.type === 'escape'}
		{'text' in item ? item.text : item.raw}
	{:else if item.type === 'html'}
		{@const wl = parseWikilink(item.raw)}
		{#if wl}
			<span
				class="text-blue-500 dark:text-blue-400 bg-blue-500/8 dark:bg-blue-400/10 rounded px-1 cursor-pointer hover:underline transition-colors"
				title={$t('markdown.linkTo', { target: wl.target })}>{wl.label}</span
			>
		{:else}
			{item.raw}
		{/if}
	{/if}
{/each}

<style>
	/* Code spans that resolve to workspace files or URLs: keep the code look but
	   signal they're clickable links. */
	.codespan-file,
	.codespan-url {
		color: #2563eb;
		text-decoration-line: underline;
		text-decoration-style: dotted;
		text-underline-offset: 2px;
	}
	:global(.dark) .codespan-file,
	:global(.dark) .codespan-url {
		color: #60a5fa;
	}
	.codespan-file:hover,
	.codespan-url:hover {
		text-decoration-style: solid;
	}
</style>
