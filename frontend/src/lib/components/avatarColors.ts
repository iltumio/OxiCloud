/**
 * Shared avatar colour buckets (daisyUI semantic tokens). The index comes from
 * `avatarColorIndex(id)` so the same user gets the same colour everywhere
 * (UserVignette, OwnerAvatarStack, AppShell …).
 */
export const AVATAR_BUCKET_CLASSES: readonly string[] = [
	'bg-primary text-primary-content',
	'bg-success text-success-content',
	'bg-warning text-warning-content',
	'bg-info text-info-content',
	'bg-secondary text-secondary-content'
] as const;

/** Class pair for a bucket index (see `avatarColorIndex`). */
export function avatarBucketClass(index: number): string {
	return AVATAR_BUCKET_CLASSES[index % AVATAR_BUCKET_CLASSES.length];
}
