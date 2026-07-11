<script lang="ts">
	import { errorMessage, errorToast } from '$lib/utils/errors';
	import {
		clearPluginLogs,
		createUser,
		deletePlugin,
		deleteUser,
		generateEncryptionKey,
		getDashboard,
		getMigration,
		getOidcSettings,
		getPluginLogs,
		getPluginRetention,
		getSmtpInfo,
		getStorageSettings,
		installPlugin,
		listPlugins,
		listUsers,
		migrationAction,
		reextractAudioMetadata,
		reextractPhotoMetadata,
		resetUserPassword,
		saveOidc,
		savePluginRetention,
		saveStorage,
		sendSmtpTest,
		setPluginEnabled,
		setRegistrationEnabled,
		setUserActive,
		setUserQuota,
		setUserRole,
		testOidc,
		testStorage,
		verifyMigration,
		type AdminDashboard,
		type GeneratedKey,
		type MigrationStatus,
		type MigrationVerifyResult,
		type OidcSettings,
		type OidcTestResult,
		type PluginInfo,
		type PluginLogEntry,
		type PluginRetention,
		type ReextractResult,
		addDriveMemberAdmin,
		deleteDriveAdmin,
		listAllDrives,
		listDriveMembersAdmin,
		removeDriveMemberAdmin,
		type SmtpInfo,
		type SmtpTestResult,
		type StorageSettings,
		type StorageTestResult
	} from '$lib/api/endpoints/admin';
	import { createDrive, updateDrivePolicies } from '$lib/api/endpoints/drives';
	import {
		ensureResolvers,
		resolveRecipient,
		searchRecipients,
		type Recipient
	} from '$lib/api/endpoints/recipients';
	import type {
		Drive,
		DriveMember,
		DrivePolicies,
		DrivePoliciesPartial,
		User
	} from '$lib/api/types';
	import Icon from '$lib/icons/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import OwnerAvatarStack from '$lib/components/OwnerAvatarStack.svelte';
	import PolicyList from '$lib/components/PolicyList.svelte';
	import UserVignette from '$lib/components/UserVignette.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { readPolicyBool } from '$lib/utils/drivePolicies';
	import { session } from '$lib/stores/session.svelte';
	import { drives as drivesStore } from '$lib/stores/drives.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { formatBytes } from '$lib/utils/format';

	const PAGE_SIZE = 25;
	const LOGS_PAGE_SIZE = 50;

	/** The signed-in admin's id — used to disable destructive actions on self. */
	const currentAdminId = $derived(session.user?.id ?? '');

	/**
	 * Render an ISO timestamp as a coarse relative time ("3 min ago"). Ported
	 * from formatRelativeTime in static/js/core/formatters.js; an empty/missing
	 * value reads as "Never" (matching the OLD admin user table).
	 */
	function timeAgo(dateStr?: string | null): string {
		if (!dateStr) return t('admin.never', 'Never');
		const then = new Date(dateStr).getTime();
		if (!Number.isFinite(then)) return t('admin.never', 'Never');
		const secs = Math.round((Date.now() - then) / 1000);
		if (secs < 60) return t('admin.time_just_now', 'just now');
		const mins = Math.round(secs / 60);
		if (mins < 60) return t('admin.time_min_ago', { n: mins }, '{{n}} min ago');
		const hours = Math.round(mins / 60);
		if (hours < 24) return t('admin.time_hour_ago', { n: hours }, '{{n}} h ago');
		const days = Math.round(hours / 24);
		if (days < 30) return t('admin.time_day_ago', { n: days }, '{{n}} d ago');
		return new Date(dateStr).toLocaleDateString();
	}

	/** Quota unit options (bytes per unit) for the quota/create modals. */
	const QUOTA_UNITS = [
		{ value: 1024 ** 2, label: 'MB' },
		{ value: 1024 ** 3, label: 'GB' },
		{ value: 1024 ** 4, label: 'TB' }
	] as const;

	/* ── Styled confirm modal (replaces native confirm) ── */
	let confirmState = $state<{ message: string; resolve: (ok: boolean) => void } | null>(null);
	function showConfirm(message: string): Promise<boolean> {
		return new Promise((resolve) => {
			confirmState = { message, resolve };
		});
	}
	function resolveConfirm(ok: boolean) {
		confirmState?.resolve(ok);
		confirmState = null;
	}

	type Tab = 'dashboard' | 'users' | 'drives' | 'plugins' | 'oidc' | 'storage' | 'smtp';
	let tab = $state<Tab>('dashboard');

	// Dashboard
	let dashboard = $state<AdminDashboard | null>(null);
	let dashboardError = $state<string | null>(null);

	// SMTP
	let smtp = $state<SmtpInfo | null>(null);
	let smtpTo = $state('');
	let smtpResult = $state<SmtpTestResult | null>(null);
	let smtpSending = $state(false);

	async function loadDashboard() {
		dashboardError = null;
		try {
			dashboard = await getDashboard();
		} catch (e) {
			dashboardError = errorMessage(e);
		}
	}

	async function toggleRegistration(enabled: boolean) {
		try {
			await setRegistrationEnabled(enabled);
			if (dashboard) dashboard.registration_enabled = enabled;
		} catch (e) {
			reportError(e);
			await loadDashboard();
		}
	}

	async function loadSmtp() {
		try {
			smtp = await getSmtpInfo();
		} catch (e) {
			reportError(e);
		}
	}

	async function runSmtpTest() {
		if (!smtpTo.trim()) return;
		smtpSending = true;
		smtpResult = null;
		try {
			smtpResult = await sendSmtpTest(smtpTo.trim());
		} catch (e) {
			smtpResult = { success: false, message: errorMessage(e) };
		} finally {
			smtpSending = false;
		}
	}

	// OIDC
	let oidc = $state<(OidcSettings & { client_secret?: string }) | null>(null);
	let oidcTest = $state<OidcTestResult | null>(null);
	let oidcMsg = $state<{ text: string; ok: boolean } | null>(null);
	let oidcSaving = $state(false);

	async function loadOidc() {
		try {
			oidc = await getOidcSettings();
		} catch (e) {
			oidcMsg = { text: errorMessage(e), ok: false };
		}
	}
	async function runOidcTest() {
		if (!oidc?.issuer_url) return;
		oidcTest = await testOidc(oidc.issuer_url);
		if (oidcTest.success && oidcTest.provider_name_suggestion && !oidc.provider_name) {
			oidc.provider_name = oidcTest.provider_name_suggestion;
		}
	}
	async function doSaveOidc() {
		if (!oidc) return;
		oidcSaving = true;
		oidcMsg = null;
		try {
			await saveOidc({
				enabled: oidc.enabled,
				issuer_url: oidc.issuer_url.trim(),
				client_id: oidc.client_id.trim(),
				client_secret: oidc.client_secret || null,
				scopes: oidc.scopes || null,
				auto_provision: oidc.auto_provision,
				admin_groups: oidc.admin_groups || null,
				disable_password_login: oidc.disable_password_login,
				provider_name: oidc.provider_name || null
			});
			oidcMsg = { text: t('admin.settings_saved_ok', 'Settings saved.'), ok: true };
		} catch (e) {
			oidcMsg = { text: errorMessage(e), ok: false };
		} finally {
			oidcSaving = false;
		}
	}

	// Storage
	const STORAGE_PRESETS: Record<string, { endpoint: string; region: string; pathStyle: boolean }> =
		{
			custom: { endpoint: '', region: '', pathStyle: false },
			aws: { endpoint: '', region: 'us-east-1', pathStyle: false },
			backblaze: {
				endpoint: 'https://s3.{region}.backblazeb2.com',
				region: 'us-west-004',
				pathStyle: false
			},
			'cloudflare-r2': {
				endpoint: 'https://{accountId}.r2.cloudflarestorage.com',
				region: 'auto',
				pathStyle: true
			},
			minio: { endpoint: 'http://localhost:9000', region: 'us-east-1', pathStyle: true },
			digitalocean: {
				endpoint: 'https://{region}.digitaloceanspaces.com',
				region: 'nyc3',
				pathStyle: false
			},
			wasabi: {
				endpoint: 'https://s3.{region}.wasabisys.com',
				region: 'us-east-1',
				pathStyle: false
			}
		};
	let storage = $state<StorageSettings | null>(null);
	let sForm = $state({
		backend: 'local',
		preset: 'custom',
		endpoint: '',
		bucket: '',
		region: '',
		accessKey: '',
		secretKey: '',
		pathStyle: false
	});
	let storageMsg = $state<{ text: string; ok: boolean } | null>(null);
	let storageBusy = $state(false);

	async function loadStorage() {
		try {
			storage = await getStorageSettings();
			sForm = {
				backend: storage.backend ?? 'local',
				preset: 'custom',
				endpoint: storage.s3_endpoint_url ?? '',
				bucket: storage.s3_bucket ?? '',
				region: storage.s3_region ?? '',
				accessKey: '',
				secretKey: '',
				pathStyle: storage.s3_force_path_style ?? false
			};
		} catch (e) {
			storageMsg = { text: errorMessage(e), ok: false };
		}
	}
	function applyPreset() {
		const p = STORAGE_PRESETS[sForm.preset];
		if (!p) return;
		if (p.endpoint) sForm.endpoint = p.endpoint;
		if (p.region) sForm.region = p.region;
		sForm.pathStyle = p.pathStyle;
	}
	function storageBody() {
		return {
			backend: sForm.backend,
			s3_endpoint_url: sForm.endpoint.trim() || null,
			s3_bucket: sForm.bucket.trim() || null,
			s3_region: sForm.region.trim() || null,
			s3_access_key: sForm.accessKey || null,
			s3_secret_key: sForm.secretKey || null,
			s3_force_path_style: sForm.pathStyle
		};
	}
	async function doSaveStorage() {
		storageBusy = true;
		storageMsg = null;
		try {
			await saveStorage(storageBody());
			storageMsg = { text: t('admin.storage_saved', 'Storage settings saved.'), ok: true };
			await loadStorage();
		} catch (e) {
			storageMsg = { text: errorMessage(e), ok: false };
		} finally {
			storageBusy = false;
		}
	}
	async function doTestStorage() {
		storageBusy = true;
		storageMsg = null;
		try {
			const r: StorageTestResult = await testStorage(storageBody());
			const ok = r.connected ?? r.success ?? false;
			if (ok) {
				let text = t('admin.storage_test_success', 'Connection successful');
				if (r.backend_type) text += ` (${r.backend_type})`;
				if (r.available_bytes != null)
					text += ` — ${formatBytes(r.available_bytes)} ${t('admin.available', 'available')}`;
				storageMsg = { text, ok: true };
			} else {
				storageMsg = {
					text: `${t('admin.storage_test_failure', 'Connection failed')}: ${r.message ?? ''}`,
					ok: false
				};
			}
		} catch (e) {
			storageMsg = { text: errorMessage(e), ok: false };
		} finally {
			storageBusy = false;
		}
	}

	// Migration
	let migration = $state<MigrationStatus | null>(null);
	let migrationTimer: ReturnType<typeof setInterval> | null = null;

	function stopMigrationPoll() {
		if (migrationTimer) {
			clearInterval(migrationTimer);
			migrationTimer = null;
		}
	}
	async function loadMigration() {
		try {
			migration = await getMigration();
			if (migration.status === 'running') {
				if (!migrationTimer) migrationTimer = setInterval(loadMigration, 5000);
			} else {
				stopMigrationPoll();
			}
		} catch {
			stopMigrationPoll();
		}
	}
	async function doMigration(action: 'start' | 'pause' | 'resume' | 'complete') {
		try {
			await migrationAction(action);
			await loadMigration();
		} catch (e) {
			reportError(e);
		}
	}

	// Migration integrity verification (separate result panel).
	let verifyResult = $state<MigrationVerifyResult | null>(null);
	let verifyError = $state<string | null>(null);
	let verifying = $state(false);
	async function doVerify() {
		verifying = true;
		verifyResult = null;
		verifyError = null;
		try {
			verifyResult = await verifyMigration(100);
		} catch (e) {
			verifyError = errorMessage(e);
		} finally {
			verifying = false;
		}
	}
	const migrationPct = $derived(
		migration && migration.total_blobs > 0
			? Math.round((migration.migrated_blobs / migration.total_blobs) * 100)
			: 0
	);
	/** Estimated minutes remaining, derived from throughput + average blob size. */
	const migrationEtaMin = $derived.by(() => {
		const m = migration;
		if (!m || m.status !== 'running' || !m.throughput_bytes_per_sec) return null;
		const remaining = m.total_blobs - m.migrated_blobs;
		if (remaining <= 0 || m.migrated_blobs <= 0) return null;
		const avgBlobSize = m.migrated_bytes / m.migrated_blobs;
		const etaSecs = (remaining * avgBlobSize) / m.throughput_bytes_per_sec;
		return Math.ceil(etaSecs / 60);
	});

	// Plugin logs
	let logsPlugin = $state<PluginInfo | null>(null);
	let logs = $state<PluginLogEntry[]>([]);
	let logsLevel = $state('');
	let logsSearch = $state('');
	let logsLoading = $state(false);
	let logsPage = $state(0);
	let logsTotal = $state(0);
	let logsLive = $state(true);
	let logStream: EventSource | null = null;

	/** Best-effort message text across the persisted (`msg`) and legacy shapes. */
	function logMsg(e: PluginLogEntry): string {
		return e.msg ?? e.message ?? '';
	}
	/** Kind column: outcome entries surface their reason, others read "log". */
	function logKind(e: PluginLogEntry): string {
		return e.kind === 'outcome' ? (e.reason ?? 'outcome') : 'log';
	}

	function stopLogStream() {
		if (logStream) {
			logStream.close();
			logStream = null;
		}
	}

	/** Open the SSE live tail for the current plugin (no-op when Live is off). */
	function startLogStream() {
		stopLogStream();
		if (!logsPlugin || !logsLive) return;
		const es = new EventSource(
			`/api/admin/plugins/${encodeURIComponent(logsPlugin.id)}/logs/stream`,
			{ withCredentials: true }
		);
		es.addEventListener('message', (ev) => {
			try {
				onLiveLogEntry(JSON.parse(ev.data) as PluginLogEntry);
			} catch {
				/* ignore malformed frames */
			}
		});
		// Fell behind the broadcast buffer — resync from the server.
		es.addEventListener('lagged', () => void loadLogs());
		logStream = es;
	}

	/**
	 * Prepend a streamed entry, but only on the newest page and when it passes
	 * the active filter — so the live tail never fights pagination.
	 */
	function onLiveLogEntry(entry: PluginLogEntry) {
		if (logsPage !== 0) return;
		if (logsLevel && (entry.level ?? '').toLowerCase() !== logsLevel.toLowerCase()) return;
		if (logsSearch && !logMsg(entry).toLowerCase().includes(logsSearch.toLowerCase())) return;
		logs = [entry, ...logs].slice(0, LOGS_PAGE_SIZE);
		logsTotal += 1;
	}

	function toggleLive() {
		if (logsLive) startLogStream();
		else stopLogStream();
	}

	function logsPrev() {
		if (logsPage > 0) {
			logsPage--;
			void loadLogs();
		}
	}
	function logsNext() {
		if ((logsPage + 1) * LOGS_PAGE_SIZE < logsTotal) {
			logsPage++;
			void loadLogs();
		}
	}

	// Plugin detail (metadata + retention) — opened alongside logs
	let retention = $state<PluginRetention | null>(null);
	let retentionDays = $state(0);
	let retentionMb = $state(0);
	let retentionMsg = $state<string | null>(null);

	async function openLogs(p: PluginInfo) {
		logsPlugin = p;
		retention = null;
		retentionMsg = null;
		logsPage = 0;
		logsLevel = '';
		logsSearch = '';
		await Promise.all([loadLogs(), loadRetention(p.id)]);
		startLogStream();
	}

	function closeLogs() {
		stopLogStream();
		logsPlugin = null;
		logs = [];
		logsTotal = 0;
		logsPage = 0;
	}

	/** Reset to the first page (filter changed) then reload. */
	function reloadLogsFromStart() {
		logsPage = 0;
		void loadLogs();
	}
	async function loadRetention(id: string) {
		try {
			retention = await getPluginRetention(id);
			if (retention) {
				retentionDays = retention.retention_days;
				retentionMb = Math.round(retention.max_bytes / (1024 * 1024));
			}
		} catch {
			/* retention is optional — leave unset on error */
		}
	}
	async function saveRetention() {
		if (!logsPlugin) return;
		retentionMsg = null;
		if (
			!Number.isFinite(retentionDays) ||
			retentionDays < 0 ||
			!Number.isFinite(retentionMb) ||
			retentionMb < 0
		) {
			retentionMsg = t('admin.plugins_retention_invalid', 'Enter non-negative numbers.');
			return;
		}
		try {
			await savePluginRetention(logsPlugin.id, {
				retention_days: Math.round(retentionDays),
				max_bytes: Math.round(retentionMb) * 1024 * 1024
			});
			retentionMsg = t('admin.plugins_retention_saved', 'Retention saved.');
		} catch (e) {
			retentionMsg = errorMessage(e);
		}
	}
	async function purgeLogs() {
		if (!logsPlugin) return;
		if (
			!(await showConfirm(t('admin.plugins_logs_confirm_clear', 'Clear all logs for this plugin?')))
		)
			return;
		try {
			await clearPluginLogs(logsPlugin.id);
			logsPage = 0;
			await loadLogs();
		} catch (e) {
			reportError(e);
		}
	}

	// Plugin install (.zip upload)
	let installing = $state(false);
	let installMsg = $state<{ ok: boolean; text: string } | null>(null);

	async function onInstallPlugin(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		installing = true;
		installMsg = null;
		try {
			const info = await installPlugin(file);
			installMsg = {
				ok: true,
				text: t('admin.plugins_installed', { name: info.name }, `Installed ${info.name}.`)
			};
			await loadPlugins();
		} catch (err) {
			installMsg = { ok: false, text: errorMessage(err) };
		} finally {
			installing = false;
			input.value = '';
		}
	}
	async function loadLogs() {
		if (!logsPlugin) return;
		logsLoading = true;
		try {
			const page = await getPluginLogs(logsPlugin.id, {
				level: logsLevel,
				search: logsSearch,
				limit: LOGS_PAGE_SIZE,
				offset: logsPage * LOGS_PAGE_SIZE
			});
			logs = page.entries;
			logsTotal = page.total;
		} catch (e) {
			reportError(e);
		} finally {
			logsLoading = false;
		}
	}

	// Users
	let users = $state<User[]>([]);
	let total = $state(0);
	let pageIndex = $state(0);
	let usersError = $state<string | null>(null);
	let createOpen = $state(false);
	let createError = $state<string | null>(null);
	let creating = $state(false);
	let newUser = $state({
		username: '',
		email: '',
		password: '',
		role: 'user',
		quotaValue: 5,
		quotaUnit: (1024 ** 3) as number
	});

	// Quota edit modal
	let quotaModal = $state<{
		userId: string;
		username: string;
		value: number;
		unit: number;
	} | null>(null);

	// Reset-password modal
	let resetModal = $state<{ userId: string; username: string } | null>(null);
	let resetPassword = $state('');
	let resetError = $state<string | null>(null);
	let resetting = $state(false);

	// Plugins
	let plugins = $state<PluginInfo[]>([]);
	let pluginsAvailable = $state(true);
	let pluginsError = $state<string | null>(null);

	async function loadUsers() {
		usersError = null;
		try {
			const page = await listUsers(PAGE_SIZE, pageIndex * PAGE_SIZE);
			users = page.users;
			total = page.total;
		} catch (e) {
			usersError = errorMessage(e);
		}
	}

	async function loadPlugins() {
		pluginsError = null;
		try {
			const res = await listPlugins();
			pluginsAvailable = res.available;
			plugins = res.plugins;
		} catch (e) {
			pluginsError = errorMessage(e);
		}
	}

	function reportError(e: unknown) {
		errorToast(e);
	}

	// ── Maintenance: bulk metadata re-extraction ─────────────────────────────
	let audioBusy = $state(false);
	let audioResult = $state<ReextractResult | null>(null);
	let photoBusy = $state(false);
	let photoResult = $state<ReextractResult | null>(null);

	async function runAudioReindex() {
		audioBusy = true;
		audioResult = null;
		try {
			audioResult = await reextractAudioMetadata();
		} catch (e) {
			reportError(e);
		} finally {
			audioBusy = false;
		}
	}

	async function runPhotoReindex() {
		photoBusy = true;
		photoResult = null;
		try {
			photoResult = await reextractPhotoMetadata();
		} catch (e) {
			reportError(e);
		} finally {
			photoBusy = false;
		}
	}

	// ── Storage: generate an at-rest encryption key ──────────────────────────
	let keyBusy = $state(false);
	let generatedKey = $state<GeneratedKey | null>(null);

	async function runGenerateKey() {
		keyBusy = true;
		try {
			generatedKey = await generateEncryptionKey();
		} catch (e) {
			reportError(e);
		} finally {
			keyBusy = false;
		}
	}

	async function copyText(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			ui.notify(t('common.copied', 'Copied to clipboard'), 'success');
		} catch {
			ui.notify(t('common.copy_failed', 'Copy failed'), 'error');
		}
	}

	/** True when a settings field is locked by an OXICLOUD_* env var. */
	function isEnvLocked(overrides: string[] | undefined, field: string): boolean {
		return Array.isArray(overrides) && overrides.includes(field);
	}

	/** True for the signed-in admin's own row — guards self-destructive actions. */
	function isSelf(u: User): boolean {
		return u.id === currentAdminId;
	}
	/** OIDC/SSO-provisioned account (no local password to reset). */
	function isOidcUser(u: User): boolean {
		return !!u.auth_provider && u.auth_provider !== 'local';
	}
	/** Used-quota percentage (0 when unlimited) for the per-user progress bar. */
	function quotaPct(u: User): number {
		return u.storage_quota_bytes > 0 ? (u.storage_used_bytes / u.storage_quota_bytes) * 100 : 0;
	}

	async function toggleRole(u: User) {
		if (isSelf(u)) return;
		const role = u.role === 'admin' ? 'user' : 'admin';
		if (!(await showConfirm(t('admin.confirm_role', { role }, 'Change role to {{role}}?')))) return;
		try {
			await setUserRole(u.id, role);
			await loadUsers();
		} catch (e) {
			reportError(e);
		}
	}

	async function toggleActive(u: User) {
		if (isSelf(u) && u.active) return;
		const msg = u.active
			? t('admin.confirm_deactivate', 'Deactivate this user?')
			: t('admin.confirm_activate', 'Activate this user?');
		if (!(await showConfirm(msg))) return;
		try {
			await setUserActive(u.id, !u.active);
			await loadUsers();
		} catch (e) {
			reportError(e);
		}
	}

	function openQuota(u: User) {
		quotaModal = {
			userId: u.id,
			username: u.username || u.email,
			value:
				u.storage_quota_bytes > 0 ? Math.round((u.storage_quota_bytes / 1024 ** 3) * 10) / 10 : 0,
			unit: 1024 ** 3
		};
	}
	async function saveQuota() {
		if (!quotaModal) return;
		try {
			await setUserQuota(quotaModal.userId, Math.round(quotaModal.value * quotaModal.unit));
			quotaModal = null;
			await loadUsers();
		} catch (e) {
			reportError(e);
		}
	}

	function openReset(u: User) {
		resetModal = { userId: u.id, username: u.username || u.email };
		resetPassword = '';
		resetError = null;
	}
	async function submitReset(e: SubmitEvent) {
		e.preventDefault();
		if (!resetModal) return;
		if (resetPassword.length < 8) {
			resetError = t('admin.error_password_short', 'Password must be at least 8 characters.');
			return;
		}
		resetting = true;
		resetError = null;
		try {
			await resetUserPassword(resetModal.userId, resetPassword);
			resetModal = null;
			ui.notify(t('admin.password_reset', 'Password reset'), 'success');
		} catch (err) {
			resetError = errorMessage(err);
		} finally {
			resetting = false;
		}
	}

	async function removeUser(u: User) {
		if (isSelf(u)) return;
		if (
			!(await showConfirm(
				t('admin.confirm_delete_user', { name: u.username || u.email }, 'Delete user {{name}}?')
			))
		)
			return;
		try {
			await deleteUser(u.id);
			await loadUsers();
		} catch (e) {
			reportError(e);
		}
	}

	async function submitCreate(e: SubmitEvent) {
		e.preventDefault();
		const username = newUser.username.trim();
		const email = newUser.email.trim();
		if (username.length < 3) {
			createError = t('admin.error_username_short', 'Username must be at least 3 characters.');
			return;
		}
		if (newUser.password.length < 8) {
			createError = t('admin.error_password_short', 'Password must be at least 8 characters.');
			return;
		}
		creating = true;
		createError = null;
		try {
			await createUser({
				username,
				// Email is optional — the backend auto-generates one when blank.
				email: email || null,
				password: newUser.password,
				role: newUser.role,
				quota_bytes: Math.round(newUser.quotaValue * newUser.quotaUnit)
			});
			createOpen = false;
			newUser = {
				username: '',
				email: '',
				password: '',
				role: 'user',
				quotaValue: 5,
				quotaUnit: 1024 ** 3
			};
			await loadUsers();
		} catch (err) {
			createError = errorMessage(err);
		} finally {
			creating = false;
		}
	}

	// ── Drives (D3a admin create-shared-drive) ───────────────────────────────
	let drivesList = $state<Drive[]>([]);
	let drivesError = $state<string | null>(null);
	let driveCreateOpen = $state(false);
	let driveCreating = $state(false);
	let driveCreateError = $state<string | null>(null);
	let driveForm = $state({
		name: '',
		ownerQuery: '',
		ownerPick: null as Recipient | null,
		quotaValue: 0,
		quotaUnit: (1024 ** 3) as number
	});
	let ownerSuggestions = $state<Recipient[]>([]);
	let ownerSearching = $state(false);
	let ownerSearchToken = 0;

	// Members keyed by drive id. The admin Drives table renders an Owner
	// avatar stack per row; we lazily fetch members for each drive in
	// parallel after the drives listing comes back. Missing entries mean
	// "still loading" — the stack treats undefined as no-owners-yet.
	let driveMembers = $state<Record<string, DriveMember[]>>({});

	async function loadDrivesTab() {
		drivesError = null;
		try {
			// `/api/admin/drives` — system-wide view; an admin who creates
			// a drive for another user has no `role_grants` row on it and
			// wouldn't see it via the user-facing `/api/drives` listing.
			drivesList = await listAllDrives();
		} catch (e) {
			drivesError = errorMessage(e);
			return;
		}
		// Seed the contact + group caches so the avatar stack renders real
		// labels (and stable initials/colours) instead of bare UUIDs.
		void ensureResolvers();
		// Fan out one members fetch per drive in parallel. A swallowed
		// error per drive degrades gracefully — that row's stack shows
		// "No owners" rather than blocking the whole page.
		const nextMembers: Record<string, DriveMember[]> = {};
		await Promise.all(
			drivesList.map(async (d) => {
				try {
					nextMembers[d.id] = await listDriveMembersAdmin(d.id);
				} catch {
					nextMembers[d.id] = [];
				}
			})
		);
		driveMembers = nextMembers;
	}

	function driveKindLabel(d: Drive): string {
		if (d.kind === 'shared') return t('admin.drive_kind_shared', 'Shared');
		return d.default_for_user
			? t('admin.drive_kind_personal_default', 'Personal (default)')
			: t('admin.drive_kind_personal', 'Personal');
	}

	function openDriveCreate() {
		driveForm = { name: '', ownerQuery: '', ownerPick: null, quotaValue: 0, quotaUnit: 1024 ** 3 };
		ownerSuggestions = [];
		driveCreateError = null;
		driveCreateOpen = true;
	}

	// Search runs in the background; a monotonically-incrementing `token`
	// guards against out-of-order results overwriting a newer query — the
	// network races by query length and keystroke timing.
	async function searchOwnerCandidates(q: string) {
		driveForm.ownerPick = null;
		const trimmed = q.trim();
		if (!trimmed) {
			ownerSuggestions = [];
			return;
		}
		const token = ++ownerSearchToken;
		ownerSearching = true;
		try {
			// `includeSelf` — admin creating a drive may legitimately want to
			// own it themselves; the default share-modal "no self" rule
			// doesn't apply in the admin context.
			const results = await searchRecipients(trimmed, { includeSelf: true });
			if (token !== ownerSearchToken) return; // a newer query is in flight
			// Filter out the synthetic invite-by-email row — POST /api/drives
			// refuses email subjects (drive Owner must be a real user or group).
			ownerSuggestions = results.filter((r) => r.type === 'user' || r.type === 'group');
		} finally {
			if (token === ownerSearchToken) ownerSearching = false;
		}
	}

	function pickOwner(r: Recipient) {
		driveForm.ownerPick = r;
		driveForm.ownerQuery = r.label;
		ownerSuggestions = [];
	}

	// ── Manage-owners modal (D3a admin bypass) ──────────────────────────────
	// State is null when closed; carries the drive being edited otherwise.
	let manageOwnersDrive = $state<Drive | null>(null);
	let manageOwnersError = $state<string | null>(null);
	let manageOwnersBusy = $state(false);
	// Independent owner-search state so the "manage owners" autocomplete
	// doesn't fight with the create-drive form's autocomplete.
	let manageOwnersQuery = $state('');
	let manageOwnersSuggestions = $state<Recipient[]>([]);
	let manageOwnersSearchToken = 0;
	let manageOwnersSearching = $state(false);

	function openManageOwners(d: Drive) {
		manageOwnersDrive = d;
		manageOwnersError = null;
		manageOwnersQuery = '';
		manageOwnersSuggestions = [];
		// Members were already fetched on tab load; nothing else to do.
	}

	function closeManageOwners() {
		manageOwnersDrive = null;
		manageOwnersError = null;
		manageOwnersQuery = '';
		manageOwnersSuggestions = [];
	}

	async function searchManageOwnersCandidates(q: string) {
		const trimmed = q.trim();
		if (!trimmed) {
			manageOwnersSuggestions = [];
			return;
		}
		const token = ++manageOwnersSearchToken;
		manageOwnersSearching = true;
		try {
			// Admin adding owners — allow self (the share-modal "no
			// self" guard doesn't apply to drive-owner management).
			const results = await searchRecipients(trimmed, { includeSelf: true });
			if (token !== manageOwnersSearchToken) return;
			// Filter out emails (POST admin/members refuses them) and any
			// subject already an Owner of this drive (no point re-adding).
			const currentOwnerIds = new Set(
				(driveMembers[manageOwnersDrive?.id ?? ''] ?? [])
					.filter((m) => m.role === 'owner')
					.map((m) => `${m.subject.type}-${m.subject.id}`)
			);
			manageOwnersSuggestions = results.filter(
				(r) =>
					(r.type === 'user' || r.type === 'group') && !currentOwnerIds.has(`${r.type}-${r.id}`)
			);
		} finally {
			if (token === manageOwnersSearchToken) manageOwnersSearching = false;
		}
	}

	// Pessimistic refetch after every mutation — the membership list is
	// small (a handful of owners) and the alternative (mutating local
	// state) duplicates the server's role-resolution + last-owner logic.
	async function reloadDriveMembers(driveId: string) {
		try {
			driveMembers = {
				...driveMembers,
				[driveId]: await listDriveMembersAdmin(driveId)
			};
		} catch (e) {
			manageOwnersError = errorMessage(e);
		}
	}

	async function addOwner(r: Recipient) {
		if (!manageOwnersDrive || (r.type !== 'user' && r.type !== 'group')) return;
		manageOwnersBusy = true;
		manageOwnersError = null;
		try {
			await addDriveMemberAdmin(manageOwnersDrive.id, { type: r.type, id: r.id }, 'owner');
			manageOwnersQuery = '';
			manageOwnersSuggestions = [];
			await reloadDriveMembers(manageOwnersDrive.id);
		} catch (e) {
			manageOwnersError = errorMessage(e);
		} finally {
			manageOwnersBusy = false;
		}
	}

	async function removeOwner(m: DriveMember) {
		if (!manageOwnersDrive) return;
		const confirmMsg = t('admin.drive_owner_remove_confirm', 'Remove this owner from the drive?');
		if (!(await showConfirm(confirmMsg))) return;
		manageOwnersBusy = true;
		manageOwnersError = null;
		try {
			await removeDriveMemberAdmin(manageOwnersDrive.id, {
				type: m.subject.type,
				id: m.subject.id
			});
			await reloadDriveMembers(manageOwnersDrive.id);
		} catch (e) {
			manageOwnersError = errorMessage(e);
		} finally {
			manageOwnersBusy = false;
		}
	}

	// Re-derive the current owners list inside the modal so it reacts to
	// `driveMembers` changes after add/remove.
	const manageOwnersList = $derived(
		manageOwnersDrive
			? (driveMembers[manageOwnersDrive.id] ?? []).filter(
					(m) => m.role === 'owner' && (m.subject.type === 'user' || m.subject.type === 'group')
				)
			: []
	);

	// ── Manage-policies modal (D5 admin-only mutation) ─────────────────────
	// Policies were owner-mutable in the original D5 design; the carve-out
	// to admin-only fixed the self-policing-soft-cap hole (an owner could
	// disable forbid_external_sharing, share, re-enable — net zero
	// enforcement). The owner UI no longer surfaces policies at all; this
	// modal is the only editor. See `docs/plan/drive.md` §8.
	let managePoliciesDrive = $state<Drive | null>(null);
	let managePoliciesDraft = $state<Required<DrivePoliciesPartial>>({
		forbid_sharing: false,
		forbid_external_sharing: false,
		forbid_public_links: false,
		forbid_cross_drive_move: false,
		forbid_owner_role_change: false,
		// §15 opt-in scope flags. Default personal drives ship with `true`
		// on the wire (materialised by the DB-side create path + backfill
		// migration), so `readPolicyBool` will surface the correct current
		// state on modal open.
		include_in_photo_index: false,
		include_in_music_index: false
	});
	let managePoliciesError = $state<string | null>(null);
	let managePoliciesBusy = $state(false);

	function openManagePolicies(d: Drive) {
		managePoliciesDrive = d;
		managePoliciesError = null;
		const p = (d.policies ?? {}) as Record<string, unknown>;
		managePoliciesDraft = {
			forbid_sharing: readPolicyBool(p, 'forbid_sharing'),
			forbid_external_sharing: readPolicyBool(p, 'forbid_external_sharing'),
			forbid_public_links: readPolicyBool(p, 'forbid_public_links'),
			forbid_cross_drive_move: readPolicyBool(p, 'forbid_cross_drive_move'),
			forbid_owner_role_change: readPolicyBool(p, 'forbid_owner_role_change'),
			include_in_photo_index: readPolicyBool(p, 'include_in_photo_index'),
			include_in_music_index: readPolicyBool(p, 'include_in_music_index')
		};
	}

	function closeManagePolicies() {
		managePoliciesDrive = null;
		managePoliciesError = null;
	}

	async function saveManagePolicies() {
		if (!managePoliciesDrive) return;
		managePoliciesBusy = true;
		managePoliciesError = null;
		try {
			const merged: DrivePolicies = await updateDrivePolicies(
				managePoliciesDrive.id,
				managePoliciesDraft
			);
			// Refresh the drive row's policies in place so the next time
			// the admin opens this modal they see the persisted state.
			const driveId = managePoliciesDrive.id;
			drivesList = drivesList.map((d) =>
				d.id === driveId ? { ...d, policies: { ...d.policies, ...merged } } : d
			);
			closeManagePolicies();
		} catch (e) {
			managePoliciesError = errorMessage(e);
		} finally {
			managePoliciesBusy = false;
		}
	}

	// Policy definitions live in `$lib/utils/drivePolicies` so the same
	// list drives the admin "Manage policies" modal AND the read-only
	// summary on `/config/drive/{uuid}`. Adding a policy is one literal-
	// array push there + one field in `DrivePolicies` in `types.ts`.

	// Admin-driven delete-drive flow (D3b). Guarded by the confirm modal
	// because the action is destructive and irreversible. The backend
	// refuses the default Personal drive (405) and any non-empty drive
	// (409); we surface those as toasts rather than silently swallow.
	async function requestDeleteDrive(d: Drive) {
		const msg = t(
			'admin.drive_delete_confirm',
			{ name: d.name },
			'Delete drive "{{name}}"? This cannot be undone.'
		);
		if (!(await showConfirm(msg))) return;
		try {
			await deleteDriveAdmin(d.id);
			// Refresh the listing + the sidebar picker. Both have a cached
			// view of this drive; without the invalidate the row lingers
			// until the next full reload.
			await loadDrivesTab();
			drivesStore.invalidate();
			ui.notify(t('admin.drive_deleted', 'Drive deleted.'), 'success');
		} catch (e) {
			reportError(e);
		}
	}

	async function submitDriveCreate(e: SubmitEvent) {
		e.preventDefault();
		const name = driveForm.name.trim();
		if (name.length === 0) {
			driveCreateError = t('admin.drive_error_name_required', 'Drive name is required.');
			return;
		}
		const owner = driveForm.ownerPick;
		if (!owner || (owner.type !== 'user' && owner.type !== 'group')) {
			driveCreateError = t(
				'admin.drive_error_owner_required',
				'Pick a user or group as the drive owner.'
			);
			return;
		}
		driveCreating = true;
		driveCreateError = null;
		try {
			await createDrive({
				kind: 'shared',
				name,
				owner: { type: owner.type, id: owner.id },
				quota_bytes:
					driveForm.quotaValue > 0 ? Math.round(driveForm.quotaValue * driveForm.quotaUnit) : null
			});
			driveCreateOpen = false;
			await loadDrivesTab();
			// The global drives store backs the sidebar picker; drop its cache
			// so the new drive shows up for every consumer (picker, breadcrumb,
			// session bootstrap) without a page reload.
			drivesStore.invalidate();
			ui.notify(t('admin.drive_created', 'Drive created.'), 'success');
		} catch (err) {
			driveCreateError = errorMessage(err);
		} finally {
			driveCreating = false;
		}
	}

	async function togglePlugin(p: PluginInfo) {
		try {
			await setPluginEnabled(p.id, !p.enabled);
			await loadPlugins();
		} catch (e) {
			reportError(e);
		}
	}

	async function removePlugin(p: PluginInfo) {
		if (
			!(await showConfirm(
				t('admin.confirm_delete_plugin', { name: p.name }, 'Delete plugin {{name}}?')
			))
		)
			return;
		try {
			await deletePlugin(p.id);
			await loadPlugins();
		} catch (e) {
			reportError(e);
		}
	}

	function changePage(delta: number) {
		const next = pageIndex + delta;
		if (next < 0 || next * PAGE_SIZE >= total) return;
		pageIndex = next;
		void loadUsers();
	}

	// Lazy-load each tab's data on first visit.
	let loaded = $state<Record<Tab, boolean>>({
		dashboard: false,
		users: false,
		drives: false,
		plugins: false,
		oidc: false,
		storage: false,
		smtp: false
	});

	$effect(() => {
		if (loaded[tab]) return;
		loaded[tab] = true;
		if (tab === 'dashboard') void loadDashboard();
		else if (tab === 'users') void loadUsers();
		else if (tab === 'drives') void loadDrivesTab();
		else if (tab === 'plugins') void loadPlugins();
		else if (tab === 'oidc') void loadOidc();
		else if (tab === 'storage') {
			void loadStorage();
			void loadMigration();
		} else if (tab === 'smtp') void loadSmtp();
	});

	// Stop polling when leaving the storage tab / unmounting.
	$effect(() => {
		if (tab !== 'storage') stopMigrationPoll();
		return () => stopMigrationPoll();
	});

	// Tear down the live log stream when leaving plugins / unmounting.
	$effect(() => {
		if (tab !== 'plugins') stopLogStream();
		return () => stopLogStream();
	});

	// ── Shared class strings (one source of truth for the repeated chrome) ──
	const CARD = 'rounded-xl border border-base-300 bg-base-100 p-6';
	const CARD_H2 = 'm-0 mb-3 text-lg font-semibold text-base-content';
	const CARD_STAT =
		'flex flex-col gap-1 rounded-xl border border-base-300 bg-base-100 p-4 text-sm text-base-content/60';
	const MUTED = 'text-[0.8125rem] text-base-content/60';
	const FORM = 'flex flex-col gap-3';
	const FIELD = 'flex flex-col gap-1 text-sm';
	const KV = 'm-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1';
	const KV_DT = 'text-base-content/60';
	const ICON_BTN = 'btn btn-square btn-sm';
	const SUGGEST_LIST =
		'm-0 max-h-56 list-none overflow-y-auto rounded-lg border border-base-300 bg-base-100 p-0';
	const SUGGEST_ROW =
		'flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 text-left hover:bg-base-200';

	/** Progress color by usage percentage (quota/storage bars). */
	function barClass(pct: number): string {
		if (pct > 90) return 'progress-error';
		if (pct > 70) return 'progress-warning';
		return 'progress-success';
	}
