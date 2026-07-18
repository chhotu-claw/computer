<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		workspaceList,
		removeWorkspace,
		reorderWorkspacesInSection,
		pinnedWorkspaces,
		allWorkspacesExpanded,
		pinnedExpanded,
		togglePinWorkspace,
		sidebarOpen,
		activeTab,
		currentWorkspace
	} from '$lib/stores';
	import { chatEnabled, updateChatStatuses } from '$lib/stores/chat';
	import { socketStore } from '$lib/stores/socket.svelte';
	import {
		deleteChat as apiDeleteChat,
		getChats,
		updateChatTitle,
		type ChatInfo
	} from '$lib/apis/chat';
	import { t } from '$lib/i18n';
	import { tooltip } from '$lib/tooltip';
	import Sortable from 'sortablejs';
	import { onDestroy, onMount } from 'svelte';
	import ChatItem from './common/ChatItem.svelte';
	import DropdownMenu from './DropdownMenu.svelte';
	import Icon from './Icon.svelte';

	interface Props {
		onaddworkspace: () => void;
	}

	let { onaddworkspace }: Props = $props();
	let wsMenuPath = $state<string | null>(null);
	let wsMenuAnchor = $state<HTMLElement | null>(null);
	let chatMenu = $state<{ chatId: string; wsPath: string; anchor: HTMLElement } | null>(null);
	let pinnedListEl: HTMLDivElement | undefined = $state();
	let unpinnedListEl: HTMLDivElement | undefined = $state();
	let unbindSocketListener: (() => void) | null = null;

	// ── Pinned vs. unpinned sections ────────────────────────────
	// Pinned rows render in a separate section above the main list; both are
	// slices of the same $workspaceList so per-section drag stays independent.
	let pinnedSet = $derived(new Set($pinnedWorkspaces));
	let pinnedWs = $derived($workspaceList.filter((w) => pinnedSet.has(w.path)));
	let unpinnedWs = $derived($workspaceList.filter((w) => !pinnedSet.has(w.path)));

	let expandedWorkspaces = $state<Set<string>>(new Set());
	let wsChatsCache = $state<Map<string, ChatInfo[]>>(new Map());
	let wsChatsHasMore = $state<Map<string, boolean>>(new Map());
	let wsChatsLoading = $state<Set<string>>(new Set());
	let currentPath = $derived($currentWorkspace?.path ?? null);
	let currentChatId = $derived($activeTab?.type === 'chat' ? $activeTab.path : null);

	function toggleWorkspaceExpand(path: string) {
		const next = new Set(expandedWorkspaces);
		if (next.has(path)) {
			next.delete(path);
		} else {
			next.add(path);
			if (!wsChatsCache.has(path)) fetchWorkspaceChats(path);
		}
		expandedWorkspaces = next;
	}

	async function fetchWorkspaceChats(path: string, append = false) {
		if (wsChatsLoading.has(path)) return;
		wsChatsLoading = new Set([...wsChatsLoading, path]);
		try {
			const existing = wsChatsCache.get(path) ?? [];
			const data = await getChats(path, 5, append ? existing.length : 0, 'updated_at', 'desc');
			wsChatsCache = new Map([
				...wsChatsCache,
				[
					path,
					append
						? [...existing, ...(data.chats || [])].sort(
								(a, b) =>
									Number(
										!b.is_active && (b.last_read_at === null || b.updated_at > b.last_read_at)
									) -
										Number(
											!a.is_active && (a.last_read_at === null || a.updated_at > a.last_read_at)
										) || b.updated_at - a.updated_at
							)
						: data.chats || []
				]
			]);
			updateChatStatuses(data.chats || [], path);
			wsChatsHasMore = new Map([...wsChatsHasMore, [path, data.has_more]]);
		} catch {
			wsChatsCache = new Map([...wsChatsCache, [path, []]]);
			wsChatsHasMore = new Map([...wsChatsHasMore, [path, false]]);
		} finally {
			const next = new Set(wsChatsLoading);
			next.delete(path);
			wsChatsLoading = next;
		}
	}

	function closeMobileSidebar() {
		if (typeof window !== 'undefined' && window.innerWidth < 768) sidebarOpen.set(false);
	}

	function openWorkspace(e: MouseEvent, path: string) {
		if (e.metaKey || e.ctrlKey) return;
		e.preventDefault();
		goto(`/?workspace=${encodeURIComponent(path)}`);
		closeMobileSidebar();
	}

	function openChat(chatId: string, wsPath: string) {
		goto(`/?workspace=${encodeURIComponent(wsPath)}&chatId=${encodeURIComponent(chatId)}`);
		closeMobileSidebar();
	}

	function newChat(wsPath: string) {
		goto(`/?workspace=${encodeURIComponent(wsPath)}&chatId`);
		closeMobileSidebar();
	}

	function toggleAllWorkspaces() {
		allWorkspacesExpanded.set(!$allWorkspacesExpanded);
	}

	function togglePinned() {
		pinnedExpanded.set(!$pinnedExpanded);
	}

	function openWsMenu(e: MouseEvent, path: string) {
		e.stopPropagation();
		e.preventDefault();
		closeChatMenu();
		wsMenuAnchor = e.currentTarget as HTMLElement;
		wsMenuPath = path;
	}

	function closeWsMenu() {
		wsMenuPath = null;
		wsMenuAnchor = null;
	}

	function handleTogglePin(path: string) {
		closeWsMenu();
		togglePinWorkspace(path);
	}

	function openChatMenu(e: MouseEvent, chatId: string, wsPath: string) {
		e.stopPropagation();
		closeWsMenu();
		chatMenu = { chatId, wsPath, anchor: e.currentTarget as HTMLElement };
	}

	function closeChatMenu() {
		chatMenu = null;
	}

	async function handleRemoveWorkspace(path: string) {
		closeWsMenu();
		await removeWorkspace(path);
		if (currentPath === path) goto('/');
	}

	async function handleDeleteChat() {
		if (!chatMenu) return;
		const { chatId, wsPath } = chatMenu;
		closeChatMenu();
		await apiDeleteChat(chatId);
		const chats = wsChatsCache.get(wsPath) ?? [];
		wsChatsCache = new Map([...wsChatsCache, [wsPath, chats.filter((chat) => chat.id !== chatId)]]);
		if (currentPath === wsPath && currentChatId === chatId) {
			goto(`/?workspace=${encodeURIComponent(wsPath)}`);
		}
	}

	async function handleRenameChat() {
		if (!chatMenu) return;
		const { chatId, wsPath } = chatMenu;
		const chat = (wsChatsCache.get(wsPath) ?? []).find((item) => item.id === chatId);
		const title = window.prompt($t('files.rename'), chat?.title)?.trim();
		if (!title || title === chat?.title) return;
		await updateChatTitle(chatId, title);
		const chats = wsChatsCache.get(wsPath) ?? [];
		wsChatsCache = new Map([
			...wsChatsCache,
			[wsPath, chats.map((item) => (item.id === chatId ? { ...item, title } : item))]
		]);
	}

	function copyChatPath() {
		if (!chatMenu) return;
		const { chatId, wsPath } = chatMenu;
		const chat = (wsChatsCache.get(wsPath) ?? []).find((item) => item.id === chatId);
		if (!chat) return;
		navigator.clipboard.writeText(
			`${wsPath.replace(/\/$/, '')}/.cptr/chats/${chat.folder ? `${chat.folder}/` : ''}${chat.id}.json`
		);
	}

	function handleChatEvent(data: {
		type?: string;
		chat_id: string;
		done?: boolean;
		title?: string;
		delta?: string;
		workspace?: string;
		active?: boolean;
		updated_at?: number;
		last_read_at?: number;
		workspace_unread_count?: number;
	}) {
		if (
			!data.title &&
			typeof data.active !== 'boolean' &&
			typeof data.updated_at !== 'number' &&
			typeof data.last_read_at !== 'number' &&
			typeof data.workspace_unread_count !== 'number'
		) {
			return;
		}
		const unreadCount = data.workspace_unread_count;
		if (data.workspace && typeof unreadCount === 'number') {
			workspaceList.update((workspaces) =>
				workspaces.map((workspace) =>
					workspace.path === data.workspace
						? { ...workspace, unread_count: unreadCount }
						: workspace
				)
			);
		}

		let known = false;
		const shouldReorder =
			typeof data.updated_at === 'number' ||
			typeof data.last_read_at === 'number' ||
			typeof data.active === 'boolean';

		wsChatsCache = new Map(
			[...wsChatsCache].map(([path, chats]) => {
				const nextChats = chats.map((chat) => {
					if (chat.id !== data.chat_id) return chat;
					known = true;
					return {
						...chat,
						...(data.title ? { title: data.title } : {}),
						...(typeof data.updated_at === 'number' ? { updated_at: data.updated_at } : {}),
						...(typeof data.last_read_at === 'number' ? { last_read_at: data.last_read_at } : {}),
						...(typeof data.active === 'boolean' ? { is_active: data.active } : {})
					};
				});
				return [
					path,
					shouldReorder
						? nextChats.sort(
								(a, b) =>
									Number(
										!b.is_active && (b.last_read_at === null || b.updated_at > b.last_read_at)
									) -
										Number(
											!a.is_active && (a.last_read_at === null || a.updated_at > a.last_read_at)
										) || b.updated_at - a.updated_at
							)
						: nextChats
				] as [string, ChatInfo[]];
			})
		);

		// A chat created in another session is not yet in this sidebar's page.
		// Refresh only that expanded workspace; all known rows update in place.
		if (!known && data.workspace && expandedWorkspaces.has(data.workspace)) {
			void fetchWorkspaceChats(data.workspace);
		} else if (
			known &&
			typeof data.last_read_at === 'number' &&
			data.workspace &&
			expandedWorkspaces.has(data.workspace)
		) {
			void fetchWorkspaceChats(data.workspace);
		}

		// Project-less (Home) chat events carry no workspace — refresh that list.
		if (!data.workspace && homeExpanded) void fetchHomeChats();
	}

	// ── Home (project-less) chats ───────────────────────────────
	// Non-project chats live under DATA_DIR/chats (workspace=None). List them in
	// their own collapsible section below the workspaces so ad-hoc conversations
	// are reachable from the sidebar, not just the home screen.
	let homeChats = $state<ChatInfo[]>([]);
	let homeChatsLoading = $state(false);
	let homeChatsHasMore = $state(false);
	let homeExpanded = $state(true);
	let homeChatMenu = $state<{ chatId: string; anchor: HTMLElement } | null>(null);

	async function fetchHomeChats(append = false) {
		if (homeChatsLoading) return;
		homeChatsLoading = true;
		try {
			const data = await getChats(undefined, 10, append ? homeChats.length : 0, 'updated_at', 'desc');
			homeChats = append ? [...homeChats, ...data.chats] : data.chats;
			homeChatsHasMore = data.has_more;
		} catch {
			if (!append) homeChats = [];
		} finally {
			homeChatsLoading = false;
		}
	}

	function toggleHomeExpand() {
		homeExpanded = !homeExpanded;
		if (homeExpanded && homeChats.length === 0) void fetchHomeChats();
	}

	function openHomeChat(chatId: string) {
		goto(`/?chatId=${encodeURIComponent(chatId)}`);
		closeMobileSidebar();
	}

	function newHomeChat() {
		goto('/');
		closeMobileSidebar();
	}

	function openHomeChatMenu(e: MouseEvent, chatId: string) {
		e.stopPropagation();
		closeWsMenu();
		closeChatMenu();
		homeChatMenu = { chatId, anchor: e.currentTarget as HTMLElement };
	}

	function closeHomeChatMenu() {
		homeChatMenu = null;
	}

	async function handleDeleteHomeChat() {
		if (!homeChatMenu) return;
		const { chatId } = homeChatMenu;
		closeHomeChatMenu();
		await apiDeleteChat(chatId);
		homeChats = homeChats.filter((chat) => chat.id !== chatId);
		if (!currentPath && currentChatId === chatId) goto('/');
	}

	async function handleRenameHomeChat() {
		if (!homeChatMenu) return;
		const { chatId } = homeChatMenu;
		const chat = homeChats.find((item) => item.id === chatId);
		const title = window.prompt($t('files.rename'), chat?.title)?.trim();
		if (!title || title === chat?.title) return;
		await updateChatTitle(chatId, title);
		homeChats = homeChats.map((item) => (item.id === chatId ? { ...item, title } : item));
	}

	function isTouchDevice(): boolean {
		return (
			typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
		);
	}

	// Auto-expand every workspace on first load so chat lists are visible by
	// default. One-time guard: after the initial expand, manual collapse sticks.
	let didInitExpand = false;
	$effect(() => {
		if (!$chatEnabled) return;
		const list = $workspaceList;
		if (didInitExpand || list.length === 0) return;
		didInitExpand = true;
		const next = new Set(expandedWorkspaces);
		for (const ws of list) {
			next.add(ws.path);
			if (!wsChatsCache.has(ws.path)) fetchWorkspaceChats(ws.path);
		}
		expandedWorkspaces = next;
	});

	// Per-section drag reorder. `inPinnedSection` selects which global slice
	// moves; cross-section drags are disabled (each list is its own group).
	function makeSortable(el: HTMLDivElement, inPinnedSection: boolean): Sortable {
		return Sortable.create(el, {
			animation: 150,
			ghostClass: 'opacity-30',
			dragClass: 'cursor-grabbing',
			direction: 'vertical',
			onEnd: (evt) => {
				if (evt.oldIndex != null && evt.newIndex != null && evt.oldIndex !== evt.newIndex) {
					reorderWorkspacesInSection(inPinnedSection, evt.oldIndex, evt.newIndex);
				}
			}
		});
	}

	// Attach a Sortable to each section as its element mounts/unmounts. Each
	// list is only in the DOM while its section is expanded, so effects (not
	// onMount) keep the drag handles in sync.
	$effect(() => {
		if (isTouchDevice() || !pinnedListEl) return;
		const s = makeSortable(pinnedListEl, true);
		return () => s.destroy();
	});
	$effect(() => {
		if (isTouchDevice() || !unpinnedListEl) return;
		const s = makeSortable(unpinnedListEl, false);
		return () => s.destroy();
	});

	onMount(() => {
		unbindSocketListener = socketStore.on('events:chat', handleChatEvent);
		if ($chatEnabled) void fetchHomeChats();
	});

	onDestroy(() => {
		unbindSocketListener?.();
		unbindSocketListener = null;
	});
