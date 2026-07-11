/** Device-authorization (RFC 8628) verification endpoints. */
import { api } from '$lib/api';
import { throwFailed } from '$lib/api/http';

export interface DeviceInfo {
	client_name?: string;
	scopes?: string;
}

/** Distinguishable failure modes the verify page renders differently. */
export type DeviceLookupError = 'unauthorized' | 'not-found' | 'failed';

/** Thrown by lookupDeviceCode so the page can show a tailored message. */
export class DeviceLookupFailure extends Error {
	constructor(readonly kind: DeviceLookupError) {
		super(kind);
		this.name = 'DeviceLookupFailure';
	}
}

/**
 * Look up a device user-code. The backend returns HTTP 200 with `{valid:false}`
 * for unknown/expired codes (NOT a non-2xx), so the body must be inspected — a
 * 2xx alone does not mean the code is good. A 401 means the caller isn't signed
 * in and must authenticate before authorizing a device.
 */
export async function lookupDeviceCode(code: string): Promise<DeviceInfo> {
	const { data, response } = await api.GET('/api/auth/device/verify', {
		params: { query: { code } }
	});
	if (response.status === 401) throw new DeviceLookupFailure('unauthorized');
	if (!response.ok || !data) throw new DeviceLookupFailure('failed');
	if (data.valid === false) throw new DeviceLookupFailure('not-found');
	return data;
}

export async function decideDevice(userCode: string, action: 'approve' | 'deny'): Promise<void> {
	const { response } = await api.POST('/api/auth/device/verify', {
		body: { user_code: userCode, action }
	});
	if (!response.ok) throwFailed(`device ${action}`, response);
}
