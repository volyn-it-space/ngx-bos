import { Routes } from '@angular/router';

/** Used by both `/tasks` (an employee's own tasks) and `/admin/tasks` (all tasks). */
export const routes: Routes = [
	{
		path: '',
		loadComponent: () =>
			import('./tasks.component').then((m) => m.TasksComponent),
	},
];
