<script lang="ts">
	/**
	 * Reusable list-of-policy-toggles.
	 *
	 * Consumed by:
	 *   - Admin "Manage policies" modal — `readonly=false`, admin edits the
	 *     bound `values` in place.
	 *   - Drive settings page (`/config/drive/{uuid}`) — `readonly=true`,
	 *     drive members read the currently-in-effect state.
	 *
	 * The shared `policyDefs` in `$lib/utils/drivePolicies` is the single
	 * source of truth for label + help text + implied-by relations. Adding
	 * a policy is one push there + one row in `DrivePolicies` in
	 * `types.ts`; the two consuming surfaces update automatically.
	 */
	import type { DrivePoliciesPartial } from '$lib/api/types';
	import { isPolicyImplied, policyDefs, type PolicyDef } from '$lib/utils/drivePolicies';

	interface Props {
		/** Current values displayed on each row. */
		values: Required<DrivePoliciesPartial>;
		/** `true` = display only, disables the checkboxes so members can see the
		 *  live state without a mutation affordance. When `true`, `onchange`
		 *  is ignored — the component never emits. */
		readonly?: boolean;
		/** Additional disable signal (used by the admin modal during save). */
		busy?: boolean;
		/** Prefix for the `data-testid` on each checkbox
		 *  (e.g. `admin-policy-…` on the admin page, `drive-policy-…` on
		 *  the config page). Keeps test selectors stable per surface. */
		testIdPrefix?: string;
		/** Fired when the user toggles a checkbox (mutable surface only).
		 *  The parent owns the storage and applies the change. Not called
		 *  in `readonly` mode. */
		onchange?: (key: PolicyDef['key'], next: boolean) => void;
	}

	let {
		values,
		readonly = false,
		busy = false,
		testIdPrefix = 'policy',
		onchange
	}: Props = $props();
</script>

<ul class="m-0 flex list-none flex-col gap-2 p-0">
	{#each policyDefs as def (def.key)}
		{@const implied = isPolicyImplied(def, values)}
		<!-- Implied rows are dimmed: the gate is already covered by a broader
		     policy (e.g. forbid_public_links when forbid_sharing is on). The
		     stored value is preserved for when the parent policy is relaxed. -->
		<li class="border-base-300 rounded-lg border p-2 {implied ? 'opacity-55' : ''}">
			<label class="m-0 flex flex-col gap-1 {implied ? 'cursor-not-allowed' : 'cursor-pointer'}">
				<span class="flex min-w-0 items-center gap-2">
					<input
						type="checkbox"
						class="checkbox checkbox-sm shrink-0"
						data-testid={`${testIdPrefix}-${def.key}`}
						checked={values[def.key]}
						disabled={readonly || busy || implied}
						onchange={(e) => onchange?.(def.key, (e.currentTarget as HTMLInputElement).checked)}
					/>
					<span class="font-semibold">{def.label()}</span>
				</span>
				<span class="text-base-content/60 pl-7 text-sm">
					{def.help()}
					{#if implied && def.impliedHint}
						<span class="mt-1 block italic">{def.impliedHint()}</span>
					{/if}
				</span>
			</label>
		</li>
	{/each}
</ul>
