import { Component, computed, inject, signal } from '@angular/core';
import { form, submit } from '@angular/forms/signals';
import { TranslateDirective, TranslateService } from '@wawjs/ngx-translate';
import { AlertService, ButtonComponent, InputComponent } from '@wawjs/ngx-ui';
import {
	BosTask,
	FirebaseTasksService,
	NEW_TASK,
} from '../../../../feature/firebase/firebase-tasks.service';
import { taskSchema } from './task.schema';
import { FirebaseErrorService } from '../../../../feature/firebase/firebase-errors';

@Component({
	selector: 'app-dashboard-task',
	imports: [ButtonComponent, InputComponent, TranslateDirective],
	templateUrl: './task.component.html',
})
export class DashboardTaskComponent {
	private readonly _tasksService = inject(FirebaseTasksService);
	private readonly _alertService = inject(AlertService);
	private readonly _errors = inject(FirebaseErrorService);
	readonly translateService = inject(TranslateService);

	readonly taskModel = signal<BosTask>({ ...NEW_TASK });

	readonly taskForm = form(this.taskModel, taskSchema);
	readonly saving = signal(false);
	readonly isSubmitDisabled = computed(() => this.taskForm().invalid() || this.saving());

	wFormSubmit() {
		submit(this.taskForm, async (field) => {
			this.saving.set(true);

			try {
				await this._tasksService.create(field().value());

				this._alertService.success({
					text: this.translateService.translate('Task has been created')(),
				});

				// Clear the form only after the task was saved.
				this.taskModel.set({ ...NEW_TASK });
			} catch (error) {
				this._errors.report(error, '[task]');
			} finally {
				this.saving.set(false);
			}

			return undefined;
		});
	}
}
