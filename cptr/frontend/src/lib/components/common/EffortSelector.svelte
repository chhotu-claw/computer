<script lang="ts">
	import DropdownMenu from '../DropdownMenu.svelte';
	import { t } from '$lib/i18n';

	interface Props {
		/** '' / 'default' = no explicit override (button shows the resolved default). */
		selectedEffort: string;
		/** Effort configured as the model/global default; resolves what 'default' shows. */
		inheritedEffort?: string | null;
		/** No model selected → neutral, non-interactive. */
		disabled?: boolean;
		preferAbove?: boolean;
		align?: 'start' | 'end';
	}
	let {
		selectedEffort = $bindable(),
		inheritedEffort = null,
		disabled = false,
		preferAbove = true,
		align = 'end'
	}: Props = $props();

	let btnEl: HTMLButtonElement | undefined = $state();
	let open = $state(false);

	// Only real levels are pickable; 'default' (no override) sends nothing.
	const options = ['minimal', 'low', 'medium', 'high'];

	const optionLabel = (v: string) => $t(`effortSelector.${v}`);

	// What an un-overridden selector resolves to: configured default, else 'medium'
	// (the de-facto provider default for reasoning models).
	const resolvedDefault = $derived(
		inheritedEffort && options.includes(inheritedEffort) ? inheritedEffort : 'medium'
	);

	// The level shown/check-marked: the explicit override, or the resolved default.
	const activeEffort = $derived(
		selectedEffort && selectedEffort !== 'default' ? selectedEffort : resolvedDefault
	);

	const menuItems = $derived(
		options.map((v) => ({
			label: optionLabel(v),
			active: v === activeEffort,
			check: true,
			onclick: () => {
				selectedEffort = v;
				open = false;
			}
		}))
	);

	function toggle() {
		if (disabled) return;
		open = !open;
	}
</script>

<span class="relative inline-flex {open ? 'z-[1001]' : ''}">
	<button
		bind:this={btnEl}
		class="flex items-center gap-1 px-2 py-1 rounded-lg text-[0.6875rem] text-gray-400 dark:text-gray-500 transition-colors duration-100 {disabled
			? 'cursor-default'
			: 'hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'}"
		title={$t('effortSelector.title')}
		onclick={toggle}
	>
		<span class="truncate max-w-[8rem]"
			>{disabled ? $t('effortSelector.label') : optionLabel(activeEffort)}</span
		>
		{#if !disabled}
			<svg
				class="w-3 h-3 opacity-50"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="6 9 12 15 18 9" />
			</svg>
		{/if}
	</button>

	{#if open && btnEl && !disabled}
		<DropdownMenu
			items={menuItems}
			anchor={btnEl}
			onclose={() => (open = false)}
			{preferAbove}
			forceAbove={preferAbove}
			className="w-36"
			{align}
		/>
	{/if}
</span>
