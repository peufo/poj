// Jeu de données du bac à sable (`bun run sandbox:reset`) : un compte connu et une
// vingtaine de vraies cartes FR→EN dont l'historique est rejoué par les services du
// domaine, à des dates relatives à `now`, pour que les états FSRS soient cohérents.
import { hashPassword } from 'better-auth/crypto';
import {
	createCardsService,
	createReviewsService,
	type CardInput,
	type Db,
	type Direction,
	type Origin,
	type Rating
} from '../domain/index';
import { assertDisposableName, resetDatabase } from './database';

export const SANDBOX_ACCOUNT = {
	name: 'Sandbox',
	email: 'sandbox@poj.local',
	password: 'sandbox-poj'
} as const;

const MINUTE = 1;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface SeedAnswer {
	/** Sens noté. */
	dir: Direction;
	/** Il y a combien de minutes. */
	ago: number;
	rating: Rating;
	origin?: Origin;
	/** Contexte demandé juste avant de répondre : la note est plafonnée à `hard`. */
	hint?: true;
	/** Note corrigée une minute après la réponse (clic malheureux). */
	amendTo?: Rating;
}

export interface SeedCard extends CardInput {
	origin: Origin;
	/** Création, il y a combien de minutes. */
	createdAgo: number;
	answers?: SeedAnswer[];
	/** Correction du texte (progression réinitialisée, historique conservé). */
	edit?: { ago: number; english: string };
	/** Indice demandé sans réponse depuis (session interrompue). */
	pendingHint?: { dir: Direction; ago: number };
	deleted?: true;
}

const fr = 'fr_to_en';
const en = 'en_to_fr';

/** Apprentissage d'un sens : `good` puis `good` dix minutes plus tard. */
const learn = (dir: Direction, ago: number, origin: Origin = 'web'): SeedAnswer[] => [
	{ dir, ago, rating: 'good', origin },
	{ dir, ago: ago - 10 * MINUTE, rating: 'good', origin }
];