</script>

<!-- One workspace row (name + hover controls + collapsible chat list) -->
{#snippet workspaceRow(ws: { path: string; name: string; unread_count: number })}
	{@const isExpanded = expandedWorkspaces.has(ws.path)}
	{@const chats = wsChatsCache.get(ws.path)}
	{@const hasMoreChats = wsChatsHasMore.get(ws.path)}
	{@const isLoading = wsChatsLoading.has(ws.path)}
	<div class="ws-item">
		<div
			class="group flex items-center gap-2.5 w-full h-8 px-2 rounded-lg text-[0.8125rem] font-medium transition-colors duration-100
			{ws.path === currentPath
				? 'bg-black/[0.04] text-gray-900 dark:bg-white/[0.055] dark:text-white'
				: 'text-gray-700 hover:text-gray-900 hover:bg-black/[0.025] dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/[0.03]'}"
		>
			<a
				href="/?workspace={encodeURIComponent(ws.path)}"
				class="flex items-center gap-1 flex-1 min-w-0 no-underline text-inherit"
				onclick={(e) => openWorkspace(e, ws.path)}
			>
				<!-- Icon: folder by default, chevron on hover (when chat enabled) -->
				{#if $chatEnabled}
					<span
						class="ws-icon-toggle shrink-0"
						role="button"
						tabindex="-1"
						onclick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							toggleWorkspaceExpand(ws.path);
						}}
						aria-label={isExpanded ? $t('sidebar.collapse') : $t('sidebar.addWorkspace')}
					>
						<span class="ws-icon-folder"><Icon name="folder" size={16} /></span>
						<span
							class="ws-icon-chevron"
							style="transform: rotate({isExpanded ? '90deg' : '0deg'})"
						>
							<Icon name="chevron-right" size={11} />
						</span>
					</span>
				{:else}
					<Icon name="folder" size={16} />
				{/if}
				<span class="min-w-0 truncate text-left">{ws.name}</span>
				{#if ws.unread_count > 0}
					<span
						class="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-md bg-sky-500/10 px-1 text-[0.625rem] font-semibold text-sky-600 dark:bg-sky-400/10 dark:text-sky-300"
					>
						{new Intl.NumberFormat(undefined, {
							notation: 'compact',
							compactDisplay: 'short'
						}).format(ws.unread_count)}
					</span>
				{/if}
			</a>
			<span
				class="flex items-center justify-center w-4 h-4 shrink-0 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-gray-600 dark:hover:text-gray-300 transition-all duration-75 cursor-pointer"
				role="button"
				tabindex="-1"
				onclick={(e) => openWsMenu(e, ws.path)}
				aria-label={$t('sidebar.workspaceOptions')}
			>
				<Icon name="three-dots" size={11} />
			</span>
			{#if $chatEnabled}
				<span
					class="flex items-center justify-center w-4 h-4 shrink-0 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-gray-600 dark:hover:text-gray-300 transition-all duration-75 cursor-pointer"
					role="button"
					tabindex="-1"
					onclick={() => newChat(ws.path)}
					aria-label={$t('bar.newChat')}
					use:tooltip={$t('bar.newChat')}
				>
					<Icon name="pencil" size={11} />
				</span>
			{/if}
		</div>

		<!-- Collapsible chat list -->
		{#if $chatEnabled && isExpanded}
			<div class="ws-chats nested">
				{#if isLoading && !chats}
					<div class="ws-chat-loading">
						<span class="ws-chat-loading-dot"></span>
						<span class="ws-chat-loading-dot"></span>
						<span class="ws-chat-loading-dot"></span>
					</div>
				{:else if chats && chats.length > 0}
					{#each chats as chat (chat.id)}
						<ChatItem
							{chat}
							isSelected={chat.id === currentChatId}
							onclick={() => openChat(chat.id, ws.path)}
							onmenu={(e) => openChatMenu(e, chat.id, ws.path)}
						/>
					{/each}
					{#if hasMoreChats}
						<button
							class="ws-chat-show-more"
							disabled={isLoading}
							onclick={() => fetchWorkspaceChats(ws.path, true)}
						>
							{$t('sidebar.showMore')}
						</button>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

<!-- Workspace list -->
<div class="flex-1 overflow-y-auto px-1.5">
	<!-- Pinned workspaces above the section header. The list div is only in the
	     DOM while expanded, so its Sortable attaches/detaches with it. -->
	{#if pinnedWs.length > 0}
		<div class="flex items-center h-8 mt-1">
			<button
				class="ws-header-toggle"
				onclick={togglePinned}
				aria-expanded={$pinnedExpanded}
				aria-controls="pinned-list"
			>
				<span>{$t('sidebar.pinned')}</span>
				<span
					class="ws-header-chevron"
					style="transform: rotate({$pinnedExpanded ? '90deg' : '0deg'})"
				>
					<Icon name="chevron-right" size={11} />
				</span>
				{#if !$pinnedExpanded}
					<span class="ws-header-count">{pinnedWs.length}</span>
				{/if}
			</button>
		</div>
		{#if $pinnedExpanded}
			<div id="pinned-list" bind:this={pinnedListEl} class="ws-section">
				{#each pinnedWs as ws (ws.path)}
					{@render workspaceRow(ws)}
				{/each}
			</div>
		{/if}
	{/if}

	<!-- Section header doubles as the collapse toggle for the (unpinned)
	     workspace list; collapsing leaves only the pinned section above. -->
	<div class="flex items-center h-8 mt-1">
		<button
			class="ws-header-toggle"
			onclick={toggleAllWorkspaces}
			aria-expanded={$allWorkspacesExpanded}
			aria-controls="workspace-list"
		>
			<span>{$t('sidebar.workspaces')}</span>
			<span
				class="ws-header-chevron"
				style="transform: rotate({$allWorkspacesExpanded ? '90deg' : '0deg'})"
			>
				<Icon name="chevron-right" size={11} />
			</span>
			{#if !$allWorkspacesExpanded && unpinnedWs.length > 0}
				<span class="ws-header-count">{unpinnedWs.length}</span>
			{/if}
		</button>
		<button
			class="flex items-center justify-center w-7 h-7 rounded-lg text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-colors duration-100 shrink-0"
			onclick={onaddworkspace}
			aria-label={$t('sidebar.addWorkspace')}
			use:tooltip={$t('sidebar.addWorkspace')}
		>
			<Icon name="plus" size={14} />
		</button>
	</div>

	{#if $allWorkspacesExpanded}
		<div id="workspace-list" bind:this={unpinnedListEl} class="ws-section">
			{#each unpinnedWs as ws (ws.path)}
				{@render workspaceRow(ws)}
			{/each}
		</div>
	{/if}

	{#if $workspaceList.length === 0}
		<div class="flex flex-col items-center justify-center py-12">
			<p class="text-xs text-gray-400 dark:text-gray-600">{$t('sidebar.noWorkspaces')}</p>
		</div>
	{/if}

	<!-- Home (project-less) chats: reachable from the sidebar, not just Home. -->
	{#if $chatEnabled}
		<div class="flex items-center h-8 mt-1">
			<button
				class="ws-header-toggle"
				onclick={toggleHomeExpand}
				aria-expanded={homeExpanded}
				aria-controls="home-chats-list"
			>
				<span>{$t('sidebar.chats')}</span>
				<span
					class="ws-header-chevron"
					style="transform: rotate({homeExpanded ? '90deg' : '0deg'})"
				>
					<Icon name="chevron-right" size={11} />
				</span>
				{#if !homeExpanded && homeChats.length > 0}
					<span class="ws-header-count">{homeChats.length}</span>
				{/if}
			</button>
			<button
				class="flex items-center justify-center w-7 h-7 rounded-lg text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-colors duration-100 shrink-0"
				onclick={newHomeChat}
				aria-label={$t('bar.newChat')}
				use:tooltip={$t('bar.newChat')}
			>
				<Icon name="pencil" size={14} />
			</button>
		</div>

		{#if homeExpanded}
			<div id="home-chats-list">
				{#if homeChatsLoading && homeChats.length === 0}
					<div class="ws-chats">
						<div class="ws-chat-loading">
							<span class="ws-chat-loading-dot"></span>
							<span class="ws-chat-loading-dot"></span>
							<span class="ws-chat-loading-dot"></span>
						</div>
					</div>
				{:else if homeChats.length > 0}
					<div class="ws-chats">
						{#each homeChats as chat (chat.id)}
							<ChatItem
								{chat}
								isSelected={!currentPath && chat.id === currentChatId}
								onclick={() => openHomeChat(chat.id)}
								onmenu={(e) => openHomeChatMenu(e, chat.id)}
							/>
						{/each}
						{#if homeChatsHasMore}
							<button
								class="ws-chat-show-more"
								disabled={homeChatsLoading}
								onclick={() => fetchHomeChats(true)}
							>
								{$t('sidebar.showMore')}
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>

{#if wsMenuPath && wsMenuAnchor}
	{@const menuPinned = pinnedSet.has(wsMenuPath)}
	<DropdownMenu
		anchor={wsMenuAnchor}
		items={[
			{
				label: menuPinned ? $t('sidebar.unpin') : $t('sidebar.pin'),
				icon: 'pin',
				onclick: () => handleTogglePin(wsMenuPath!)
			},
			{
				label: $t('sidebar.remove'),
				icon: 'xmark',
				onclick: () => handleRemoveWorkspace(wsMenuPath!)
			}
		]}
		onclose={closeWsMenu}
	/>
{/if}

{#if chatMenu}
	<DropdownMenu
		anchor={chatMenu.anchor}
		align="end"
		items={[
			{
				label: $t('files.copyPath'),
				icon: 'copy',
				onclick: copyChatPath
			},
			{
				label: $t('files.rename'),
				icon: 'pencil',
				onclick: handleRenameChat
			},
			{
				label: $t('chat.history.delete'),
				icon: 'trash',
				onclick: handleDeleteChat
			}
		]}
		onclose={closeChatMenu}
	/>
{/if}

{#if homeChatMenu}
	<DropdownMenu
		anchor={homeChatMenu.anchor}
		align="end"
		items={[
			{
				label: $t('files.rename'),
				icon: 'pencil',
				onclick: handleRenameHomeChat
			},
			{
				label: $t('chat.history.delete'),
				icon: 'trash',
				onclick: handleDeleteHomeChat
			}
		]}
		onclose={closeHomeChatMenu}
	/>
{/if}

<style>
	@reference "../../app.css";

	.ws-item {
		margin-bottom: 0.125rem;
	}

	/* ── Section disclosure header (Pinned / Workspaces) ────────── */
	/* Quiet, muted styling — deliberately less prominent than a workspace row
	   so it reads as a divider. Same type size as items (Codex-style): hierarchy
	   comes from dimmed color and the air above each section, not font size. */
	.ws-header-toggle {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex: 1;
		min-width: 0;
		height: 2rem;
		padding: 0 0.5rem;
		border: none;
		background: none;
		cursor: pointer;
		font-size: 0.75rem;
		text-align: left;
		color: var(--app-fg-muted, #9ca3af);
		transition: color 0.1s;
	}

	.ws-header-toggle:hover {
		color: var(--app-fg, #6b7280);
	}

	.ws-header-chevron {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 0.875rem;
		height: 0.875rem;
		opacity: 0.8;
		transition: transform 0.1s;
	}

	.ws-header-count {
		font-variant-numeric: tabular-nums;
		font-size: 0.625rem;
		opacity: 0.7;
	}

	.ws-icon-toggle {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1rem;
		height: 1rem;
		cursor: pointer;
	}

	.ws-icon-folder {
		display: flex;
		transition: opacity 0.1s;
	}

	.ws-icon-chevron {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition:
			opacity 0.1s,
			transform 0.1s;
		color: var(--app-fg-subtle);
	}

	:global(.dark) .ws-icon-chevron {
		color: var(--app-fg-muted);
	}

	.ws-icon-toggle:hover .ws-icon-folder {
		opacity: 0;
	}

	.ws-icon-toggle:hover .ws-icon-chevron {
		opacity: 1;
	}

	.ws-chats {
		margin-top: 0.125rem;
		padding-bottom: 0.25rem;
	}

	/* Nest chats under the workspace label (align with the folder icon). */
	.ws-chats.nested {
		margin-left: 0.5rem;
		padding-left: 0.5rem;
	}

	.ws-chat-show-more {
		display: block;
		width: 100%;
		padding: 0.125rem 0.5rem;
		border: none;
		background: none;
		cursor: pointer;
		font-size: 0.6875rem;
		color: var(--app-fg-subtle);
		text-align: left;
		transition: color 0.1s;
	}

	.ws-chat-show-more:hover {
		color: var(--app-fg);
	}

	.ws-chat-loading {
		display: flex;
		gap: 0.25rem;
		padding: 0.375rem 0.5rem;
	}

	.ws-chat-loading-dot {
		width: 0.25rem;
		height: 0.25rem;
		border-radius: 50%;
		background: var(--app-fg-subtle);
		animation: dotPulse 1s ease-in-out infinite;
	}

	:global(.dark) .ws-chat-loading-dot {
		background: var(--app-fg-muted);
	}

	.ws-chat-loading-dot:nth-child(2) {
		animation-delay: 0.15s;
	}

	.ws-chat-loading-dot:nth-child(3) {
		animation-delay: 0.3s;
	}

	@keyframes dotPulse {
		0%,
		100% {
			opacity: 0.3;
		}
		50% {
			opacity: 1;
		}
	}
</style>
