import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		//permet de récupérer les données de l'utilisateur 
		//user: locals.user,

		//permet de récupérer la commande en cours
		//pendingOrder: locals.pendingOrder
	};
};