export const SANDBOX_CARDS: SeedCard[] = [
	// ─── Neuves, jamais révisées ───
	{
		french: 'faire la grasse matinée',
		english: 'to have a lie-in',
		context: 'Samedi, je compte bien faire la grasse matinée.',
		origin: 'claude',
		createdAgo: 2 * HOUR
	},
	{
		french: 'un devis',
		english: 'a quote',
		context: 'Le plombier doit m’envoyer un devis pour la salle de bains.',
		origin: 'web',
		createdAgo: 1 * DAY
	},
	{
		french: 'Pourriez-vous répéter, s’il vous plaît ?',
		english: 'Could you say that again, please?',
		origin: 'web',
		createdAgo: 30 * MINUTE
	},
	{
		french: 'l’heure de pointe',
		english: 'rush hour',
		origin: 'claude',
		createdAgo: 3 * DAY
	},

	// ─── En apprentissage : vue il y a peu, revient dans quelques minutes ───
	{
		french: 'avoir le trac',
		english: 'to have stage fright',
		context: 'Avant ma présentation au comité de direction, j’avais un trac fou.',
		origin: 'web',
		createdAgo: 1 * DAY,
		answers: [{ dir: fr, ago: 3 * MINUTE, rating: 'good' }]
	},
	// Mûre, ratée il y a quatre minutes : réapprentissage (note encore corrigeable).
	{
		french: 'poser un lapin à quelqu’un',
		english: 'to stand someone up',
		context: 'Thomas m’a posé un lapin au restaurant hier soir.',
		origin: 'claude',
		createdAgo: 60 * DAY,
		answers: [
			...learn(fr, 60 * DAY, 'claude'),
			...learn(en, 59 * DAY, 'claude'),
			{ dir: fr, ago: 57 * DAY, rating: 'good', origin: 'claude' },
			{ dir: en, ago: 55 * DAY, rating: 'good', origin: 'claude' },
			{ dir: fr, ago: 45 * DAY, rating: 'good', origin: 'claude' },
			{ dir: en, ago: 40 * DAY, rating: 'hard', origin: 'claude' },
			{ dir: fr, ago: 4 * MINUTE, rating: 'again', origin: 'claude' }
		]
	},

	// ─── Dues maintenant ───
	{
		french: 'avoir du mal à',
		english: 'to struggle to',
		context: 'J’ai du mal à me concentrer en open space.',
		origin: 'web',
		createdAgo: 12 * DAY,
		answers: [
			...learn(fr, 12 * DAY),
			...learn(en, 11 * DAY),
			{ dir: fr, ago: 9 * DAY, rating: 'good' }
		]
	},
	{
		french: 'coûter les yeux de la tête',
		english: 'to cost an arm and a leg',
		context: 'Les billets de train pour Londres coûtent les yeux de la tête en août.',
		origin: 'claude',
		createdAgo: 8 * DAY,
		answers: [...learn(fr, 8 * DAY, 'claude'), ...learn(en, 7 * DAY, 'claude')]
	},
	{
		french: 'Ça ne me dit rien.',
		english: 'It doesn’t ring a bell.',
		origin: 'web',
		createdAgo: 6 * DAY,
		answers: [
			{ dir: fr, ago: 6 * DAY, rating: 'hard' },
			{ dir: fr, ago: 6 * DAY - 6 * MINUTE, rating: 'good' },
			{ dir: fr, ago: 6 * DAY - 16 * MINUTE, rating: 'good' },
			{ dir: en, ago: 5 * DAY, rating: 'again' },
			{ dir: en, ago: 5 * DAY - 2 * MINUTE, rating: 'good' },
			{ dir: en, ago: 5 * DAY - 12 * MINUTE, rating: 'good' }
		]
	},
	// Indice demandé puis réponse plafonnée à `hard`.
	{
		french: 'une piste',
		english: 'a lead',
		context: 'Dans le polar que je lis, l’inspecteur suit enfin une piste sérieuse.',
		origin: 'web',
		createdAgo: 10 * DAY,
		answers: [
			...learn(fr, 10 * DAY),
			...learn(en, 9 * DAY),
			{ dir: fr, ago: 5 * DAY, rating: 'good', hint: true }
		]
	},
	// Indice demandé il y a cinq minutes, sans réponse : la prochaine note sera plafonnée.
	{
		french: 'rattraper son retard',
		english: 'to catch up',
		context: 'Après deux semaines de vacances, je dois rattraper mon retard de mails.',
		origin: 'claude',
		createdAgo: 9 * DAY,
		answers: [...learn(fr, 9 * DAY, 'claude'), ...learn(en, 8 * DAY, 'claude')],
		pendingHint: { dir: fr, ago: 5 * MINUTE }
	},

	// ─── Très en retard ───
	{
		french: 'couper les cheveux en quatre',
		english: 'to split hairs',
		context: 'En réunion budget, Marc coupe toujours les cheveux en quatre.',
		origin: 'web',
		createdAgo: 120 * DAY,
		answers: [
			...learn(fr, 120 * DAY),
			...learn(en, 119 * DAY),
			{ dir: fr, ago: 117 * DAY, rating: 'good' },
			{ dir: en, ago: 116 * DAY, rating: 'hard' },
			{ dir: fr, ago: 108 * DAY, rating: 'good' }
		]
	},
	{
		french: 'Il pleut des cordes.',
		english: 'It’s raining cats and dogs.',
		origin: 'claude',
		createdAgo: 75 * DAY,
		answers: [...learn(fr, 75 * DAY, 'claude'), ...learn(en, 74 * DAY, 'claude')]
	},

	// ─── Mûres : plusieurs révisions dont un oubli, échéance lointaine ───
	{
		french: 'tenir pour acquis',
		english: 'to take for granted',
		context: 'Dans un podcast sur la santé : « On tient trop souvent son corps pour acquis. »',
		origin: 'web',
		createdAgo: 200 * DAY,
		answers: [
			...learn(fr, 200 * DAY),
			...learn(en, 199 * DAY),
			{ dir: fr, ago: 196 * DAY, rating: 'good' },
			{ dir: en, ago: 195 * DAY, rating: 'good' },
			{ dir: fr, ago: 185 * DAY, rating: 'good' },
			{ dir: en, ago: 183 * DAY, rating: 'easy' },
			{ dir: fr, ago: 160 * DAY, rating: 'again' },
			{ dir: fr, ago: 160 * DAY - 10 * MINUTE, rating: 'good' },
			{ dir: fr, ago: 150 * DAY, rating: 'good' },
			{ dir: fr, ago: 120 * DAY, rating: 'good' },
			{ dir: en, ago: 100 * DAY, rating: 'good' },
			{ dir: fr, ago: 40 * DAY, rating: 'good', origin: 'claude' },
			{ dir: en, ago: 20 * DAY, rating: 'good', origin: 'claude' }
		]
	},
	{
		french: 'en fin de compte',
		english: 'at the end of the day',
		origin: 'claude',
		createdAgo: 150 * DAY,
		answers: [
			...learn(fr, 150 * DAY, 'claude'),
			...learn(en, 149 * DAY, 'claude'),
			{ dir: fr, ago: 146 * DAY, rating: 'good', origin: 'claude' },
			{ dir: en, ago: 145 * DAY, rating: 'again', origin: 'claude' },
			{ dir: en, ago: 145 * DAY - 10 * MINUTE, rating: 'good', origin: 'claude' },
			{ dir: fr, ago: 135 * DAY, rating: 'good', origin: 'claude' },
			{ dir: en, ago: 140 * DAY, rating: 'good', origin: 'claude' },
			{ dir: en, ago: 125 * DAY, rating: 'good', origin: 'claude' },
			{ dir: fr, ago: 100 * DAY, rating: 'good' },
			{ dir: en, ago: 90 * DAY, rating: 'good' },
			{ dir: fr, ago: 25 * DAY, rating: 'good', origin: 'claude' },
			{ dir: en, ago: 15 * DAY, rating: 'good', origin: 'claude' }
		]
	},
	{
		french: 'Ça vaut le coup.',
		english: 'It’s worth it.',
		context: 'Le détour par le lac de Joux, ça vaut vraiment le coup.',
		origin: 'web',
		createdAgo: 90 * DAY,
		answers: [
			{ dir: fr, ago: 90 * DAY, rating: 'easy' },
			{ dir: en, ago: 89 * DAY, rating: 'easy' },
			{ dir: fr, ago: 80 * DAY, rating: 'good' },
			{ dir: en, ago: 78 * DAY, rating: 'good' },
			{ dir: fr, ago: 45 * DAY, rating: 'easy' },
			{ dir: en, ago: 40 * DAY, rating: 'good' }
		]
	},
	{
		french: 'prendre du recul',
		english: 'to take a step back',
		context: 'Ma manager m’a conseillé de prendre du recul avant de répondre au client.',
		origin: 'claude',
		createdAgo: 100 * DAY,
		answers: [
			...learn(fr, 100 * DAY, 'claude'),
			...learn(en, 99 * DAY, 'claude'),
			{ dir: fr, ago: 96 * DAY, rating: 'good', origin: 'claude' },
			{ dir: en, ago: 95 * DAY, rating: 'good', origin: 'claude' },
			{ dir: fr, ago: 85 * DAY, rating: 'good' },
			{ dir: en, ago: 80 * DAY, rating: 'good' },
			{ dir: fr, ago: 50 * DAY, rating: 'good' },
			{ dir: en, ago: 30 * DAY, rating: 'good', origin: 'claude' }
		]
	},

	// ─── Réponse de moins d'une heure : la note est encore corrigeable ───
	{
		french: 'faire le point',
		english: 'to take stock',
		context: 'On fait le point sur le projet jeudi à 14 h.',
		origin: 'web',
		createdAgo: 14 * DAY,
		answers: [
			...learn(fr, 14 * DAY),
			...learn(en, 13 * DAY),
			{ dir: en, ago: 10 * DAY, rating: 'good' },
			{ dir: fr, ago: 20 * MINUTE, rating: 'good' }
		]
	},

	// ─── Sens inverse mis de côté : dû, mais l'autre sens a été noté il y a 3 h ───
	{
		french: 'mettre les pieds dans le plat',
		english: 'to put one’s foot in it',
		context: 'J’ai mis les pieds dans le plat en parlant de la fête surprise devant Julie.',
		origin: 'web',
		createdAgo: 20 * DAY,
		answers: [
			...learn(fr, 20 * DAY),
			...learn(en, 19 * DAY),
			{ dir: en, ago: 17 * DAY, rating: 'good' },
			{ dir: fr, ago: 3 * HOUR, rating: 'good' }
		]
	},

	// ─── Doublon : même anglais, sens et contexte différents ───
	{
		french: 'une allumette',
		english: 'a match',
		context: 'Passe-moi les allumettes pour allumer le barbecue.',
		origin: 'web',
		createdAgo: 5 * DAY,
		answers: learn(fr, 4 * DAY)
	},
	{
		french: 'un match',
		english: 'a match',
		context: 'On regarde le match de foot ce soir au pub avec les collègues.',
		origin: 'claude',
		createdAgo: 2 * DAY
	},

	// ─── Pas encore dues ───
	{
		french: 'Je te tiens au courant.',
		english: 'I’ll keep you posted.',
		origin: 'web',
		createdAgo: 9 * DAY,
		answers: [
			// Clic malheureux sur « Again », corrigé aussitôt.
			{ dir: fr, ago: 9 * DAY, rating: 'again', amendTo: 'good' },
			{ dir: fr, ago: 9 * DAY - 10 * MINUTE, rating: 'good' },
			...learn(en, 8 * DAY),
			{ dir: fr, ago: 6 * DAY, rating: 'good' },
			{ dir: en, ago: 5 * DAY, rating: 'good' }
		]
	},
	{
		french: 'manger sur le pouce',
		english: 'to grab a quick bite',
		context: 'Pas le temps de déjeuner : je mange sur le pouce entre deux réunions.',
		origin: 'claude',
		createdAgo: 11 * DAY,
		answers: [
			...learn(fr, 11 * DAY, 'claude'),
			...learn(en, 10 * DAY, 'claude'),
			{ dir: fr, ago: 8 * DAY, rating: 'good', origin: 'claude' },
			{ dir: en, ago: 7 * DAY, rating: 'easy', origin: 'claude' }
		]
	},
	{
		french: 'Ce n’est pas ma tasse de thé.',
		english: 'It’s not my cup of tea.',
		origin: 'claude',
		createdAgo: 4 * DAY,
		answers: [
			{ dir: fr, ago: 4 * DAY, rating: 'easy', origin: 'claude' },
			{ dir: en, ago: 3 * DAY, rating: 'easy', origin: 'claude' }
		]
	},

	// ─── Corrigée : texte modifié, progression réinitialisée, historique conservé ───
	{
		french: 'l’ordre du jour',
		english: 'the order of the day',
		context: 'Envoie-moi l’ordre du jour de la réunion de demain.',
		origin: 'web',
		createdAgo: 15 * DAY,
		answers: [...learn(fr, 15 * DAY), ...learn(en, 14 * DAY)],
		edit: { ago: 2 * DAY, english: 'the agenda' }
	},

	// ─── Supprimée ───
	{
		french: 'être aux anges',
		english: 'to be over the moon',
		origin: 'web',
		createdAgo: 30 * DAY,
		answers: learn(fr, 30 * DAY),
		deleted: true
	}
];

