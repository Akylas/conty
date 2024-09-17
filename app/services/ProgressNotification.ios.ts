import { CommonNotification, ProgressOptions } from './ProgressNotifications';

export function show(options: ProgressOptions) {}
export function update(notification: CommonNotification, options: Partial<ProgressOptions> & { hideProgressBar?: boolean }) {}
export function dismiss(id: number) {}
