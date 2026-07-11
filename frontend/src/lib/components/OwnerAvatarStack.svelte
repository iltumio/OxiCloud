<script lang="ts">
	import Icon from '$lib/icons/Icon.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { resolveRecipient } from '$lib/api/endpoints/recipients';
	import { resolveUser, type ResolvedUser } from '$lib/api/endpoints/users';
	import { userInitials, avatarColorIndex } from '$lib/utils/avatar';
	import { avatarBucketClass } from '$lib/components/avatarColors';
	import type { DriveMember } from '$lib/api/types';

	interface Props {
		members: DriveMember[];
		max?: number;
	}
	let { members, max = 6 }: Props = $props();

	// Render only Owner-role grants and exclude token subjects (they can't
	// own a drive per the service contract; defensive filter so a stray
	// row from a future role doesn't render as an avatar).
	const owners = $derived(
		members.filter(
			(m) => m.role === 'owner' && (m.subject.type === 'user' || m.subject.type === 'group')
		)
	);

	const shown = $derived(owners.slice(0, max));
	const overflow = $derived(Math.max(0, owners.length - shown.length));

	// Per-user profile cache (image + email + real name). The cache itself
	// lives in `resolveUser`; this state just mirrors what we've fetched so
	// reactive `$derived` recomputes when a lookup lands.
	let resolved = $state<Record<string, ResolvedUser | null>>({});

	$effect(() => {
		// Refresh on every membership change. `resolveUser` dedupes
		// concurrent calls and caches per id, so this is cheap when the
		// same id reappears across rows.
		const users = owners.filter((m) => m.subject.type === 'user');
		for (const m of users) {
			if (m.subject.id in resolved) continue;
			void resolveUser(m.subject.id).then((u) => {
				resolved = { ...resolved, [m.subject.id]: u };
			});
		}
	});

	function nameFor(m: DriveMember): string {
		if (m.subject.type === 'group') return resolveRecipient('group', m.subject.id).label;
		return resolved[m.subject.id]?.name ?? resolveRecipient('user', m.subject.id).label;
	}

	function imageFor(m: DriveMember): string | null {
		if (m.subject.type !== 'user') return null;
		return resolved[m.subject.id]?.image ?? null;
	}

	function isExternalFor(m: DriveMember): boolean {
		if (m.subject.type !== 'user') return false;
		return resolved[m.subject.id]?.isExternal ?? false;
	}

	// "Name — email" tooltip; group falls back to label only.
	function titleFor(m: DriveMember): string {
		const name = nameFor(m);
		if (m.subject.type === 'group') return name;
		const email = resolved[m.subject.id]?.email ?? '';
		return email ? `${name} — ${email}` : name;
	}

	// Shared chip frame: 1.75rem circle with a surface-coloured ring so
	// overlapped chips read as a stack.
	const chipClass =
		'border-base-100 inline-flex h-7 w-7 select-none items-center justify-center overflow-hidden rounded-full border-2 object-cover text-[0.7rem] font-semibold';
</script>

{#if owners.length === 0}
	<span class="text-base-content/60 text-[0.8125rem] italic"
		>{t('admin.drive_no_owners', 'No owners')}</span
	>
{:else}
	<ul
		class="m-0 inline-flex list-none p-0 -space-x-2"
		aria-label={t('admin.drive_owners_aria', 'Drive owners')}
	>
		{#each shown as m (`${m.subject.type}-${m.subject.id}`)}
			{@const title = titleFor(m)}
			{@const image = imageFor(m)}
			<li class="relative" {title}>
				{#if m.subject.type === 'group'}
					<span class="{chipClass} bg-base-200 text-base-content">
						<Icon name="users" />
					</span>
				{:else if image}
					<img class={chipClass} src={image} alt="" />
				{:else}
					<span class="{chipClass} {avatarBucketClass(avatarColorIndex(m.subject.id))}">
						{userInitials(nameFor(m))}
					</span>
				{/if}
				{#if isExternalFor(m)}
					<span
						class="bg-base-100 text-base-content/60 absolute -right-0.5 -bottom-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[0.55rem]"
						title={t('share.externalUser', 'External user')}
					>
						<Icon name="building-circle-xmark" />
					</span>
				{/if}
			</li>
		{/each}
		{#if overflow > 0}
			<li class="relative" title={owners.slice(max).map(titleFor).join('\n')}>
				<span class="{chipClass} bg-base-200 text-base-content text-[0.65rem]">
					+{overflow}
				</span>
			</li>
		{/if}
	</ul>
{/if}
