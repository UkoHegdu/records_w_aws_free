const filterRecordsByPeriod = (data, period = '1d') => {
    const now = Date.now();
    let timeThreshold;

    switch (period) {
        case '1d':
            timeThreshold = 24 * 60 * 60 * 1000;
            break;
        case '1w':
            timeThreshold = 7 * 24 * 60 * 60 * 1000;
            break;
        case '1m':
            timeThreshold = 30 * 24 * 60 * 60 * 1000;
            break;
        default:
            return [];
    }

    return data.tops?.flatMap(group =>
        group.top?.filter(record => {
            const recordTime = record.timestamp * 1000;
            return now - recordTime <= timeThreshold;
        }) || []
    ) || [];
};

module.exports = { filterRecordsByPeriod };