// Le hachage (scrypt) coûte ~50 ms : une fois par processus suffit.
let passwordHash: Promise<string> | undefined;

/**
 * Vide la base puis y charge le compte et les cartes du bac à sable. Refuse toute base
 * autre que `poj_sandbox` ou `poj_test`.
 */
export async function seedSandbox(db: Db, { now = new Date() }: { now?: Date } = {}) {
	const [{ name }] = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
	assertDisposableName(name);
	await resetDatabase(db);

	const at = (ago: number) => new Date(now.getTime() - ago * 60_000);
	const cards = createCardsService(db);
	const reviews = createReviewsService(db);

	const user = await db.user.create({
		data: {
			name: SANDBOX_ACCOUNT.name,
			email: SANDBOX_ACCOUNT.email,
			emailVerified: true,
			createdAt: at(365 * DAY)
		}
	});
	// Compte email/mot de passe tel que Better Auth le crée à l'inscription.
	await db.account.create({
		data: {
			userId: user.id,
			accountId: user.id,
			providerId: 'credential',
			password: await (passwordHash ??= hashPassword(SANDBOX_ACCOUNT.password))
		}
	});

	for (const seed of SANDBOX_CARDS) {
		const { french, english, context, origin } = seed;
		const { card, created } = await cards.createOnce(
			user.id,
			{ french, english, context },
			origin,
			at(seed.createdAgo)
		);
		if (!created) throw new Error(`Seed card "${french}" already exists`);
		const reviewId = Object.fromEntries(card.reviews.map((r) => [r.direction, r.id])) as Record<
			Direction,
			string
		>;
		// Version attendue par `answer` : date de la dernière réponse, `new` sans réponse.
		const version: Record<Direction, string> = { fr_to_en: 'new', en_to_fr: 'new' };

		async function answer({ dir, ago, rating, origin = 'web', hint, amendTo }: SeedAnswer) {
			const id = reviewId[dir];
			// Indice demandé trente secondes avant la réponse.
			if (hint) await reviews.requestHint(user.id, id, at(ago + 0.5));
			const result = await reviews.answer(
				user.id,
				id,
				{ rating, version: version[dir], origin },
				at(ago)
			);
			if (result.replayed) throw new Error(`Seed answer on "${french}" was not applied`);
			version[dir] = at(ago).toISOString();
			if (amendTo) await reviews.amend(user.id, id, amendTo, at(ago - 1));
		}

		async function edit({ ago, english: corrected }: NonNullable<SeedCard['edit']>) {
			await cards.update(user.id, card.id, { french, english: corrected, context }, at(ago));
			version.fr_to_en = version.en_to_fr = 'new';
		}

		// Toutes les actions de la carte, rejouées dans l'ordre chronologique.
		const events: { ago: number; run: () => Promise<unknown> }[] = (seed.answers ?? []).map(
			(a) => ({ ago: a.ago, run: () => answer(a) })
		);
		if (seed.edit) events.push({ ago: seed.edit.ago, run: () => edit(seed.edit!) });
		if (seed.pendingHint) {
			const { dir, ago } = seed.pendingHint;
			events.push({ ago, run: () => reviews.requestHint(user.id, reviewId[dir], at(ago)) });
		}
		for (const { ago, run } of events.sort((a, b) => b.ago - a.ago)) {
			if (ago <= 0 || ago > seed.createdAgo) {
				throw new Error(`Seed event out of range for "${french}"`);
			}
			await run();
		}
		if (seed.deleted) await cards.softDelete(user.id, card.id);
	}

	return { userId: user.id };
}
