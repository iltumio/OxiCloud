<script lang="ts">
	/**
	 * Identity chip for a user in share/recipient lists: avatar (uploaded photo
	 * or coloured initials), display name, email, and an internal-vs-external
	 * badge. Resolves the profile lazily via `/api/users/{id}` (cached) so
	 * external users show real details instead of a bare UUID. Falls back to a
	 * caller-supplied label/sublabel while resolving or when not visible.
	 */
	import Icon from '$lib/icons/Icon.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { resolveUser, type ResolvedUser } from '$lib/api/endpoints/users';
	import { userInitials, avatarColorIndex } from '$lib/utils/avatar';
	import { avatarBucketClass } from '$lib/components/avatarColors';

	interface Props {
		userId: string;
		fallbackLabel?: string;
		fallbackSublabel?: string;
	}
	let { userId, fallbackLabel, fallbackSublabel }: Props = $props();

	let resolved = $state<ResolvedUser | null>(null);
	$effect(() => {
		let alive = true;
		resolved = null;
		void resolveUser(userId).then((u) => {
			if (alive) resolved = u;
		});
		return () => {
			alive = false;
		};
	});

	const label = $derived(resolved?.name ?? fallbackLabel ?? userId);
	const email = $derived(resolved?.email || fallbackSublabel || '');
	const isExternal = $derived(resolved?.isExternal ?? false);
	const image = $derived(resolved?.image ?? null);
	const colorIndex = $derived(avatarColorIndex(userId));
	const initials = $derived(userInitials(label));
</script>

<span class="flex min-w-0 flex-1 items-center gap-2">
	<span class="relative shrink-0">
		{#if image}
			<img class="h-8 w-8 rounded-full object-cover" src={image} alt="" />
		{:else}
			<span
				class="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-xs font-bold {avatarBucketClass(
					colorIndex
				)}">{initials}</span
			>
		{/if}
		{#if isExternal}
			<span
				class="bg-base-100 text-base-content/60 absolute -right-[3px] -bottom-[3px] inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px]"
				title={t('share.externalUser', 'External user')}
			>
				<Icon name="building-circle-xmark" />
			</span>
		{/if}
	</span>
	<span class="flex min-w-0 flex-col">
		<span class="truncate">{label}</span>
		{#if email}<span class="text-base-content/60 truncate text-xs">{email}</span>{/if}
	</span>
</span>
