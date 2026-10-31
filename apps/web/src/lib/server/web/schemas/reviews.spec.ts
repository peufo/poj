import { describe, expect, it } from 'vitest';
import { amendSchema, answerSchema, hintSchema, reviewSearchSchema } from './reviews';

const REVIEW = '0199a0a0-0000-7000-8000-000000000000';

describe('review forms', () => {
	it('takes the answer of a review, with its version', () => {
		expect(answerSchema.parse({ reviewId: REVIEW, rating: 'good', version: 'v1' })).toEqual({
			reviewId: REVIEW,
			rating: 'good',
			version: 'v1'
		});
		const missing = answerSchema.safeParse({ reviewId: REVIEW, rating: 'perfect' });
		expect(missing.error?.issues.map((issue) => issue.message)).toEqual(['Choisis une note.']);
	});

	it('refuses an id that is not one', () => {
		for (const schema of [hintSchema, answerSchema, amendSchema]) {
			const result = schema.safeParse({ reviewId: 'abc', rating: 'good' });
			expect(result.error?.issues.map((issue) => issue.path[0])).toContain('reviewId');
		}
	});

	it('requires a rating to amend', () => {
		expect(amendSchema.parse({ reviewId: REVIEW, rating: 'hard' }).rating).toBe('hard');
		for (const rating of [undefined, 'perfect']) {
			expect(amendSchema.safeParse({ reviewId: REVIEW, rating }).success).toBe(false);
		}
	});

	it('reads the options of the review page', () => {
		expect(reviewSearchSchema.parse({})).toEqual({ ahead: false, reveal: false });
		expect(reviewSearchSchema.parse({ ahead: '1', reveal: 'yes' })).toEqual({
			ahead: true,
			reveal: false
		});
	});
});
