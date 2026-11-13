import { describe, expect, it } from 'vitest';
import { readPushMessage } from './push';

describe('readPushMessage', () => {
	it('reads the title and body of a JSON message', () => {
		expect(readPushMessage('{"title":"Révision","body":"5 cartes sont prêtes."}')).toEqual({
			title: 'Révision',
			body: '5 cartes sont prêtes.'
		});
	});

	it('shows plain text as the body, under the app name', () => {
		expect(readPushMessage('Test push message from DevTools.')).toEqual({
			title: 'Poj',
			body: 'Test push message from DevTools.'
		});
		expect(readPushMessage('42')).toEqual({ title: 'Poj', body: '42' });
	});

	it('falls back on the app name when the title is missing or invalid', () => {
		expect(readPushMessage('{"body":"Une révision attend."}')).toEqual({
			title: 'Poj',
			body: 'Une révision attend.'
		});
		expect(readPushMessage('{"title":3}')).toEqual({ title: 'Poj', body: '' });
	});

	it('shows the app name alone for an empty message', () => {
		expect(readPushMessage(undefined)).toEqual({ title: 'Poj', body: '' });
		expect(readPushMessage('')).toEqual({ title: 'Poj', body: '' });
	});
});
