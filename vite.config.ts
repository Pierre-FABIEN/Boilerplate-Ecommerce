import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { dropStalePwa } from './vite-plugin-drop-stale-pwa';

/** @type {import('vite').UserConfig} */
export default defineConfig({
	plugins: [dropStalePwa(), tailwindcss(), sveltekit()],

	optimizeDeps: {
		exclude: ['@node-rs/argon2', '@node-rs/bcrypt']
	},

	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	},

	server: {
		port: 2000,
		strictPort: true,
		watch: {
			usePolling: true,
			interval: 1000
		}
	},

	preprocess: [vitePreprocess()],

	clearScreen: false
});
