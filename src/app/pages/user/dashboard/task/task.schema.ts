import { required, schema } from '@angular/forms/signals';
import type { BosTask } from '../../../../feature/firebase/firebase-tasks.service';

export const taskSchema = schema<BosTask>((path) => {
	required(path.title, { message: 'Enter the task title...' });
});