</script>

<svelte:head><title>{t('admin.title', 'Admin')} · OxiCloud</title></svelte:head>

{#snippet envBadge(on: boolean)}
	{#if on}
		<span
			class="badge badge-warning badge-xs ml-2"
			title={t('admin.env_locked', 'Set by an environment variable')}>ENV</span
		>
	{/if}
{/snippet}

<main class="mx-auto flex w-full max-w-[64rem] flex-col gap-4 px-4 py-6">
	<h1 class="m-0 text-2xl font-bold text-base-content">{t('admin.title', 'Admin')}</h1>

	<div class="tabs tabs-border flex-nowrap overflow-x-auto" role="tablist">
		<button
			class="tab gap-1 whitespace-nowrap {tab === 'dashboard' ? 'tab-active' : ''}"
			role="tab"
			data-testid="admin-dashboard-tab"
			aria-selected={tab === 'dashboard'}
			onclick={() => (tab = 'dashboard')}
		>
			<Icon name="chart-pie" />
			{t('admin.dashboard', 'Dashboard')}
		</button>
		<button
			class="tab gap-1 whitespace-nowrap {tab === 'users' ? 'tab-active' : ''}"
			role="tab"
			data-testid="admin-users-tab"
			aria-selected={tab === 'users'}
			onclick={() => (tab = 'users')}
		>
			<Icon name="users" />
			{t('admin.users', 'Users')}
		</button>
		<button
			class="tab gap-1 whitespace-nowrap {tab === 'drives' ? 'tab-active' : ''}"
			role="tab"
			data-testid="admin-drives-tab"
			aria-selected={tab === 'drives'}
			onclick={() => (tab = 'drives')}
		>
			<Icon name="folder" />
			{t('admin.drives', 'Drives')}
		</button>
		<button
			class="tab gap-1 whitespace-nowrap {tab === 'oidc' ? 'tab-active' : ''}"
			role="tab"
			data-testid="admin-oidc-tab"
			aria-selected={tab === 'oidc'}
			onclick={() => (tab = 'oidc')}
		>
			<Icon name="key" />
			{t('admin.oidc', 'OIDC / SSO')}
		</button>
		<button
			class="tab gap-1 whitespace-nowrap {tab === 'storage' ? 'tab-active' : ''}"
			role="tab"
			data-testid="admin-storage-tab"
			aria-selected={tab === 'storage'}
			onclick={() => (tab = 'storage')}
		>
			<Icon name="database" />
			{t('admin.storage_tab', 'Storage')}
		</button>
		<button
			class="tab gap-1 whitespace-nowrap {tab === 'smtp' ? 'tab-active' : ''}"
			role="tab"
			data-testid="admin-smtp-tab"
			aria-selected={tab === 'smtp'}
			onclick={() => (tab = 'smtp')}
		>
			<Icon name="envelope" />
			{t('admin.smtp', 'Email (SMTP)')}
		</button>
		<button
			class="tab gap-1 whitespace-nowrap {tab === 'plugins' ? 'tab-active' : ''}"
			role="tab"
			data-testid="admin-plugins-tab"
			aria-selected={tab === 'plugins'}
			onclick={() => (tab = 'plugins')}
		>
			<Icon name="layer-group" />
			{t('admin.plugins', 'Plugins')}
		</button>
	</div>

	{#if tab === 'dashboard'}
		{#if dashboardError}
			<p class="py-8 text-center text-error">{dashboardError}</p>
		{:else if !dashboard}
			<p class="py-8 text-center text-base-content/60">{t('common.loading', 'Loading…')}</p>
		{:else}
			<div class="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
				<div class={CARD_STAT}>
					<span class="text-2xl font-bold text-base-content">{dashboard.total_users}</span>{t(
						'admin.total_users',
						'Total users'
					)}
				</div>
				<div class={CARD_STAT}>
					<span class="text-2xl font-bold text-base-content">{dashboard.active_users}</span>{t(
						'admin.active_users',
						'Active'
					)}
				</div>
				<div class={CARD_STAT}>
					<span class="text-2xl font-bold text-base-content">{dashboard.admin_users}</span>{t(
						'admin.admin_users',
						'Admins'
					)}
				</div>
				<div class={CARD_STAT}>
					<span class="text-2xl font-bold text-base-content">v{dashboard.server_version}</span>{t(
						'admin.version',
						'Version'
					)}
				</div>
			</div>

			<div class="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
				<div class={CARD_STAT}>
					<span
						class="text-lg font-bold {dashboard.auth_enabled
							? 'text-success'
							: 'text-base-content/50'}"
					>
						{dashboard.auth_enabled
							? t('admin.enabled', 'Enabled')
							: t('admin.disabled', 'Disabled')}
					</span>
					{t('admin.auth', 'Authentication')}
				</div>
				<div class={CARD_STAT}>
					<span
						class="text-lg font-bold {dashboard.oidc_configured
							? 'text-success'
							: 'text-base-content/50'}"
					>
						{dashboard.oidc_configured ? t('admin.active', 'Active') : t('admin.off', 'Off')}
					</span>
					{t('admin.oidc', 'OIDC / SSO')}
				</div>
				<div class={CARD_STAT}>
					<span
						class="text-lg font-bold {dashboard.quotas_enabled
							? 'text-success'
							: 'text-base-content/50'}"
					>
						{dashboard.quotas_enabled
							? t('admin.enabled', 'Enabled')
							: t('admin.disabled', 'Disabled')}
					</span>
					{t('admin.quotas', 'Quotas')}
				</div>
			</div>

			{#if dashboard.users_over_quota > 0}
				<div class="{CARD} flex items-center gap-3 border-error text-error">
					<Icon name="exclamation-circle" />
					<div>
						<strong class="text-2xl font-bold">{dashboard.users_over_quota}</strong>
						{t('admin.over_quota', { n: dashboard.users_over_quota }, '{{n}} users over quota')}
					</div>
				</div>
			{/if}
			{#if dashboard.users_over_80_percent > 0}
				<div class="{CARD} flex items-center gap-3 border-warning text-warning">
					<Icon name="exclamation-triangle" />
					<div>
						<strong class="text-2xl font-bold">{dashboard.users_over_80_percent}</strong>
						{t(
							'admin.over_80',
							{ n: dashboard.users_over_80_percent },
							'{{n}} users over 80% quota'
						)}
					</div>
				</div>
			{/if}

			<div class={CARD}>
				<h2 class={CARD_H2}>{t('admin.storage', 'Storage')}</h2>
				<progress
					class="progress mb-2 h-2 w-full {barClass(dashboard.storage_usage_percent)}"
					value={Math.min(dashboard.storage_usage_percent, 100)}
					max="100"
				></progress>
				<p class={MUTED}>
					{formatBytes(dashboard.total_used_bytes)} / {formatBytes(dashboard.total_quota_bytes)}
					({dashboard.storage_usage_percent.toFixed(1)}%)
				</p>
			</div>

			{#if dashboard.registration_enabled !== undefined}
				<div class={CARD}>
					<h2 class={CARD_H2}>{t('admin.registration', 'Registration')}</h2>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							class="toggle toggle-primary toggle-sm"
							data-testid="admin-dashboard-registration-checkbox"
							checked={dashboard.registration_enabled}
							onchange={(e) => toggleRegistration(e.currentTarget.checked)}
						/>
						<span>{t('admin.allow_registration', 'Allow public user registration')}</span>
					</label>
					{#if !dashboard.registration_enabled}
						<p class="alert alert-warning mt-3">
							<Icon name="exclamation-triangle" />
							{t(
								'admin.registration_disabled_warning',
								'Public registration is disabled. Only admins can create new accounts.'
							)}
						</p>
					{/if}
				</div>
			{/if}

			<div class={CARD}>
				<h2 class={CARD_H2}>{t('admin.maintenance', 'Maintenance')}</h2>
				<p class={MUTED}>
					{t(
						'admin.maintenance_hint',
						'Re-scan existing files to backfill metadata. Safe to re-run; processes the whole library and may take a while.'
					)}
				</p>
				<div class="mt-3 flex flex-wrap items-center gap-3">
					<button class="btn" disabled={audioBusy} onclick={runAudioReindex}>
						<Icon name="music" />
						{audioBusy
							? t('admin.running', 'Running…')
							: t('admin.reextract_audio', 'Re-extract audio metadata')}
					</button>
					{#if audioResult}
						<span class="{MUTED} tabular-nums">
							{t(
								'admin.reextract_done',
								{
									processed: audioResult.processed,
									total: audioResult.total,
									failed: audioResult.failed
								},
								'{{processed}}/{{total}} processed · {{failed}} failed'
							)}
						</span>
					{/if}
				</div>
				<div class="mt-3 flex flex-wrap items-center gap-3">
					<button class="btn" disabled={photoBusy} onclick={runPhotoReindex}>
						<Icon name="images" />
						{photoBusy
							? t('admin.running', 'Running…')
							: t('admin.reextract_photos', 'Re-extract photo & video capture dates')}
					</button>
					{#if photoResult}
						<span class="{MUTED} tabular-nums">
							{t(
								'admin.reextract_done',
								{
									processed: photoResult.processed,
									total: photoResult.total,
									failed: photoResult.failed
								},
								'{{processed}}/{{total}} processed · {{failed}} failed'
							)}
						</span>
					{/if}
				</div>
			</div>
		{/if}
	{:else if tab === 'oidc'}
		<div class={CARD}>
			<h2 class={CARD_H2}>{t('admin.oidc', 'OIDC / SSO')}</h2>
			{#if !oidc}
				<p class="py-8 text-center text-base-content/60">{t('common.loading', 'Loading…')}</p>
			{:else}
				<form
					class={FORM}
					data-testid="admin-oidc-form"
					onsubmit={(e) => (e.preventDefault(), doSaveOidc())}
				>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							data-testid="admin-oidc-enabled-checkbox"
							bind:checked={oidc.enabled}
						/>
						<span>{t('admin.oidc_enabled', 'Enable OIDC login')}</span>
					</label>
					<label class={FIELD}
						><span
							>{t('admin.oidc_issuer', 'Issuer URL')}{@render envBadge(
								isEnvLocked(oidc.env_overrides, 'issuer_url')
							)}</span
						>
						<input
							class="input w-full"
							bind:value={oidc.issuer_url}
							data-testid="admin-oidc-issuer-input"
							placeholder="https://idp.example.com"
							disabled={isEnvLocked(oidc.env_overrides, 'issuer_url')}
						/></label
					>
					<button
						type="button"
						class="btn self-start"
						data-testid="admin-oidc-discover-btn"
						onclick={runOidcTest}
					>
						<Icon name="search" />
						{t('admin.oidc_discover', 'Test / discover')}
					</button>
					{#if oidcTest}
						<div
							class="mt-2 rounded-lg border p-3 {oidcTest.success
								? 'border-success text-success'
								: 'border-error text-error'}"
						>
							<strong class="inline-flex items-center gap-2">
								<Icon name={oidcTest.success ? 'check-circle' : 'times-circle'} />
								{oidcTest.message}
							</strong>
							{#if oidcTest.success}
								<dl class="{KV} mt-2 text-base-content">
									<dt class={KV_DT}>{t('admin.oidc_issuer', 'Issuer URL')}</dt>
									<dd class="m-0">{oidcTest.issuer || '—'}</dd>
									<dt class={KV_DT}>{t('admin.oidc_auth_endpoint', 'Auth endpoint')}</dt>
									<dd class="m-0">{oidcTest.authorization_endpoint || '—'}</dd>
								</dl>
							{/if}
						</div>
					{/if}
					<label class={FIELD}
						><span
							>{t('admin.oidc_client_id', 'Client ID')}{@render envBadge(
								isEnvLocked(oidc.env_overrides, 'client_id')
							)}</span
						>
						<input
							class="input w-full"
							bind:value={oidc.client_id}
							data-testid="admin-oidc-client-id-input"
							disabled={isEnvLocked(oidc.env_overrides, 'client_id')}
						/></label
					>
					<label class={FIELD}
						><span
							>{t('admin.oidc_client_secret', 'Client secret')}{@render envBadge(
								isEnvLocked(oidc.env_overrides, 'client_secret')
							)}</span
						>
						<input
							class="input w-full"
							type="password"
							data-testid="admin-oidc-client-secret-input"
							bind:value={oidc.client_secret}
							disabled={isEnvLocked(oidc.env_overrides, 'client_secret')}
							placeholder={oidc.client_secret_set
								? t('admin.unchanged', 'Leave blank to keep current')
								: ''}
						/>
						{#if oidc.client_secret_set}
							<span class="mt-1 inline-flex items-center gap-1 text-sm text-success">
								<Icon name="check-circle" />
								{t('admin.oidc_secret_set', 'A client secret is already configured.')}
							</span>
						{/if}</label
					>
					<label class={FIELD}
						><span
							>{t('admin.oidc_scopes', 'Scopes')}{@render envBadge(
								isEnvLocked(oidc.env_overrides, 'scopes')
							)}</span
						>
						<input
							class="input w-full"
							bind:value={oidc.scopes}
							data-testid="admin-oidc-scopes-input"
							placeholder="openid profile email"
							disabled={isEnvLocked(oidc.env_overrides, 'scopes')}
						/></label
					>
					<label class={FIELD}
						><span
							>{t('admin.oidc_provider_name', 'Provider name')}{@render envBadge(
								isEnvLocked(oidc.env_overrides, 'provider_name')
							)}</span
						>
						<input
							class="input w-full"
							bind:value={oidc.provider_name}
							data-testid="admin-oidc-provider-name-input"
							disabled={isEnvLocked(oidc.env_overrides, 'provider_name')}
						/></label
					>
					<label class={FIELD}
						><span
							>{t('admin.oidc_admin_groups', 'Admin groups')}{@render envBadge(
								isEnvLocked(oidc.env_overrides, 'admin_groups')
							)}</span
						>
						<input
							class="input w-full"
							bind:value={oidc.admin_groups}
							data-testid="admin-oidc-admin-groups-input"
							disabled={isEnvLocked(oidc.env_overrides, 'admin_groups')}
						/></label
					>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							data-testid="admin-oidc-auto-provision-checkbox"
							bind:checked={oidc.auto_provision}
						/>
						<span>{t('admin.oidc_auto_provision', 'Auto-provision users on first login')}</span>
					</label>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							data-testid="admin-oidc-disable-pw-checkbox"
							bind:checked={oidc.disable_password_login}
						/>
						<span>{t('admin.oidc_disable_pw', 'Disable password login (OIDC only)')}</span>
					</label>
					{#if oidc.callback_url}
						<p class="{MUTED} flex flex-wrap items-center gap-2">
							{t('admin.oidc_callback', 'Callback URL')}: <code>{oidc.callback_url}</code>
							<button
								type="button"
								class="btn btn-sm"
								data-testid="admin-oidc-callback-copy-btn"
								onclick={() => copyText(oidc?.callback_url ?? '')}
							>
								<Icon name="copy" />
								{t('common.copy', 'Copy')}
							</button>
						</p>
					{/if}
					{#if oidcMsg}<p class={oidcMsg.ok ? 'text-success' : 'text-error'}>
							{oidcMsg.text}
						</p>{/if}
					<button
						class="btn btn-primary self-start"
						type="submit"
						data-testid="admin-oidc-save-btn"
						disabled={oidcSaving}
					>
						{t('common.save', 'Save')}
					</button>
				</form>
			{/if}
		</div>
	{:else if tab === 'storage'}
		<div class={CARD}>
			<h2 class={CARD_H2}>{t('admin.storage_tab', 'Storage')}</h2>
			{#if !storage}
				<p class="py-8 text-center text-base-content/60">{t('common.loading', 'Loading…')}</p>
			{:else}
				<form
					class={FORM}
					data-testid="admin-storage-form"
					onsubmit={(e) => (e.preventDefault(), doSaveStorage())}
				>
					<label class={FIELD}
						><span>{t('admin.storage_backend', 'Backend')}</span>
						<select
							class="select w-full"
							bind:value={sForm.backend}
							data-testid="admin-storage-backend-select"
						>
							<option value="local">local</option>
							<option value="s3">S3</option>
						</select></label
					>
					{#if sForm.backend === 's3'}
						<label class={FIELD}
							><span>{t('admin.storage_preset', 'Preset')}</span>
							<select
								class="select w-full"
								bind:value={sForm.preset}
								data-testid="admin-storage-preset-select"
								onchange={applyPreset}
							>
								{#each Object.keys(STORAGE_PRESETS) as p (p)}<option value={p}>{p}</option>{/each}
							</select></label
						>
						<label class={FIELD}
							><span
								>{t('admin.storage_endpoint', 'Endpoint URL')}{@render envBadge(
									isEnvLocked(storage.env_overrides, 's3_endpoint_url')
								)}</span
							>
							<input
								class="input w-full"
								bind:value={sForm.endpoint}
								data-testid="admin-storage-endpoint-input"
								disabled={isEnvLocked(storage.env_overrides, 's3_endpoint_url')}
							/></label
						>
						<label class={FIELD}
							><span
								>{t('admin.storage_bucket', 'Bucket')}{@render envBadge(
									isEnvLocked(storage.env_overrides, 's3_bucket')
								)}</span
							>
							<input
								class="input w-full"
								bind:value={sForm.bucket}
								data-testid="admin-storage-bucket-input"
								disabled={isEnvLocked(storage.env_overrides, 's3_bucket')}
							/></label
						>
						<label class={FIELD}
							><span
								>{t('admin.storage_region', 'Region')}{@render envBadge(
									isEnvLocked(storage.env_overrides, 's3_region')
								)}</span
							>
							<input
								class="input w-full"
								bind:value={sForm.region}
								data-testid="admin-storage-region-input"
								disabled={isEnvLocked(storage.env_overrides, 's3_region')}
							/></label
						>
						<label class={FIELD}
							><span
								>{t('admin.storage_access_key', 'Access key')}{@render envBadge(
									isEnvLocked(storage.env_overrides, 's3_access_key')
								)}</span
							>
							<input
								class="input w-full"
								bind:value={sForm.accessKey}
								data-testid="admin-storage-access-key-input"
								disabled={isEnvLocked(storage.env_overrides, 's3_access_key')}
								placeholder={storage.s3_access_key_set
									? t('admin.unchanged', 'Leave blank to keep current')
									: ''}
							/></label
						>
						<label class={FIELD}
							><span
								>{t('admin.storage_secret_key', 'Secret key')}{@render envBadge(
									isEnvLocked(storage.env_overrides, 's3_secret_key')
								)}</span
							>
							<input
								class="input w-full"
								type="password"
								data-testid="admin-storage-secret-key-input"
								bind:value={sForm.secretKey}
								disabled={isEnvLocked(storage.env_overrides, 's3_secret_key')}
								placeholder={storage.s3_secret_key_set
									? t('admin.unchanged', 'Leave blank to keep current')
									: ''}
							/></label
						>
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								data-testid="admin-storage-path-style-checkbox"
								bind:checked={sForm.pathStyle}
							/>
							<span>{t('admin.storage_path_style', 'Force path-style URLs')}</span>
						</label>
					{/if}
					{#if storageMsg}<p class={storageMsg.ok ? 'text-success' : 'text-error'}>
							{storageMsg.text}
						</p>{/if}
					<div class="flex gap-2">
						<button
							class="btn btn-primary"
							type="submit"
							data-testid="admin-storage-save-btn"
							disabled={storageBusy}>{t('common.save', 'Save')}</button
						>
						{#if sForm.backend === 's3'}
							<button
								type="button"
								class="btn"
								data-testid="admin-storage-test-btn"
								disabled={storageBusy}
								onclick={doTestStorage}
							>
								{t('admin.storage_test', 'Test connection')}
							</button>
						{/if}
					</div>
				</form>
				<dl class="{KV} mt-3">
					<dt class={KV_DT}>{t('admin.storage_current', 'Current backend')}</dt>
					<dd class="m-0">{storage.current_backend ?? '—'}</dd>
					<dt class={KV_DT}>{t('admin.storage_blobs', 'Blobs')}</dt>
					<dd class="m-0">{storage.total_blobs ?? '—'}</dd>
					<dt class={KV_DT}>{t('admin.storage_size', 'Stored')}</dt>
					<dd class="m-0">
						{storage.total_bytes_stored != null ? formatBytes(storage.total_bytes_stored) : '—'}
					</dd>
					<dt class={KV_DT}>{t('admin.storage_dedup', 'Dedup ratio')}</dt>
					<dd class="m-0">
						{storage.dedup_ratio != null ? `${storage.dedup_ratio.toFixed(2)}x` : '—'}
					</dd>
				</dl>
			{/if}
		</div>

		<div class={CARD}>
			<h2 class={CARD_H2}>{t('admin.migration', 'Storage migration')}</h2>
			{#if !migration}
				<p class="py-8 text-center text-base-content/60">{t('common.loading', 'Loading…')}</p>
			{:else}
				<p class={MUTED}>{t('admin.status', 'Status')}: <strong>{migration.status}</strong></p>
				{#if migration.total_blobs > 0}
					<progress class="progress progress-success mb-2 h-2 w-full" value={migrationPct} max="100"
					></progress>
					<p class={MUTED}>
						{migration.migrated_blobs} / {migration.total_blobs} ({migrationPct}%) ·
						{formatBytes(migration.migrated_bytes)}
						{#if migration.throughput_bytes_per_sec && migration.status === 'running'}
							· {formatBytes(Math.round(migration.throughput_bytes_per_sec))}/s
						{/if}
						{#if migrationEtaMin != null}
							· {t('admin.mig_eta', { min: migrationEtaMin }, `~${migrationEtaMin} min remaining`)}
						{/if}
					</p>
				{/if}
				{#if migration.failed_blobs && migration.failed_blobs.length > 0}
					<details class="mt-2">
						<summary>
							{t(
								'admin.mig_failed',
								{ n: migration.failed_blobs.length },
								`${migration.failed_blobs.length} failed blobs`
							)}
						</summary>
						<pre
							class="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-base-200 p-2 text-xs">{migration.failed_blobs.join(
								'\n'
							)}</pre>
					</details>
				{/if}
				<div class="mt-3 flex gap-2">
					<!-- Start: only when no migration is active (running/paused) or completed. -->
					{#if migration.status !== 'running' && migration.status !== 'paused' && migration.status !== 'completed'}
						<button
							class="btn btn-primary"
							data-testid="admin-migration-start-btn"
							onclick={() => doMigration('start')}>{t('admin.mig_start', 'Start')}</button
						>
					{/if}
					{#if migration.status === 'running'}
						<button
							class="btn"
							data-testid="admin-migration-pause-btn"
							onclick={() => doMigration('pause')}>{t('admin.mig_pause', 'Pause')}</button
						>
					{/if}
					{#if migration.status === 'paused'}
						<button
							class="btn btn-primary"
							data-testid="admin-migration-resume-btn"
							onclick={() => doMigration('resume')}>{t('admin.mig_resume', 'Resume')}</button
						>
					{/if}
					<!-- Verify + Finalize: only once the copy phase has completed. -->
					{#if migration.status === 'completed'}
						<button
							class="btn"
							data-testid="admin-migration-verify-btn"
							disabled={verifying}
							onclick={doVerify}
						>
							<Icon name="check-double" />
							{verifying
								? t('admin.mig_verifying', 'Verifying…')
								: t('admin.mig_verify', 'Verify integrity')}
						</button>
						<button
							class="btn"
							data-testid="admin-migration-complete-btn"
							onclick={() => doMigration('complete')}>{t('admin.mig_complete', 'Finalize')}</button
						>
					{/if}
				</div>

				{#if verifyError}
					<div class="mt-2 rounded-lg border border-error p-3 text-error">
						<strong class="inline-flex items-center gap-2"
							><Icon name="times-circle" /> {verifyError}</strong
						>
					</div>
				{:else if verifyResult}
					<div
						class="mt-2 rounded-lg border p-3 {verifyResult.passed
							? 'border-success text-success'
							: 'border-error text-error'}"
					>
						<strong class="inline-flex items-center gap-2">
							<Icon name={verifyResult.passed ? 'check-circle' : 'times-circle'} />
							{verifyResult.passed
								? t('admin.mig_verify_passed', 'Verification passed')
								: t('admin.mig_verify_failed', 'Verification failed')}
						</strong>
						{#if verifyResult.passed}
							<p class={MUTED}>
								{t(
									'admin.mig_verify_summary',
									{ checked: verifyResult.sample_checked, total: verifyResult.pg_blob_count },
									'{{checked}} blobs checked, {{total}} total in database'
								)}
							</p>
						{:else}
							<p class={MUTED}>
								{[
									verifyResult.missing_in_target.length
										? t(
												'admin.mig_verify_missing',
												{ n: verifyResult.missing_in_target.length },
												'{{n}} missing'
											)
										: '',
									verifyResult.size_mismatches.length
										? t(
												'admin.mig_verify_mismatch',
												{ n: verifyResult.size_mismatches.length },
												'{{n}} size mismatches'
											)
										: ''
								]
									.filter(Boolean)
									.join(', ')}
							</p>
						{/if}
					</div>
				{/if}
			{/if}
		</div>

		<div class={CARD}>
			<h2 class={CARD_H2}>{t('admin.encryption', 'Encryption')}</h2>
			<p class={MUTED}>
				{t(
					'admin.encryption_hint',
					'Generate an AES-256 key for at-rest blob encryption, then set it as OXICLOUD_STORAGE_ENCRYPTION_KEY in your server environment.'
				)}
			</p>
			<button class="btn mt-3" disabled={keyBusy} onclick={runGenerateKey}>
				<Icon name="key" />
				{keyBusy ? t('admin.running', 'Running…') : t('admin.gen_key', 'Generate key')}
			</button>
			{#if generatedKey}
				<p class="mt-3 flex flex-wrap items-center gap-2">
					<code class="break-all">{generatedKey.key}</code>
					<button
						type="button"
						class="btn btn-sm"
						onclick={() => copyText(generatedKey?.key ?? '')}
					>
						<Icon name="copy" />
						{t('common.copy', 'Copy')}
					</button>
				</p>
				<p class="alert alert-warning mt-3">
					<Icon name="exclamation-triangle" />
					{t(
						'admin.gen_key_warning',
						'Store this key securely. If it is lost, the encrypted data is irrecoverably lost.'
					)}
				</p>
			{/if}
		</div>
	{:else if tab === 'smtp'}
		<div class={CARD}>
			<h2 class={CARD_H2}>{t('admin.smtp_status', 'SMTP status')}</h2>
			{#if !smtp}
				<p class="py-8 text-center text-base-content/60">{t('common.loading', 'Loading…')}</p>
			{:else}
				<dl class={KV}>
					<dt class={KV_DT}>{t('admin.smtp_enabled', 'Enabled')}</dt>
					<dd class="m-0">{smtp.enabled ? t('common.yes', 'Yes') : t('common.no', 'No')}</dd>
					<dt class={KV_DT}>{t('admin.smtp_host', 'Host')}</dt>
					<dd class="m-0">{smtp.host || '—'}</dd>
					<dt class={KV_DT}>{t('admin.smtp_port', 'Port')}</dt>
					<dd class="m-0">{smtp.port || '—'}</dd>
					<dt class={KV_DT}>TLS</dt>
					<dd class="m-0">{smtp.tls || '—'}</dd>
					<dt class={KV_DT}>{t('admin.smtp_from', 'From')}</dt>
					<dd class="m-0">{smtp.from || '—'}</dd>
					<dt class={KV_DT}>{t('admin.smtp_user_state', 'Auth')}</dt>
					<dd class="m-0">{smtp.user_state || '—'}</dd>
				</dl>
			{/if}
		</div>
		<div class={CARD}>
			<h2 class={CARD_H2}>{t('admin.smtp_test', 'Send test email')}</h2>
			<div class="flex gap-2">
				<input
					class="input flex-1"
					type="email"
					data-testid="admin-smtp-to-input"
					bind:value={smtpTo}
					placeholder={t('admin.smtp_to', 'recipient@example.com')}
				/>
				<button
					class="btn btn-primary"
					data-testid="admin-smtp-send-btn"
					disabled={smtpSending}
					onclick={runSmtpTest}
				>
					<Icon name="paper-plane" />
					{smtpSending ? t('admin.smtp_sending', 'Sending…') : t('admin.smtp_send', 'Send')}
				</button>
			</div>
			{#if smtpResult}
				{#if smtpResult.success}
					<p class="mt-3 text-success">
						<strong>{t('admin.smtp_sent', 'Test email sent.')}</strong><br />
						{t('admin.smtp_server_code', 'Server replied')}:
						<code>{smtpResult.code ?? ''} {smtpResult.message ?? ''}</code>
					</p>
				{:else}
					<p class="mt-3 text-error">
						<strong>{t('admin.smtp_fail', 'Send failed.')}</strong><br />
						<code
							>{smtpResult.error || smtpResult.message || t('common.error', 'unknown error')}</code
						>
					</p>
				{/if}
			{/if}
		</div>
	{:else if tab === 'users'}
		<div class="flex justify-end">
			<button
				class="btn btn-primary"
				data-testid="admin-users-create-btn"
				onclick={() => (createOpen = true)}
			>
				<Icon name="user-plus" />
				{t('admin.create_user', 'Create user')}
			</button>
		</div>
		{#if usersError}
			<p class="py-8 text-center text-error">{usersError}</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="table table-sm">
					<thead>
						<tr>
							<th>{t('admin.user', 'User')}</th>
							<th>{t('admin.role', 'Role')}</th>
							<th>{t('admin.auth', 'Auth')}</th>
							<th>{t('admin.status', 'Status')}</th>
							<th>{t('admin.quota', 'Storage usage')}</th>
							<th>{t('admin.last_login', 'Last login')}</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each users as u (u.id)}
							{@const pct = quotaPct(u)}
							<tr>
								<td>
									<div class="flex flex-col">
										<strong>
											{u.username || u.email}
											{#if isSelf(u)}
												<span class="badge badge-warning badge-xs ml-1 uppercase"
													>{t('admin.you_badge', 'you')}</span
												>
											{/if}
										</strong>
										<span class={MUTED}>{u.email}</span>
									</div>
								</td>
								<td>
									<span
										class="badge badge-sm uppercase {u.role === 'admin'
											? 'badge-info gap-1'
											: 'badge-ghost'}"
									>
										{#if u.role === 'admin'}<Icon name="shield-alt" />{/if}
										{u.role}
									</span>
								</td>
								<td>
									{#if isOidcUser(u)}
										<span class="badge badge-info badge-sm gap-1 uppercase" title={u.auth_provider}>
											<Icon name="key" />
											{u.auth_provider}
										</span>
									{:else}
										<span class="badge badge-ghost badge-sm uppercase"
											>{t('admin.local', 'local')}</span
										>
									{/if}
								</td>
								<td>
									<span class="badge badge-sm {u.active ? 'badge-success' : 'badge-ghost'}">
										{u.active ? t('admin.active', 'Active') : t('admin.inactive', 'Inactive')}
									</span>
								</td>
								<td>
									<div class="flex min-w-36 flex-col gap-1">
										<progress
											class="progress h-1.5 {barClass(pct)}"
											value={Math.min(pct, 100)}
											max="100"
										></progress>
										<span class={MUTED}>
											{formatBytes(u.storage_used_bytes)} / {u.storage_quota_bytes > 0
												? formatBytes(u.storage_quota_bytes)
												: '∞'}
										</span>
									</div>
								</td>
								<td class={MUTED}>{timeAgo(u.last_login_at)}</td>
								<td>
									<div class="flex flex-wrap gap-2">
										<button
											class={ICON_BTN}
											data-testid={`admin-user-quota-${u.id}`}
											title={t('admin.edit_quota_title', 'Edit quota')}
											aria-label={t('admin.edit_quota_title', 'Edit quota')}
											onclick={() => openQuota(u)}
										>
											<Icon name="box" />
										</button>
										{#if !isOidcUser(u)}
											<button
												class={ICON_BTN}
												data-testid={`admin-user-reset-password-${u.id}`}
												title={t('admin.reset_password_title', 'Reset password')}
												aria-label={t('admin.reset_password_title', 'Reset password')}
												onclick={() => openReset(u)}
											>
												<Icon name="key" />
											</button>
										{/if}
										<button
											class={ICON_BTN}
											data-testid={`admin-user-toggle-role-${u.id}`}
											title={t('admin.toggle_role_title', 'Toggle admin role')}
											aria-label={t('admin.toggle_role_title', 'Toggle admin role')}
											disabled={isSelf(u)}
											onclick={() => toggleRole(u)}
										>
											<Icon name={u.role === 'admin' ? 'user' : 'crown'} />
										</button>
										<button
											class="{ICON_BTN} {u.active ? 'text-error' : 'text-success'}"
											data-testid={`admin-user-toggle-active-${u.id}`}
											title={u.active
												? t('admin.deactivate_title', 'Deactivate')
												: t('admin.activate_title', 'Activate')}
											aria-label={u.active
												? t('admin.deactivate_title', 'Deactivate')
												: t('admin.activate_title', 'Activate')}
											disabled={isSelf(u) && u.active}
											onclick={() => toggleActive(u)}
										>
											<Icon name={u.active ? 'ban' : 'check'} />
										</button>
										<button
											class="{ICON_BTN} text-error"
											data-testid={`admin-user-delete-${u.id}`}
											title={t('admin.delete_title', 'Delete user')}
											aria-label={t('admin.delete_title', 'Delete user')}
											disabled={isSelf(u)}
											onclick={() => removeUser(u)}
										>
											<Icon name="trash-alt" />
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="flex items-center justify-center gap-4">
				<button
					class="btn btn-sm"
					data-testid="admin-users-pager-prev-btn"
					disabled={pageIndex === 0}
					onclick={() => changePage(-1)}>‹</button
				>
				<span>{pageIndex + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
				<button
					class="btn btn-sm"
					data-testid="admin-users-pager-next-btn"
					disabled={(pageIndex + 1) * PAGE_SIZE >= total}
					onclick={() => changePage(1)}>›</button
				>
			</div>
		{/if}
	{:else if tab === 'drives'}
		<div class="flex justify-end">
			<button
				class="btn btn-primary"
				data-testid="admin-drives-create-btn"
				onclick={openDriveCreate}
			>
				<Icon name="plus" />
				{t('admin.create_drive', 'Create shared drive')}
			</button>
		</div>
		{#if drivesError}
			<p class="py-8 text-center text-error">{drivesError}</p>
		{:else if drivesList.length === 0}
			<p class="py-8 text-center text-base-content/60">{t('admin.no_drives', 'No drives yet.')}</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="table table-sm">
					<thead>
						<tr>
							<th>{t('admin.drive_name', 'Name')}</th>
							<th>{t('admin.drive_kind', 'Kind')}</th>
							<th>{t('admin.drive_owners', 'Owners')}</th>
							<th>{t('admin.drive_usage', 'Usage')}</th>
							<th>{t('admin.drive_created_at', 'Created')}</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each drivesList as d (d.id)}
							{@const pct =
								d.quota_bytes && d.quota_bytes > 0
									? Math.min(100, (d.used_bytes / d.quota_bytes) * 100)
									: null}
							<tr>
								<td>
									<div class="flex flex-col">
										<strong>{d.name}</strong>
										<span class={MUTED}><code>{d.id}</code></span>
									</div>
								</td>
								<td>
									<span
										class="badge badge-sm uppercase {d.kind === 'shared'
											? 'badge-info'
											: 'badge-ghost'}"
									>
										{driveKindLabel(d)}
									</span>
								</td>
								<td>
									{#if driveMembers[d.id]}
										<OwnerAvatarStack members={driveMembers[d.id]} />
									{:else}
										<span class={MUTED}>{t('common.loading', 'Loading…')}</span>
									{/if}
								</td>
								<td>
									<div class="flex min-w-36 flex-col gap-1">
										{#if pct !== null}
											<progress class="progress h-1.5 {barClass(pct)}" value={pct} max="100"
											></progress>
										{/if}
										<span class={MUTED}>
											{formatBytes(d.used_bytes)} / {d.quota_bytes && d.quota_bytes > 0
												? formatBytes(d.quota_bytes)
												: '∞'}
										</span>
									</div>
								</td>
								<td class={MUTED}>{timeAgo(d.created_at)}</td>
								<td>
									<!-- Each action sits in a fixed grid column so icons line up
									     across rows even when the row's drive kind doesn't support
									     some of them (personal drives have no owner roster; default
									     drives can't be deleted). Inapplicable actions render as
									     invisible placeholders to reserve their column. -->
									<div class="grid grid-cols-[repeat(3,auto)] items-center justify-end gap-2">
										{#if d.kind === 'shared'}
											<button
												class={ICON_BTN}
												data-testid={`admin-drive-manage-owners-${d.id}`}
												title={t('admin.drive_manage_owners', 'Manage owners')}
												aria-label={t('admin.drive_manage_owners', 'Manage owners')}
												onclick={() => openManageOwners(d)}
											>
												<Icon name="users-cog" />
											</button>
										{:else}
											<span class="{ICON_BTN} invisible pointer-events-none" aria-hidden="true"
											></span>
										{/if}
										<!-- D5 policy editor — admin-only mutation (the owner UI no
										     longer surfaces policies at all). Available on every
										     drive kind including personal, so the operator can lock
										     a personal drive's external-sharing surface from
										     outside. -->
										<button
											class={ICON_BTN}
											data-testid={`admin-drive-manage-policies-${d.id}`}
											title={t('admin.drive_manage_policies', 'Manage policies')}
											aria-label={t('admin.drive_manage_policies', 'Manage policies')}
											onclick={() => openManagePolicies(d)}
										>
											<Icon name="shield-alt" />
										</button>
										<!-- Default-personal drives can never be deleted (backend
										     returns 405). Render an invisible placeholder so the
										     row's columns still line up with the deletable rows
										     above and below. -->
										{#if !d.default_for_user}
											<button
												class="{ICON_BTN} text-error"
												data-testid={`admin-drive-delete-${d.id}`}
												title={t('admin.drive_delete', 'Delete drive')}
												aria-label={t('admin.drive_delete', 'Delete drive')}
												onclick={() => requestDeleteDrive(d)}
											>
												<Icon name="trash-alt" />
											</button>
										{:else}
											<span class="{ICON_BTN} invisible pointer-events-none" aria-hidden="true"
											></span>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{:else if !pluginsAvailable}
		<p class="py-8 text-center text-base-content/60">
			{t('admin.plugins_disabled', 'The plugin subsystem is disabled.')}
		</p>
	{:else if pluginsError}
		<p class="py-8 text-center text-error">{pluginsError}</p>
	{:else}
		<div
			class="mb-3 flex items-center justify-between gap-3 rounded-lg border border-dashed border-base-300 p-3"
		>
			<div>
				<strong>{t('admin.plugins_install', 'Install plugin')}</strong>
				<span class="block text-sm text-base-content/60"
					>{t('admin.plugins_install_hint', 'Upload a plugin bundle (.zip).')}</span
				>
			</div>
			<label class="btn btn-primary {installing ? 'btn-disabled' : ''}">
				<Icon name="cloud-upload-alt" />
				{installing
					? t('admin.plugins_installing', 'Installing…')
					: t('admin.plugins_upload', 'Upload .zip')}
				<input
					type="file"
					data-testid="admin-plugins-install-input"
					accept=".zip,application/zip"
					hidden
					disabled={installing}
					onchange={onInstallPlugin}
				/>
			</label>
		</div>
		{#if installMsg}
			<p class={installMsg.ok ? 'text-success' : 'text-error'}>{installMsg.text}</p>
		{/if}
		{#if plugins.length === 0}
			<p class="py-8 text-center text-base-content/60">
				{t('admin.no_plugins', 'No plugins installed.')}
			</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="table table-sm">
					<thead>
						<tr>
							<th>{t('admin.plugin', 'Plugin')}</th>
							<th>{t('admin.plugins_col_id', 'ID')}</th>
							<th>{t('admin.version', 'Version')}</th>
							<th>{t('admin.plugins_col_events', 'Events')}</th>
							<th>{t('admin.status', 'Status')}</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each plugins as p (p.id)}
							<tr>
								<td>
									<div class="flex flex-col">
										<strong>{p.name}</strong>
										{#if p.description}<span class={MUTED}>{p.description}</span>{/if}
									</div>
								</td>
								<td><code>{p.id}</code></td>
								<td>{p.version ?? '—'}</td>
								<td>
									{#if p.subscriptions && p.subscriptions.length > 0}
										<span class="badge badge-ghost badge-sm">{p.subscriptions.length}</span>
									{:else}
										—
									{/if}
								</td>
								<td>
									<span class="badge badge-sm {p.enabled ? 'badge-success' : 'badge-ghost'}">
										{p.enabled ? t('admin.enabled', 'Enabled') : t('admin.disabled', 'Disabled')}
									</span>
								</td>
								<td>
									<div class="flex flex-wrap gap-2">
										<button
											class={ICON_BTN}
											data-testid={`admin-plugin-details-${p.id}`}
											title={t('admin.plugins_details', 'Logs & details')}
											aria-label={t('admin.plugins_details', 'Logs & details')}
											onclick={() => openLogs(p)}
										>
											<Icon name="list" />
										</button>
										<button
											class="{ICON_BTN} {p.enabled ? '' : 'text-success'}"
											data-testid={`admin-plugin-toggle-${p.id}`}
											title={p.enabled
												? t('admin.disable', 'Disable')
												: t('admin.enable', 'Enable')}
											aria-label={p.enabled
												? t('admin.disable', 'Disable')
												: t('admin.enable', 'Enable')}
											onclick={() => togglePlugin(p)}
										>
											<Icon name={p.enabled ? 'pause' : 'play'} />
										</button>
										<button
											class="{ICON_BTN} text-error"
											data-testid={`admin-plugin-delete-${p.id}`}
											title={t('common.delete', 'Delete')}
											aria-label={t('common.delete', 'Delete')}
											onclick={() => removePlugin(p)}
										>
											<Icon name="trash-alt" />
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</main>

<Modal bind:open={createOpen} title={t('admin.create_user', 'Create user')}>
	<form
		id="create-user-form"
		data-testid="admin-create-user-form"
		onsubmit={submitCreate}
		class={FORM}
	>
		<label class={FIELD}
			><span>{t('admin.username', 'Username')}</span>
			<input
				class="input w-full"
				bind:value={newUser.username}
				data-testid="admin-create-user-username-input"
				minlength="3"
				required
			/></label
		>
		<label class={FIELD}
			><span
				>{t('admin.email', 'Email')}
				<span class={MUTED}>({t('common.optional', 'optional')})</span></span
			>
			<input
				class="input w-full"
				type="email"
				data-testid="admin-create-user-email-input"
				bind:value={newUser.email}
				placeholder={t('admin.email_auto', 'Auto-generated if left blank')}
			/></label
		>
		<label class={FIELD}
			><span>{t('admin.password', 'Password')}</span>
			<input
				class="input w-full"
				type="password"
				data-testid="admin-create-user-password-input"
				bind:value={newUser.password}
				minlength="8"
				required
			/></label
		>
		<label class={FIELD}
			><span>{t('admin.role', 'Role')}</span>
			<select
				class="select w-full"
				bind:value={newUser.role}
				data-testid="admin-create-user-role-select"
			>
				<option value="user">user</option>
				<option value="admin">admin</option>
			</select></label
		>
		<label class={FIELD}
			><span>{t('admin.quota', 'Quota')}</span>
			<div class="flex gap-2">
				<input
					class="input flex-1"
					type="number"
					data-testid="admin-create-user-quota-input"
					min="0"
					step="0.1"
					bind:value={newUser.quotaValue}
				/>
				<select
					class="select w-auto"
					bind:value={newUser.quotaUnit}
					data-testid="admin-create-user-quota-unit-select"
				>
					{#each QUOTA_UNITS as unit (unit.label)}<option value={unit.value}>{unit.label}</option
						>{/each}
				</select>
			</div>
			<span class={MUTED}>{t('admin.quota_unlimited_hint', '0 = unlimited')}</span></label
		>
		{#if createError}<p class="text-error">{createError}</p>{/if}
	</form>
	{#snippet footer()}
		<button
			class="btn"
			data-testid="admin-create-user-cancel-btn"
			onclick={() => (createOpen = false)}>{t('common.cancel', 'Cancel')}</button
		>
		<button
			class="btn btn-primary"
			type="submit"
			form="create-user-form"
			data-testid="admin-create-user-submit-btn"
			disabled={creating}
		>
			{creating ? t('admin.creating', 'Creating…') : t('common.create', 'Create')}
		</button>
	{/snippet}
</Modal>

<!-- Create-drive modal (D3a). Personal-drive creation is omitted because
     the backend returns 501 for kind=personal today; see DrivePicker for
     UI flow and drive_handler::create_drive for the wire contract. -->
<Modal
	open={driveCreateOpen}
	title={t('admin.create_drive', 'Create shared drive')}
	onclose={() => (driveCreateOpen = false)}
>
	<form
		id="create-drive-form"
		class={FORM}
		data-testid="admin-create-drive-form"
		onsubmit={submitDriveCreate}
	>
		<label class={FIELD}>
			<span>{t('admin.drive_name', 'Name')}</span>
			<input
				class="input w-full"
				bind:value={driveForm.name}
				data-testid="admin-create-drive-name-input"
				required
				placeholder={t('admin.drive_name_placeholder', 'e.g. Engineering')}
			/>
		</label>
		<label class="{FIELD} relative">
			<span>{t('admin.drive_owner', 'Owner')}</span>
			<input
				class="input w-full"
				type="text"
				data-testid="admin-create-drive-owner-input"
				bind:value={driveForm.ownerQuery}
				oninput={(e) => searchOwnerCandidates(e.currentTarget.value)}
				placeholder={t('admin.drive_owner_placeholder', 'Search a user or group…')}
				autocomplete="off"
				required
			/>
			{#if ownerSearching}
				<span class={MUTED}>{t('common.loading', 'Loading…')}</span>
			{:else if ownerSuggestions.length > 0}
				<ul class={SUGGEST_LIST} role="listbox">
					{#each ownerSuggestions as r (`${r.type}-${r.id}`)}
						<li>
							<button
								type="button"
								class={SUGGEST_ROW}
								data-testid={`admin-drive-owner-pick-${r.type}-${r.id}`}
								onclick={() => pickOwner(r)}
							>
								<Icon name={r.type === 'group' ? 'users' : 'user'} />
								<span class="flex-1">{r.label}</span>
								{#if r.sublabel}
									<span class={MUTED}>{r.sublabel}</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			{#if driveForm.ownerPick}
				<span class="{MUTED} inline-flex items-center gap-1">
					<Icon name={driveForm.ownerPick.type === 'group' ? 'users' : 'user'} />
					{t('admin.drive_owner_picked', { name: driveForm.ownerPick.label }, 'Owner: {{name}}')}
				</span>
			{/if}
			<span class={MUTED}>
				{t(
					'admin.drive_owner_hint',
					'Pick a user (sole Owner) or a group (every member becomes Owner via subject expansion).'
				)}
			</span>
		</label>
		<label class={FIELD}>
			<span>{t('admin.quota', 'Quota')}</span>
			<div class="flex gap-2">
				<input
					class="input flex-1"
					type="number"
					data-testid="admin-create-drive-quota-input"
					min="0"
					step="0.1"
					bind:value={driveForm.quotaValue}
				/>
				<select
					class="select w-auto"
					bind:value={driveForm.quotaUnit}
					data-testid="admin-create-drive-quota-unit-select"
				>
					{#each QUOTA_UNITS as unit (unit.label)}
						<option value={unit.value}>{unit.label}</option>
					{/each}
				</select>
			</div>
			<span class={MUTED}>{t('admin.quota_unlimited_hint', '0 = unlimited')}</span>
		</label>
		{#if driveCreateError}<p class="text-error">{driveCreateError}</p>{/if}
	</form>
	{#snippet footer()}
		<button
			class="btn"
			data-testid="admin-create-drive-cancel-btn"
			onclick={() => (driveCreateOpen = false)}
		>
			{t('common.cancel', 'Cancel')}
		</button>
		<button
			class="btn btn-primary"
			type="submit"
			form="create-drive-form"
			data-testid="admin-create-drive-submit-btn"
			disabled={driveCreating}
		>
			{driveCreating ? t('admin.creating', 'Creating…') : t('common.create', 'Create')}
		</button>
	{/snippet}
</Modal>

<!-- Manage-owners modal (D3a admin bypass — calls
     /api/admin/drives/{id}/members POST/DELETE which skip the per-drive
     `Manage` check). Last-owner protection still applies server-side. -->
<Modal
	open={manageOwnersDrive !== null}
	title={manageOwnersDrive
		? t(
				'admin.drive_manage_owners_for',
				{ name: manageOwnersDrive.name },
				'Manage owners — {{name}}'
			)
		: t('admin.drive_manage_owners', 'Manage owners')}
	onclose={closeManageOwners}
>
	{#if manageOwnersDrive}
		<div class={FORM}>
			<div class="flex flex-col gap-1 text-sm">
				<label for="manage-owners-search">
					<span>{t('admin.drive_add_owner', 'Add owner')}</span>
				</label>
				<input
					id="manage-owners-search"
					class="input w-full"
					type="text"
					data-testid="admin-manage-owners-search-input"
					bind:value={manageOwnersQuery}
					oninput={(e) => searchManageOwnersCandidates(e.currentTarget.value)}
					placeholder={t('admin.drive_owner_placeholder', 'Search a user or group…')}
					autocomplete="off"
					disabled={manageOwnersBusy}
				/>
				{#if manageOwnersSearching}
					<span class={MUTED}>{t('common.loading', 'Loading…')}</span>
				{:else if manageOwnersSuggestions.length > 0}
					<ul class={SUGGEST_LIST} role="listbox">
						{#each manageOwnersSuggestions as r (`${r.type}-${r.id}`)}
							<li>
								<button
									type="button"
									class={SUGGEST_ROW}
									data-testid={`admin-manage-owners-pick-${r.type}-${r.id}`}
									onclick={() => addOwner(r)}
									disabled={manageOwnersBusy}
								>
									<Icon name={r.type === 'group' ? 'users' : 'user'} />
									<span class="flex-1">{r.label}</span>
									{#if r.sublabel}<span class={MUTED}>{r.sublabel}</span>{/if}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div>
				<h3 class="mb-2 mt-3 text-base font-semibold">
					{t('admin.drive_current_owners', 'Current owners')}
					<span class={MUTED}>({manageOwnersList.length})</span>
				</h3>
				{#if manageOwnersList.length === 0}
					<p class={MUTED}>{t('admin.drive_no_owners', 'No owners')}</p>
				{:else}
					<ul class="m-0 flex list-none flex-col gap-1 p-0">
						{#each manageOwnersList as m (`${m.subject.type}-${m.subject.id}`)}
							<li class="flex items-center gap-2 rounded-lg border border-base-300 p-2">
								{#if m.subject.type === 'user'}
									<UserVignette userId={m.subject.id} />
								{:else}
									<!-- Groups don't resolve via /api/users/{id}; render an
									     inline equivalent using the cached recipient label
									     from the share-search resolver. -->
									<span class="flex min-w-0 flex-1 items-center gap-2">
										<span
											class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-base-200"
											><Icon name="users" /></span
										>
										<span class="min-w-0 truncate">
											{resolveRecipient('group', m.subject.id).label}
										</span>
									</span>
								{/if}
								<button
									type="button"
									class="{ICON_BTN} ml-auto text-error"
									data-testid={`admin-manage-owners-remove-${m.subject.type}-${m.subject.id}`}
									title={t('common.remove', 'Remove')}
									aria-label={t('common.remove', 'Remove')}
									onclick={() => removeOwner(m)}
									disabled={manageOwnersBusy}
								>
									<Icon name="trash-alt" />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			{#if manageOwnersError}
				<p class="text-error">{manageOwnersError}</p>
			{/if}
		</div>
	{/if}
	{#snippet footer()}
		<button class="btn" data-testid="admin-manage-owners-close-btn" onclick={closeManageOwners}>
			{t('common.close', 'Close')}
		</button>
	{/snippet}
</Modal>

<!-- Manage-policies modal (D5 admin-only). Toggles for the known policy
     keys; unknown keys on the JSONB bag are preserved by the backend
     merge but not surfaced here (forward-compat is at the server).
     Save → PATCH /api/drives/{id}/policies. -->
<Modal
	open={managePoliciesDrive !== null}
	title={managePoliciesDrive
		? t(
				'admin.drive_manage_policies_for',
				{ name: managePoliciesDrive.name },
				'Manage policies — {{name}}'
			)
		: t('admin.drive_manage_policies', 'Manage policies')}
	onclose={closeManagePolicies}
>
	{#if managePoliciesDrive}
		<div class={FORM}>
			<p class={MUTED}>
				{t(
					'admin.drive_manage_policies_help',
					'Policies are admin-only — drive owners cannot mutate them. Each toggle controls one enforcement gate.'
				)}
			</p>
			<PolicyList
				values={managePoliciesDraft}
				busy={managePoliciesBusy}
				testIdPrefix="admin-policy"
				onchange={(key, next) => {
					managePoliciesDraft[key] = next;
				}}
			/>
			{#if managePoliciesError}
				<p class="text-error">{managePoliciesError}</p>
			{/if}
		</div>
	{/if}
	{#snippet footer()}
		<button
			class="btn"
			data-testid="admin-manage-policies-cancel-btn"
			onclick={closeManagePolicies}
			disabled={managePoliciesBusy}
		>
			{t('common.cancel', 'Cancel')}
		</button>
		<button
			class="btn btn-primary"
			data-testid="admin-manage-policies-save-btn"
			onclick={saveManagePolicies}
			disabled={managePoliciesBusy}
		>
			{managePoliciesBusy ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
		</button>
	{/snippet}
</Modal>

<!-- Quota edit modal -->
<Modal
	open={quotaModal !== null}
	title={t('admin.edit_quota_title', 'Edit quota')}
	onclose={() => (quotaModal = null)}
>
	{#if quotaModal}
		<form
			id="quota-form"
			class={FORM}
			data-testid="admin-quota-form"
			onsubmit={(e) => {
				e.preventDefault();
				void saveQuota();
			}}
		>
			<p class={MUTED}>
				{t('admin.quota_for', 'Quota for')} <strong>{quotaModal.username}</strong>
			</p>
			<label class={FIELD}
				><span>{t('admin.quota', 'Quota')}</span>
				<div class="flex gap-2">
					<input
						class="input flex-1"
						type="number"
						data-testid="admin-quota-value-input"
						min="0"
						step="0.1"
						bind:value={quotaModal.value}
					/>
					<select
						class="select w-auto"
						bind:value={quotaModal.unit}
						data-testid="admin-quota-unit-select"
					>
						{#each QUOTA_UNITS as unit (unit.label)}<option value={unit.value}>{unit.label}</option
							>{/each}
					</select>
				</div>
				<span class={MUTED}>{t('admin.quota_unlimited_hint', '0 = unlimited')}</span></label
			>
		</form>
	{/if}
	{#snippet footer()}
		<button class="btn" data-testid="admin-quota-cancel-btn" onclick={() => (quotaModal = null)}
			>{t('common.cancel', 'Cancel')}</button
		>
		<button
			class="btn btn-primary"
			type="submit"
			form="quota-form"
			data-testid="admin-quota-save-btn"
		>
			{t('common.save', 'Save')}
		</button>
	{/snippet}
</Modal>

<!-- Reset-password modal -->
<Modal
	open={resetModal !== null}
	title={t('admin.reset_password_title', 'Reset password')}
	onclose={() => (resetModal = null)}
>
	{#if resetModal}
		<form
			id="reset-pw-form"
			class={FORM}
			data-testid="admin-reset-password-form"
			onsubmit={submitReset}
		>
			<p class={MUTED}>
				{t('admin.reset_pw_for', 'New password for')} <strong>{resetModal.username}</strong>
			</p>
			<label class={FIELD}
				><span>{t('admin.new_password', 'New password')}</span>
				<input
					class="input w-full"
					type="password"
					data-testid="admin-reset-password-input"
					bind:value={resetPassword}
					minlength="8"
					required
				/></label
			>
			{#if resetError}<p class="text-error">{resetError}</p>{/if}
		</form>
	{/if}
	{#snippet footer()}
		<button
			class="btn"
			data-testid="admin-reset-password-cancel-btn"
			onclick={() => (resetModal = null)}>{t('common.cancel', 'Cancel')}</button
		>
		<button
			class="btn btn-primary"
			type="submit"
			form="reset-pw-form"
			data-testid="admin-reset-password-submit-btn"
			disabled={resetting}
		>
			{resetting ? t('admin.resetting', 'Resetting…') : t('admin.reset_btn', 'Reset')}
		</button>
	{/snippet}
</Modal>

<!-- Styled confirm modal (replaces native confirm) -->
<Modal
	open={confirmState !== null}
	title={t('common.confirm', 'Confirm')}
	onclose={() => resolveConfirm(false)}
>
	<p>{confirmState?.message}</p>
	{#snippet footer()}
		<button class="btn" data-testid="admin-confirm-cancel-btn" onclick={() => resolveConfirm(false)}
			>{t('common.cancel', 'Cancel')}</button
		>
		<button
			class="btn btn-primary"
			data-testid="admin-confirm-ok-btn"
			onclick={() => resolveConfirm(true)}
		>
			{t('common.confirm', 'Confirm')}
		</button>
	{/snippet}
</Modal>

<Modal
	open={logsPlugin !== null}
	title={logsPlugin?.name ?? t('admin.plugin_logs', 'Plugin logs')}
	onclose={closeLogs}
>
	{#if logsPlugin}
		<dl class="{KV} mb-4">
			<dt class={KV_DT}>{t('admin.plugins_col_id', 'ID')}</dt>
			<dd class="m-0"><code>{logsPlugin.id}</code></dd>
			<dt class={KV_DT}>{t('admin.version', 'Version')}</dt>
			<dd class="m-0">{logsPlugin.version ?? '—'}</dd>
			{#if logsPlugin.abi != null}
				<dt class={KV_DT}>ABI</dt>
				<dd class="m-0">{logsPlugin.abi}</dd>
			{/if}
			<dt class={KV_DT}>{t('admin.plugins_col_events', 'Events')}</dt>
			<dd class="m-0">
				{#if logsPlugin.subscriptions && logsPlugin.subscriptions.length > 0}
					{#each logsPlugin.subscriptions as ev (ev)}<code
							class="mb-0.5 mr-0.5 inline-block rounded bg-base-200 px-1.5 py-0.5">{ev}</code
						>
					{/each}
				{:else}
					—
				{/if}
			</dd>
			<dt class={KV_DT}>{t('admin.status', 'Status')}</dt>
			<dd class="m-0">
				<span class="badge badge-sm {logsPlugin.enabled ? 'badge-success' : 'badge-ghost'}">
					{logsPlugin.enabled ? t('admin.enabled', 'Enabled') : t('admin.disabled', 'Disabled')}
				</span>
			</dd>
		</dl>
	{/if}

	{#if retention}
		<form
			class="{FORM} mb-3 border-t border-base-300 pt-3"
			data-testid="admin-plugin-retention-form"
			onsubmit={(e) => (e.preventDefault(), saveRetention())}
		>
			<h3 class="m-0 mb-2 text-base font-semibold">
				{t('admin.plugins_retention', 'Log retention')}
			</h3>
			<label class={FIELD}
				><span>{t('admin.plugins_retention_days', 'Keep for (days)')}</span>
				<input
					class="input w-full"
					type="number"
					data-testid="admin-plugin-retention-days-input"
					min="0"
					bind:value={retentionDays}
				/></label
			>
			<label class={FIELD}
				><span>{t('admin.plugins_retention_max', 'Max size (MB)')}</span>
				<input
					class="input w-full"
					type="number"
					data-testid="admin-plugin-retention-max-input"
					min="0"
					bind:value={retentionMb}
				/></label
			>
			{#if retentionMsg}<p class={MUTED}>{retentionMsg}</p>{/if}
			<button class="btn self-start" type="submit" data-testid="admin-plugin-retention-save-btn"
				>{t('admin.plugins_retention_save', 'Save retention')}</button
			>
		</form>
	{/if}

	<div class="mb-3 flex gap-2">
		<select
			class="select select-sm w-auto"
			bind:value={logsLevel}
			data-testid="admin-plugin-logs-level-select"
			onchange={reloadLogsFromStart}
		>
			<option value="">{t('admin.logs_all', 'All levels')}</option>
			<option value="info">info</option>
			<option value="warn">warn</option>
			<option value="error">error</option>
		</select>
		<input
			class="input input-sm flex-1"
			placeholder={t('admin.logs_search', 'Search…')}
			data-testid="admin-plugin-logs-search-input"
			bind:value={logsSearch}
			onkeydown={(e) => e.key === 'Enter' && reloadLogsFromStart()}
		/>
		<button
			class="btn btn-sm"
			data-testid="admin-plugin-logs-search-btn"
			onclick={reloadLogsFromStart}>{t('common.search', 'Search')}</button
		>
		<label class="flex items-center gap-1 whitespace-nowrap text-sm text-base-content/60">
			<input
				type="checkbox"
				class="checkbox checkbox-sm"
				data-testid="admin-plugin-logs-live-checkbox"
				bind:checked={logsLive}
				onchange={toggleLive}
			/>
			<span>{t('admin.logs_live', 'Live')}</span>
		</label>
	</div>
	{#if logsLoading}
		<p class="py-8 text-center text-base-content/60">{t('common.loading', 'Loading…')}</p>
	{:else if logs.length === 0}
		<p class="py-8 text-center text-base-content/60">{t('admin.logs_empty', 'No log entries.')}</p>
	{:else}
		<div class="max-h-[50vh] overflow-auto">
			<table class="table table-sm font-mono text-xs">
				<thead>
					<tr>
						<th>{t('admin.logs_time', 'Time')}</th>
						<th>{t('admin.logs_level', 'Level')}</th>
						<th>{t('admin.logs_kind', 'Kind')}</th>
						<th>{t('admin.logs_invocation', 'Invocation')}</th>
						<th>{t('admin.logs_message', 'Message')}</th>
					</tr>
				</thead>
				<tbody>
					{#each logs as entry, i (i)}
						<tr>
							<td class="whitespace-nowrap text-base-content/60"
								>{timeAgo(entry.ts ?? entry.timestamp)}</td
							>
							<td>
								<span
									class="text-xs font-semibold uppercase {(entry.level ?? 'info').toLowerCase() ===
									'error'
										? 'text-error'
										: (entry.level ?? 'info').toLowerCase() === 'warn'
											? 'text-warning'
											: ''}">{entry.level ?? 'info'}</span
								>
							</td>
							<td><code>{logKind(entry)}</code></td>
							<td><code class="text-xs text-base-content/60">{entry.invocation_id ?? '—'}</code></td
							>
							<td class="break-words">{logMsg(entry)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
	<div class="mt-3 flex items-center justify-center gap-4">
		<button
			class="btn btn-sm"
			data-testid="admin-plugin-logs-pager-prev-btn"
			disabled={logsPage === 0}
			onclick={logsPrev}>‹</button
		>
		<span>
			{#if logsTotal === 0}
				{t('admin.logs_empty', 'No log entries.')}
			{:else}
				{t(
					'admin.logs_showing',
					{
						from: logsPage * LOGS_PAGE_SIZE + 1,
						to: Math.min((logsPage + 1) * LOGS_PAGE_SIZE, logsTotal),
						total: logsTotal
					},
					'Showing {{from}}–{{to}} of {{total}}'
				)}
			{/if}
		</span>
		<button
			class="btn btn-sm"
			data-testid="admin-plugin-logs-pager-next-btn"
			disabled={(logsPage + 1) * LOGS_PAGE_SIZE >= logsTotal}
			onclick={logsNext}>›</button
		>
	</div>
	{#snippet footer()}
		<button class="btn btn-error" data-testid="admin-plugin-logs-clear-btn" onclick={purgeLogs}
			>{t('admin.plugins_clear_logs', 'Clear logs')}</button
		>
		<button class="btn" data-testid="admin-plugin-logs-close-btn" onclick={closeLogs}>
			{t('common.close', 'Close')}
		</button>
	{/snippet}
</Modal>
