const actionCallbacks: Record<string, Record<string, Function[]>> = {};
export function addActionCallback(notificationId, actionId, callback) {
    let notifActions = actionCallbacks[notificationId];
    if (!notifActions) {
        notifActions = actionCallbacks[notificationId] = {};
    }
    let actions = notifActions[actionId];
    if (!actions) {
        actions = notifActions[actionId] = [];
    }
    actions.push(callback);
}
export function removeActionCallback(notificationId, actionId, callback) {
    const notifActions = actionCallbacks[notificationId];
    if (!notifActions) {
        return;
    }
    const actions = notifActions[actionId];
    if (!actions) {
        return;
    }
    const index = actions.indexOf(callback);
    index && actions.splice(index, 1);
}
export function removeNotificationCallbacks(notificationId) {
    delete actionCallbacks[notificationId];
}

@NativeClass
@JavaProxy('__PACKAGE__.ActionReceiver')
export class ActionReceiver extends android.content.BroadcastReceiver {
    public onReceive(context: android.content.Context, intent: android.content.Intent) {
        const notificationId = intent.getIntExtra('notificationId', 0);
        const actionId = intent.getAction();
        const thisActionCallbacks = actionCallbacks[notificationId]?.[actionId];
        if (thisActionCallbacks) {
            thisActionCallbacks.forEach((c) => c(intent));
        }
    }
}
