<script lang="ts">
	import FileBrowser from './FileBrowser.svelte';
	import { fileSidebarOpen, fileSidebarWidth } from '$lib/stores';
	import { t } from '$lib/i18n';

	const MIN_WIDTH = 220;
	const MAX_WIDTH = 560;
	const DEFAULT_WIDTH = 300;
	let isResizing = $state(false);

	function startResize(e: PointerEvent) {
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
		isResizing = true;
		const startX = e.clientX;
		const startWidth = $fileSidebarWidth;
		const onMove = (ev: PointerEvent) => {
			// Right-docked: dragging left widens the panel.
			const delta = startX - ev.clientX;
			const newWidth = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta)));
			fileSidebarWidth.set(newWidth);
		};
		const onUp = () => {
			isResizing = false;
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	}
</script>

{#if $fileSidebarOpen}
	<!-- Mobile backdrop -->
	<button
		class="fixed inset-0 bg-black/50 z-40 cursor-default md:hidden"
		onclick={() => fileSidebarOpen.set(false)}
		aria-label={$t('sidebar.closeSidebar')}
	></button>

	<aside class="file-sidebar" style="--fsw: {$fileSidebarWidth}px;">
		<!-- Resize handle (md+ only), on the left edge since the panel is right-docked -->
		<div
			class="resize-handle"
			class:active={isResizing}
			role="separator"
			aria-orientation="vertical"
			onpointerdown={startResize}
			ondblclick={() => fileSidebarWidth.set(DEFAULT_WIDTH)}
		></div>
		<FileBrowser />
	</aside>
{/if}

<style>
	.file-sidebar {
		position: fixed;
		right: 0;
		top: 0;
		bottom: 0;
		width: 300px;
		max-width: 85vw;
		z-index: 50;
		display: flex;
		flex-direction: column;
		background: var(--app-bg);
		border-left: 1px solid var(--color-gray-200);
	}

	@media (min-width: 768px) {
		.file-sidebar {
			position: relative;
			z-index: auto;
			width: var(--fsw, 300px);
		}
	}

	.resize-handle {
		display: none;
	}

	@media (min-width: 768px) {
		.resize-handle {
			display: block;
			position: absolute;
			left: -3px;
			top: 0;
			bottom: 0;
			width: 6px;
			cursor: col-resize;
			z-index: 10;
			transition: background 0.15s;
		}

		.resize-handle:hover,
		.resize-handle.active {
			background: rgba(150, 150, 150, 0.12);
		}
	}
</style>
