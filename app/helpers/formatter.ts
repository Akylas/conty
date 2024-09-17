import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

// import required dayjs locales
// import utc from 'dayjs/plugin/utc';
import LocalizedFormat from 'dayjs/plugin/localizedFormat';
dayjs.extend(LocalizedFormat);
dayjs.extend(duration);

// export function localize(s: string, ...args) {
//     return l(s, ...args);
// }
// dayjs.extend(utc);
// const dayjs: (...args) => Dayjs = require('dayjs');
// const Duration = require('duration');

// const supportedLanguages = ['en', 'fr'];

export function convertTime(date: number | string | dayjs.Dayjs, formatStr: string) {
    if (date) {
        if (!date['format']) {
            date = dayjs(date);
        }
        return (date as dayjs.Dayjs).format(formatStr);
    }
    return '';
}

export enum DURATION_FORMAT {
    LONG,
    SHORT,
    VERY_SHORT,
    SECONDS
}

export function formatDuration(duration: duration.Duration | number, format: DURATION_FORMAT | string = DURATION_FORMAT.LONG) {
    if (typeof duration === 'number') {
        duration = dayjs.duration(duration);
    }
    if (duration === undefined) {
        return undefined;
    }
    if (typeof format === 'string') {
        return duration.format(format);
    }
    const hours = duration.get('hours');
    if (isNaN(hours)) {
        return undefined;
    }
    const minutes = duration.get('minutes');
    let mintext = '';
    if (minutes !== 0) {
        mintext = minutes + '';
        switch (format) {
            case DURATION_FORMAT.SHORT:
                mintext += 'm';
                break;
            case DURATION_FORMAT.VERY_SHORT:
                if (hours === 0) {
                    mintext += 'm';
                }
                break;
            default:
                mintext += ' min';
                break;
        }
    }
    if (format === DURATION_FORMAT.SECONDS) {
        const seconds = duration.get('seconds');
        if (seconds !== 0) {
            mintext += (mintext.length ? ' ' : '') + seconds + 's';
        }
    }
    if (hours === 0) {
        return mintext;
    }
    if (hours !== 0 && minutes === 0) {
        return hours + (format === DURATION_FORMAT.LONG ? ' h' : 'h');
    }
    return hours + 'h ' + mintext;
}
