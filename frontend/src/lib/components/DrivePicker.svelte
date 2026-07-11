<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	import type { Drive } from '$lib/api/types';
	import Icon from '$lib/icons/Icon.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { drives as drivesStore, driveIcon } from '$lib/stores/drives.svelte';
	import { formatBytes } from '$lib/utils/format';

	interface Props {
		onnavigate?: () => void;
	}
	let { onnavigate }: Props = $props();

	// URL of `/files/<first>/<second>/...` — the first segment identifies the
	// drive root the user navigated through. We use it to highlight the active
	// drive in the picker. Deep-linking to a descendant folder of a non-default
	// drive bypasses this highlight (the URL's leading segment is the deep
	// folder id, not the drive root); that's acceptable — D2 can refine this
	// by resolving `folder.drive_id` server-side when the gap matters.
	const firstFilesSegment = $derived.by(() => {
		const m = /^\/files\/([^/]+)/.exec(page.url.pathname);
		return m ? m[1] : null;
	});

	// Sorting: default-personal drive first, then secondary personals, then
	// shared. Within each group, by name. Picker UX puts "home" at the top so
	// the common case is one click.
	const rank = (d: Drive) => (d.default_for_user ? 0 : d.kind === 'personal' ? 1 : 2);
	const sortedDrives = $derived(
		drivesStore.drives.toSorted((a, b) => {
			const r = rank(a) - rank(b);
			return r !== 0 ? r : a.name.localeCompare(b.name);
		})
	);

	function isActive(d: Drive): boolean {
		return firstFilesSegment === d.root_folder_id;
	}

	function pctUsed(d: Drive): number | null {
		if (!d.quota_bytes || d.quota_bytes <= 0) return null;
		return Math.min(100, (d.used_bytes / d.quota_bytes) * 100);
	}

	async function open(d: Drive) {
		onnavigate?.();
		// Remember which drive root the user picked so a later click on the
		// sidebar "Files" link (which goes to bare `/files`) returns here
		// instead of always bouncing to the default drive.
		try {
			localStorage.setItem('oxi-last-drive-root', d.root_folder_id);
		} catch {
			/* private mode / quota — silently fall back to default */
		}
		await goto(resolve(`/files/${d.root_folder_id}`));
	}

	onMount(() => {
		void drivesStore.load();
	});
</script>

<!-- Only show the drive switcher when there's an actual choice to make. With a
     single drive (the default personal one) the picker just repeats "Personal"
     under the Files nav row, so hide it; it reappears the moment a second drive
     (e.g. a shared one created from the admin Drives tab) exists.

     Rendered as nested children under the "Files" nav item — no own border or
     title; visual nesting via start padding aligned to the parent icon. -->
{#if drivesStore.loaded && drivesStore.drives.length > 1}
	<ul class="m-0 mb-1 flex list-none flex-col p-0" aria-label={t('drive.picker', 'Drives')}>
		{#each sortedDrives as d (d.id)}
			<!-- Each row is a small grid: drive button + gear icon on the top line,
			     optional usage bar spanning both columns below. Active drive: just a
			     text-emphasis shift — the parent "Files" row already carries the
			     active background. -->
			<li class="grid grid-cols-[1fr_auto] items-center">
				<button
					type="button"
					class="flex cursor-pointer items-center gap-1.5 rounded-lg py-1 pe-2 ps-8 text-start text-sm {isActive(
						d
					)
						? 'font-semibold text-base-content'
						: 'text-base-content/70'} hover:bg-base-content/10 hover:text-base-content"
					onclick={() => open(d)}
					title={pctUsed(d) !== null
						? `${d.name} — ${formatBytes(d.used_bytes)} / ${formatBytes(d.quota_bytes ?? 0)}`
						: `${d.name} — ${formatBytes(d.used_bytes)}`}
				>
					<Icon name={driveIcon(d)} />
					<span class="min-w-0 flex-1 truncate">{d.name}</span>
				</button>
				<a
					href={resolve(`/config/drive/${d.id}`)}
					class="inline-flex items-center justify-center px-3 py-1 text-base-content/50 no-underline hover:text-base-content"
					title={t('drive.settings_aria', 'Drive settings')}
					aria-label={t('drive.settings_aria', 'Drive settings')}
					onclick={() => onnavigate?.()}
				>
					<Icon name="cog" />
				</a>
				{#if pctUsed(d) !== null}
					<!-- Mini usage bar tucked under the row, indented to align with the
					     name, spans both grid columns so the gear sits above its edge. -->
					<div
						class="col-span-full mb-1 me-4 ms-8 h-[3px] overflow-hidden rounded-full bg-base-content/15"
						role="progressbar"
						aria-valuenow={Math.round(pctUsed(d) ?? 0)}
						aria-valuemin="0"
						aria-valuemax="100"
						aria-label={t('drive.usage_aria', 'Drive usage')}
					>
						<div
							class="h-full bg-primary transition-[width] duration-200"
							style:width="{pctUsed(d)}%"
						></div>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
