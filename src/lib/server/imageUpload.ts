/** Formats acceptés par les uploads Cloudinary (logo boutique et images produit). */
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Valide un fichier image avant envoi à Cloudinary.
 *
 * `File.type` est fourni par le client et l'attribut `accept` du champ est
 * contournable : sans ce contrôle serveur, un SVG porteur de script ou un
 * fichier de plusieurs centaines de Mo partent tels quels vers Cloudinary.
 * Retourne `null` si le fichier est acceptable, sinon le message d'erreur.
 */
export function validateImageUpload(file: File): string | null {
	if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
		return 'Format d’image non supporté (PNG, JPEG, WebP ou AVIF attendu).';
	}
	if (file.size > MAX_IMAGE_BYTES) {
		return 'Image trop volumineuse (5 Mo maximum).';
	}
	return null;
}
