<script lang="ts">
	/**
	 * Common chat list item used in sidebar and chat history.
	 * Shows title, relative time, optional spinner for active chats,
	 * and an optional context menu button.
	 */
	import type { ChatInfo } from '$lib/apis/chat';
	import { chatStatuses, isChatUnread } from '$lib/stores/chat';
	import Spinner from './Spinner.svelte';
	import { t } from '$lib/i18n';

	interface Props {
		chat: ChatInfo;
		isSelected?: boolean;
		onclick: () => void;
		/** Optional menu button click handler */
		onmenu?: (e: MouseEvent) => void;
	}
	let { chat, isSelected = false, onclick, onmenu }: Props = $props();
	let status = $derived($chatStatuses.get(chat.id));
	let active = $derived(status?.active ?? chat.is_active ?? false);
	let unread = $derived(
		!isSelected &&
			(status
				? isChatUnread(status)
				: !active && (chat.last_read_at === null || chat.updated_at > chat.last_read_at))
	);

	function formatTime(ts: number): string {
		const now = Date.now();
		const diffMs = now - ts;
		const diffSec = Math.floor(diffMs / 1000);
		if (diffSec < 60) return 'now';
		const diffMin = Math.floor(diffSec / 60);
		if (diffMin < 60) return `${diffMin}m`;
		const diffHr = Math.floor(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h`;
		const diffDay = Math.floor(diffHr / 24);
		if (diffDay < 7) return `${diffDay}d`;
		const d = new Date(ts);
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="group flex items-center gap-2.5 w-full h-7 px-2 rounded-lg cursor-pointer transition-colors duration-75
		{isSelected
		? 'bg-black/[0.04] dark:bg-white/[0.055]'
		: 'hover:bg-black/[0.025] dark:hover:bg-white/[0.03]'}"
	role="button"
	tabindex="0"
	{onclick}
	onkeydown={(e) => {
		if (e.key === 'Enter') onclick();
	}}
	title={chat.title}
>
	{#if active}
		<Spinner size={10} borderWidth={1.5} class="opacity-50" />
	{/if}
	{#if unread}
		<span class="size-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden="true"></span>
	{/if}
	<span
		class="flex-1 text-[0.8125rem] truncate min-w-0 transition-colors duration-75 {unread
			? 'font-medium text-gray-900 dark:text-gray-100'
			: isSelected
				? 'text-gray-900 dark:text-white'
				: 'text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white'}"
		>{chat.title}</span
	>
	<span class="text-[0.75rem] text-gray-400 dark:text-gray-500 shrink-0 tabular-nums"
		>{formatTime(chat.updated_at)}</span
	>
	{#if onmenu}
		<button
			class="flex items-center justify-center w-5 h-5 rounded shrink-0 text-gray-300 dark:text-gray-700 hover:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/8 transition-all duration-75"
			onclick={(e) => {
				e.stopPropagation();
				onmenu?.(e);
			}}
			aria-label={$t('a11y.chatOptions')}
		>
			<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
				<circle cx="3" cy="8" r="1.5" />
				<circle cx="8" cy="8" r="1.5" />
				<circle cx="13" cy="8" r="1.5" />
			</svg>
		</button>
	{/if}
</div>
