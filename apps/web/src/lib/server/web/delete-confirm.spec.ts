import { describe, expect, it } from 'vitest';
import { unconfirmedDelete } from './delete-confirm';

const formOf = (fields: Record<string, string>) => {
	const form = new FormData();
	for (const [name, value] of Object.entries(fields)) form.set(name, value);
	return form;
};

describe('delete confirmation', () => {
	it('lets a confirmed delete through', () => {
		expect(unconfirmedDelete(formOf({ confirm: '1' }))).toBeNull();
	});

	it('asks for confirmation otherwise', () => {
		for (const form of [formOf({}), formOf({ confirm: '0' })]) {
			expect(unconfirmedDelete(form)).toMatchObject({
				status: 400,
				data: { confirmDelete: true }
			});
		}
	});
});
