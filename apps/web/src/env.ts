import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'PostgreSQL connection string used by Prisma.' },
	ORIGIN: {
		description: 'The app origin (base URL), e.g. `http://localhost:5173`.'
	},
	BETTER_AUTH_SECRET: {
		description:
			'Secret used to sign tokens. For production use 32 characters generated with high entropy. See [Better Auth installation](https://www.better-auth.com/docs/installation).'
	},
	DEEPL_API_KEY: {
		description:
			'DeepL API key (free keys end with `:fx`). Optional: without it, DeepL suggestions are disabled.',
		schema: (value) => value || undefined
	},
	VAPID_PUBLIC_KEY: {
		description:
			'VAPID public key for Web Push (`bunx web-push generate-vapid-keys`). Optional: without the three VAPID variables, review notifications are unavailable.',
		schema: (value) => value || undefined
	},
	VAPID_PRIVATE_KEY: {
		description: 'VAPID private key for Web Push, paired with `VAPID_PUBLIC_KEY`. Optional.',
		schema: (value) => value || undefined
	},
	VAPID_SUBJECT: {
		description:
			'Contact sent to push services, a `mailto:` or `https:` URL (e.g. `mailto:admin@example.com`). Optional.',
		schema: (value) => value || undefined
	}
});
