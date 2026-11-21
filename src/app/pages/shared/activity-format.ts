import type { TranslateService } from '@wawjs/ngx-translate';
import type { BosActivity, BosActivityAction, BosActivityEntity } from '../../feature/firebase/firebase-activity.service';

const ACTION_LABELS: Record<BosActivityAction, string> = {
	create: 'Created',
	update: 'Updated',
	delete: 'Deleted',
	accept: 'Accepted',
	ignore: 'Ignored',
	request: 'Requested',
};

const ENTITY_LABELS: Record<BosActivityEntity, string> = {
	task: 'Task',
	customer: 'Customer',
	product: 'Product',
	order: 'Order',
	employee: 'Employee',
	'employee-request': 'Employee request',
	company: 'Company',
	translation: 'Translation',
};

/** A table row of the activity log or of the notifications. */
export interface ActivityRow {
	id: string;
	time: string;
	who: string;
	action: string;
	what: string;
	title: string;
	notified: string;
	status: string;
}

/** The row of one entry: the labels are translated, the time is in the language of the browser. */
export function activityRow(entry: BosActivity, translate: TranslateService): ActivityRow {
	const t = (text: string) => translate.translate(text)();

	return {
		id: entry.id,
		time: new Date(entry.createdAt).toLocaleString(),
		who: entry.actorName || entry.actorEmail,
		action: t(ACTION_LABELS[entry.action] ?? 'Updated'),
		what: t(ENTITY_LABELS[entry.entity] ?? 'Task'),
		title: entry.title,
		notified: entry.recipientEmail,
		status: t(entry.read ? 'Read' : 'New'),
	};
}
