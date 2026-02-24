// Status utility functions for consistent styling across components

export type StatusType = 'success' | 'partial' | 'error';
export type NotificationStatusType = 'sent' | 'no_new_times' | 'technical_error';

/**
 * Get CSS class for status-based styling
 */
export const getStatusClass = (status: string): string => {
    const statusMap: Record<string, string> = {
        success: 'status-success',
        partial: 'status-partial',
        error: 'status-error'
    };
    return statusMap[status] || 'status-default';
};

/**
 * Get CSS class for status icon styling
 */
export const getStatusIconClass = (status: string): string => {
    const iconMap: Record<string, string> = {
        success: 'status-icon-success',
        partial: 'status-icon-partial',
        error: 'status-icon-error'
    };
    return iconMap[status] || 'status-icon-default';
};

/**
 * Get CSS class for notification status styling
 */
export const getNotificationStatusClass = (status: string): string => {
    const notificationMap: Record<string, string> = {
        sent: 'notification-sent',
        no_new_times: 'notification-no-new-times',
        technical_error: 'notification-technical-error'
    };
    return notificationMap[status] || 'notification-default';
};

/**
 * Get CSS class for notification icon styling
 */
export const getNotificationIconClass = (status: string): string => {
    const iconMap: Record<string, string> = {
        sent: 'notification-icon-sent',
        no_new_times: 'notification-icon-no-new-times',
        technical_error: 'notification-icon-technical-error'
    };
    return iconMap[status] || 'notification-icon-default';
};

/**
 * Get status icon component and class
 */
export const getStatusIconProps = (status: string) => {
    const iconClass = getStatusIconClass(status);

    // Map status to appropriate icon component
    const iconMap: Record<string, string> = {
        success: 'CheckCircle',
        partial: 'AlertTriangle',
        error: 'XCircle'
    };

    return {
        iconName: iconMap[status] || 'Clock',
        className: `w-6 h-6 ${iconClass}`
    };
};

/**
 * Get notification icon component and class
 */
export const getNotificationIconProps = (status: string) => {
    const iconClass = getNotificationIconClass(status);

    // Map notification status to appropriate icon component
    const iconMap: Record<string, string> = {
        sent: 'CheckCircle',
        technical_error: 'XCircle'
    };

    return {
        iconName: iconMap[status] || 'Clock',
        className: `w-4 h-4 ${iconClass}`
    };
};
