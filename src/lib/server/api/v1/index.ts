import { createApp } from '../factory';
import { notesApp } from './notes';

export const v1 = createApp().route('/', notesApp);
