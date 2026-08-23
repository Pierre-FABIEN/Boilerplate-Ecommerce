import { isDummySecret } from '../../src/lib/server/dummy-secrets';

export { isDummySecret };

export function hasLiveOpenCage(): boolean {
	return !isDummySecret(process.env.SECRET_OPENCAGEDATA_KEY);
}

export function hasLiveGoogleOAuth(): boolean {
	return !isDummySecret(process.env.GOOGLE_CLIENT_ID);
}

export function hasLiveCloudinary(): boolean {
	return (
		!isDummySecret(process.env.CLOUDINARY_CLOUD_NAME) &&
		!isDummySecret(process.env.CLOUDINARY_API_KEY) &&
		!isDummySecret(process.env.CLOUDINARY_API_SECRET)
	);
}

export function hasLiveBrevo(): boolean {
	const host = (process.env.SMTP_LIVE_HOST ?? '').trim().replace(/^['"]|['"]$/g, '');
	if (!host || host === '127.0.0.1' || host === 'localhost') return false;
	return (
		!isDummySecret(host) &&
		!isDummySecret(process.env.SMTP_LIVE_USER) &&
		!isDummySecret(process.env.SMTP_LIVE_PASS)
	);
}

export function hasLiveInbox(): boolean {
	const inbox = (process.env.E2E_LIVE_INBOX ?? '').trim();
	return inbox.includes('@') && !isDummySecret(inbox);
}

export function hasLiveSendcloud(): boolean {
	return (
		!isDummySecret(process.env.SENDCLOUD_PUBLIC_KEY) &&
		!isDummySecret(process.env.SENDCLOUD_SECRET_KEY) &&
		!isDummySecret(process.env.SENDCLOUD_INTEGRATION_ID)
	);
}
