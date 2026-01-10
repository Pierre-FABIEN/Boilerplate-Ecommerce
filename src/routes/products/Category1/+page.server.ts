import type { PageServerLoad } from './$types';
import { documentToHtmlString } from '@contentful/rich-text-html-renderer';
import { SECRET_CONTENTFUL_ACCESS_TOKEN, SECRET_CONTENTFUL_SPACE_ID } from '$env/static/private'

export const load: PageServerLoad = async () => {
  const CONTENT_TYPE = "produitsTest"; // Change selon ton content type

  const url = new URL(`https://cdn.contentful.com/spaces/${SECRET_CONTENTFUL_SPACE_ID}/environments/master/entries`);
  url.searchParams.append('access_token', SECRET_CONTENTFUL_ACCESS_TOKEN);
  url.searchParams.append('content_type', CONTENT_TYPE);
  url.searchParams.append('include', '2'); // pour récupérer la gallery

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Erreur Contentful:', errorText);
      return { items: [] };
    }

    const data = await response.json();

    const items = (data.items || []).map((item: any) => {
      const fields = item.fields;

      // Catégorie (texte simple)
      const category = fields.category ?? 'Non catégorisé';

      // Galerie d'images
      let gallery: string[] = [];
      if (fields.gallery && Array.isArray(fields.gallery)) {
        gallery = fields.gallery
          .map((mediaRef: any) => {
            const asset = data.includes?.Asset?.find((a: any) => a.sys.id === mediaRef.sys.id);
            if (!asset || !asset.fields?.file?.url) return null;
            return asset.fields.file.url.startsWith('http')
              ? asset.fields.file.url
              : `https:${asset.fields.file.url}`;
          })
          .filter(Boolean) as string[];
      }

      // Description Rich Text convertie en HTML
      const descriptionHtml = fields.description
        ? documentToHtmlString(fields.description)
        : '';

      return {
        title: fields.title || 'Sans titre',
        description: descriptionHtml,
        price: fields.price ?? null,
        category,
        gallery
      };
    });

    return { items };

  } catch (error) {
    console.error('❌ Erreur:', error);
    return { items: [] };
  }
};
