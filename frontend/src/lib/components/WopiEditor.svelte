<script lang="ts">
	import { errorToast } from '$lib/utils/errors';
	import { getEditorUrlWithFallback } from '$lib/api/endpoints/wopi';
	import Icon from '$lib/icons/Icon.svelte';
	import { t } from '$lib/i18n/index.svelte';

	interface Props {
		open: boolean;
		fileId: string | null;
		fileName: string;
		action?: 'edit' | 'view';
		onclose?: () => void;
	}

	let { open = $bindable(false), fileId, fileName, action = 'edit', onclose }: Props = $props();

	let form = $state<HTMLFormElement | null>(null);
	let editorUrl = $state('');
	let token = $state('');
	let tokenTtl = $state('');
	let loading = $state(false);

	function close() {
		open = false;
		editorUrl = '';
		onclose?.();
	}

	function onKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') close();
	}

	// The editor iframe posts status messages (Collabora / OnlyOffice WOPI
	// protocol). We drop the spinner once it loads, and close the host modal
	// when the editor's own close button fires UI_Close / Document close.
	function onMessage(e: MessageEvent) {
		if (!open) return;
		let data: Record<string, unknown>;
		try {
			data = JSON.parse(typeof e.data === 'string' ? e.data : '') as Record<string, unknown>;
		} catch {
			return; // not a JSON message — ignore
		}
		const msgId = String(data.MessageId ?? data.messageId ?? '');
		if (msgId === 'UI_Close' || msgId === 'close') {
			close();
		} else if (msgId === 'App_LoadingStatus') {
			const values = data.Values as { Status?: string } | undefined;
			const status = values?.Status;
			if (status === 'Document_Loaded' || status === 'Frame_Ready') {
				loading = false;
			}
		}
	}

	// When opened, fetch the editor URL + token, then submit the (hidden) form
	// into the iframe — this is the WOPI host-page POST handshake.
	$effect(() => {
		if (!open || !fileId) return;
		loading = true;
		editorUrl = '';
		getEditorUrlWithFallback(fileId, fileName, action)
			.then((data) => {
				editorUrl = data.editor_url;
				token = data.access_token;
				tokenTtl = String(data.access_token_ttl);
				// Submit on the next microtask once the form has the values bound.
				queueMicrotask(() => form?.submit());
			})
			.catch((e) => {
				errorToast(e);
				close();
			})
			.finally(() => (loading = false));
	});
</script>

<svelte:window onkeydown={onKeydown} onmessage={onMessage} />

{#if open}
	<div
		class="fixed inset-0 z-[1100] flex flex-col bg-base-100"
		role="dialog"
		data-testid="wopi-editor-dialog"
		aria-modal="true"
		aria-label={fileName}
	>
		<header
			class="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-base-300 bg-base-200 px-4"
		>
			<span class="truncate font-medium text-base-content">{fileName}</span>
			<button
				class="btn btn-circle btn-ghost btn-sm"
				data-testid="wopi-editor-close-btn"
				aria-label={t('common.close', 'Close')}
				onclick={close}
			>
				<Icon name="times" />
			</button>
		</header>
		<div class="relative flex-1">
			{#if loading}
				<p class="absolute inset-0 grid place-items-center text-base-content/60">
					{t('common.loading', 'Loading…')}
				</p>
			{/if}
			{#if editorUrl}
				<form bind:this={form} action={editorUrl} method="post" target="wopi_frame" class="hidden">
					<input
						type="hidden"
						name="access_token"
						value={token}
						data-testid="wopi-editor-access-token-input"
					/>
					<input
						type="hidden"
						name="access_token_ttl"
						value={tokenTtl}
						data-testid="wopi-editor-access-token-ttl-input"
					/>
				</form>
			{/if}
			<iframe
				name="wopi_frame"
				title={t('files.editor', 'Document editor')}
				class="h-full w-full border-0"
				allow="clipboard-read; clipboard-write"
				allowfullscreen
				sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation allow-popups-to-escape-sandbox"
			></iframe>
		</div>
	</div>
{/if}
