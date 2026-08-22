// -----------------------------------------------------------------------------
// Client OAuth Google (arctic).
//
// `VITE_GOOGLE_REDIRECT_URI` doit correspondre exactement à l'URI déclarée dans
// la console Google Cloud, y compris le protocole et le port, sinon l'échange de
// code échoue. Le parcours associé est dans `src/routes/auth/login/google/`.
// -----------------------------------------------------------------------------

import { Google } from 'arctic';
import {
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET,
	VITE_GOOGLE_REDIRECT_URI
} from '$env/static/private';

export const google = new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, VITE_GOOGLE_REDIRECT_URI);
