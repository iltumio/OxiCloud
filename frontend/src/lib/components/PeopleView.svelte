<script lang="ts">
	/**
	 * People (faces): a grid of identity clusters from `GET /api/people`; clicking
	 * a person shows their photos in the shared lightbox. Faces are detected and
	 * clustered server-side, so this view is read-mostly (list, drill-in, rename).
	 * Gated on `OXICLOUD_ENABLE_FACES` — when off the API 404s and we show a hint.
	 */
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PhotoLightbox from '$lib/components/PhotoLightbox.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import {
		fetchPeople,
		fetchPersonPhotos,
		renamePerson,
		type Person
	} from '$lib/api/endpoints/people';
	import { fileThumbnailUrl } from '$lib/api/endpoints/files';
	import type { FileItem } from '$lib/api/types';
	import { promptDialog } from '$lib/stores/dialogs.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { errorMessage } from '$lib/utils/errors';
	import { minimalPhotoItem } from '$lib/utils/media';
	import { onMount } from 'svelte';

	type View = 'list' | 'person';

	let view = $state<View>('list');
	let people = $state<Person[]>([]);
	let loading = $state(true);
	/** Set when the feature is unavailable (faces disabled) or the list errors. */
	let disabled = $state(false);

	// Drill-in state.
	let current = $state<{ id: string; name: string } | null>(null);
	let photos = $state<FileItem[]>([]);
	let lightbox = $state(-1);

	function personName(p: Person): string {
		return p.name || t('people.unnamed', 'Unnamed');
	}

	async function loadList() {
		loading = true;
		disabled = false;
		try {
			people = await fetchPeople();
		} catch {
			people = [];
			disabled = true;
		} finally {
			loading = false;
		}
	}

	async function openPerson(p: Person) {
		current = { id: p.id, name: personName(p) };
		view = 'person';
		photos = [];
		lightbox = -1;
		try {
			const ids = await fetchPersonPhotos(p.id);
			photos = ids.map(minimalPhotoItem);
		} catch {
			photos = [];
		}
	}

	function backToList() {
		view = 'list';
		current = null;
		lightbox = -1;
	}

	async function rename() {
		if (!current) return;
		const placeholder = t('people.unnamed', 'Unnamed');
		const value = current.name === placeholder ? '' : current.name;
		const next = await promptDialog({
			title: t('people.rename_title', 'Name this person'),
			message: t('people.name_label', 'Name'),
			defaultValue: value
		});
		if (next === null) return;
		const trimmed = next.trim();
		try {
			await renamePerson(current.id, trimmed || null);
			current = { id: current.id, name: trimmed || placeholder };
			// Keep the list in sync so a return trip shows the new name.
			people = people.map((p) => (p.id === current?.id ? { ...p, name: trimmed || undefined } : p));
		} catch (e) {
			// Surface the failure inline via the dialog's own error channel is not
			// available here; fall back to logging — rename is non-destructive.
			console.error('rename failed:', errorMessage(e));
		}
	}

	function onDeletePhoto(id: string) {
		photos = photos.filter((p) => p.id !== id);
	}

	onMount(loadList);
</script>

{#if loading}
	<p class="py-8 text-center text-base-content/60">{t('common.loading', 'Loading…')}</p>
{:else if disabled}
	<EmptyState icon="user-group" title={t('people.disabled', 'Face recognition is disabled')} />
{:else if view === 'list'}
	{#if people.length === 0}
		<EmptyState icon="user-group" title={t('people.empty', 'No people yet')} />
	{:else}
		<ul class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-4 p-4">
			{#each people as person (person.id)}
				<li>
					<button
						class="flex w-full cursor-pointer flex-col items-center gap-2 rounded-box border-0 bg-transparent p-2 text-base-content hover:bg-base-200"
						type="button"
						onclick={() => openPerson(person)}
					>
						<span
							class="grid h-22 w-22 place-items-center overflow-hidden rounded-full bg-base-200 text-2xl text-base-content/60"
						>
							{#if person.cover_file_id}
								<img
									class="h-full w-full object-cover"
									src={fileThumbnailUrl(person.cover_file_id, 'icon')}
									alt=""
									loading="lazy"
								/>
							{:else}
								<Icon name="user-group" />
							{/if}
						</span>
						<span class="max-w-full truncate text-sm">{personName(person)}</span>
						<span class="text-xs text-base-content/60">{person.face_count}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
{:else if current}
	<div class="flex items-center gap-3 p-4">
		<button
			class="btn btn-circle btn-ghost btn-sm"
			type="button"
			aria-label={t('people.back', 'Back')}
			onclick={backToList}
		>
			<Icon name="arrow-left" />
		</button>
		<h2 class="m-0 min-w-0 flex-1 truncate text-xl font-semibold text-base-content">
			{current.name}
		</h2>
		<button
			class="btn btn-circle btn-ghost btn-sm"
			type="button"
			aria-label={t('people.rename_title', 'Name this person')}
			onclick={rename}
		>
			<Icon name="pen" />
		</button>
	</div>

	<ul class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-1 px-4 pb-4">
		{#each photos as photo, i (photo.id)}
			<li class="relative aspect-square overflow-hidden rounded-sm bg-base-200">
				<button
					class="block h-full w-full cursor-pointer border-0 bg-transparent p-0"
					data-testid="people-photo-open"
					onclick={() => (lightbox = i)}
				>
					<img
						class="block h-full w-full object-cover"
						src={fileThumbnailUrl(photo.id, 'preview')}
						alt=""
						loading="lazy"
						decoding="async"
					/>
				</button>
			</li>
		{/each}
	</ul>

	<PhotoLightbox items={photos} bind:index={lightbox} onDelete={onDeletePhoto} />
{/if}
