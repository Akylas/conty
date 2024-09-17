export * from './ProgressNotifications.android';

export interface ProgressOptions {
    id: number;
    title?: string;
    notifTitle?: string;
    message?: string;
    notifMessage?: string;
    smallIcon?: string;
    rightIcon?: string;
    icon?: string;
    rightMessage?: string;
    indeterminate?: boolean;
    progress?: number;
    ongoing?: boolean;
    actions?: {
        icon?: number;
        id: string;
        text: string;
        notifText?: string;
        callback?: Function;
    }[];
}
export interface CommonNotification {
    id: number;
    builder: androidx.core.app.NotificationCompat.Builder;
}
