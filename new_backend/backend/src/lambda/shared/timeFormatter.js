// shared/timeFormatter.js
// Utility functions for formatting Trackmania times

/**
 * Format time in milliseconds to human-readable format
 * @param {number} timeMs - Time in milliseconds
 * @returns {string} Formatted time string
 */
function formatTime(timeMs) {
    if (!timeMs || timeMs < 0) {
        return '0.000';
    }

    const totalSeconds = Math.floor(timeMs / 1000);
    const milliseconds = timeMs % 1000;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // Format milliseconds to 3 digits
    const msStr = milliseconds.toString().padStart(3, '0');

    if (hours > 0) {
        // More than 1 hour: HH:MM:SS.mmm
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${msStr}`;
    } else if (minutes > 0) {
        // More than 1 minute: MM:SS.mmm
        return `${minutes}:${seconds.toString().padStart(2, '0')}.${msStr}`;
    } else {
        // Less than 1 minute: SS.mmm
        return `${seconds}.${msStr}`;
    }
}

/**
 * Calculate time difference between two times
 * @param {number} oldTimeMs - Original time in milliseconds
 * @param {number} newTimeMs - New time in milliseconds
 * @returns {object} Object with difference info
 */
function calculateTimeDifference(oldTimeMs, newTimeMs) {
    const difference = newTimeMs - oldTimeMs;
    const isImprovement = difference < 0; // Negative means improvement (faster time)
    const absDifference = Math.abs(difference);

    return {
        difference: difference,
        absDifference: absDifference,
        isImprovement: isImprovement,
        formattedDifference: formatTime(absDifference),
        formattedOldTime: formatTime(oldTimeMs),
        formattedNewTime: formatTime(newTimeMs)
    };
}

/**
 * Format time difference for email notifications
 * @param {number} oldTimeMs - Original time in milliseconds
 * @param {number} newTimeMs - New time in milliseconds
 * @returns {string} Human-readable difference description
 */
function formatTimeDifferenceForEmail(oldTimeMs, newTimeMs) {
    const diff = calculateTimeDifference(oldTimeMs, newTimeMs);

    if (diff.isImprovement) {
        return `Your time improved by ${diff.formattedDifference} (${diff.formattedOldTime} → ${diff.formattedNewTime})`;
    } else {
        return `Your time got worse by ${diff.formattedDifference} (${diff.formattedOldTime} → ${diff.formattedNewTime})`;
    }
}

module.exports = {
    formatTime,
    calculateTimeDifference,
    formatTimeDifferenceForEmail
};
