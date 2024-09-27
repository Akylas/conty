import { Application } from '@nativescript/core';
import { CommonNotification, ProgressOptions } from './ProgressNotifications';

export function show(options: ProgressOptions) {
    // Application.notify({ eventName: 'appMessage', title: options.title, progress: options.progress });
}
export function update(notification: CommonNotification, options: Partial<ProgressOptions> & { hideProgressBar?: boolean }) {
    // Application.notify({ eventName: 'appMessageUpdate', title: options.title, progress: options.progress });

}
export function dismiss(id: number) {}
