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
