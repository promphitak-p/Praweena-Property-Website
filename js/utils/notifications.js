/**
 * Browser Notification Utility
 * Handles notification permissions, scheduling, and delivery
 */

/**
 * Check if notifications are supported
 */
export function isNotificationSupported() {
    return 'Notification' in window;
}

/**
 * Get current notification permission status
 */
export function getNotificationPermission() {
    if (!isNotificationSupported()) return 'unsupported';
    return Notification.permission;
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission() {
    if (!isNotificationSupported()) {
        return { granted: false, reason: 'Notifications not supported' };
    }

    if (Notification.permission === 'granted') {
        return { granted: true, reason: 'Already granted' };
    }

    if (Notification.permission === 'denied') {
        return { granted: false, reason: 'Permission denied by user' };
    }

    try {
        const permission = await Notification.requestPermission();
        return {
            granted: permission === 'granted',
            reason: permission === 'granted' ? 'Permission granted' : 'Permission denied'
        };
    } catch (error) {
        console.error('Error requesting notification permission:', error);
        return { granted: false, reason: error.message };
    }
}

/**
 * Send a browser notification
 */
export function sendNotification(title, options = {}) {
    if (!isNotificationSupported()) {
        console.warn('Notifications not supported');
        return null;
    }

    if (Notification.permission !== 'granted') {
        console.warn('Notification permission not granted');
        return null;
    }

    const defaultOptions = {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        vibrate: [200, 100, 200],
        requireInteraction: false,
        ...options
    };

    try {
        const notification = new Notification(title, defaultOptions);

        // Auto-close after 10 seconds if not requiring interaction
        if (!defaultOptions.requireInteraction) {
            setTimeout(() => notification.close(), 10000);
        }

        return notification;
    } catch (error) {
        console.error('Error sending notification:', error);
        return null;
    }
}

/**
 * Send a task reminder notification
 */
export function sendTaskReminder(task) {
    const title = `🔔 แจ้งเตือนงาน: ${task.title}`;
    const options = {
        body: task.description || 'ถึงเวลาทำงานนี้แล้ว',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: `task-${task.id}`,
        data: {
            taskId: task.id,
            propertyId: task.property_id,
            url: `/admin/dashboard.html?tab=todos&property=${task.property_id}`
        },
        requireInteraction: true,
        actions: [
            { action: 'view', title: 'ดูรายละเอียด' },
            { action: 'complete', title: 'ทำเสร็จแล้ว' }
        ]
    };

    const notification = sendNotification(title, options);

    if (notification) {
        // Handle notification click
        notification.onclick = function (event) {
            event.preventDefault();
            window.focus();
            if (options.data.url) {
                window.location.href = options.data.url;
            }
            notification.close();
        };
    }

    return notification;
}

/**
 * Check for pending reminders and send notifications
 */
export async function checkPendingReminders(getPendingRemindersFn, markReminderSentFn) {
    if (Notification.permission !== 'granted') {
        return { sent: 0, errors: [] };
    }

    try {
        const { data: reminders, error } = await getPendingRemindersFn();

        if (error) {
            console.error('Error fetching pending reminders:', error);
            return { sent: 0, errors: [error] };
        }

        if (!reminders || reminders.length === 0) {
            return { sent: 0, errors: [] };
        }

        let sent = 0;
        const errors = [];

        for (const task of reminders) {
            try {
                sendTaskReminder(task);
                await markReminderSentFn(task.id);
                sent++;
            } catch (err) {
                console.error(`Error sending reminder for task ${task.id}:`, err);
                errors.push(err);
            }
        }

        return { sent, errors };
    } catch (error) {
        console.error('Error in checkPendingReminders:', error);
        return { sent: 0, errors: [error] };
    }
}

/**
 * Schedule a notification check interval
 * Returns the interval ID so it can be cleared later
 */
export function scheduleNotificationCheck(checkFunction, intervalMinutes = 5) {
    // Check immediately
    checkFunction();

    // Then check every N minutes
    const intervalMs = intervalMinutes * 60 * 1000;
    return setInterval(checkFunction, intervalMs);
}

/**
 * Clear scheduled notification check
 */
export function clearNotificationCheck(intervalId) {
    if (intervalId) {
        clearInterval(intervalId);
    }
}

/**
 * Get notification permission status as user-friendly text
 */
export function getPermissionStatusText() {
    const permission = getNotificationPermission();

    switch (permission) {
        case 'granted':
            return 'เปิดใช้งาน';
        case 'denied':
            return 'ปิดใช้งาน';
        case 'default':
            return 'ยังไม่ได้ตั้งค่า';
        case 'unsupported':
            return 'เบราว์เซอร์ไม่รองรับ';
        default:
            return 'ไม่ทราบสถานะ';
    }
}
