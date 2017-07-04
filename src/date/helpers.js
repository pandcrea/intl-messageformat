export function dayOfWeek (date, firstDay) {
    return (date.getDay() - firstDay + 7) % 7;
}

export function dateDayOfYear(date) {
    return Math.floor(dateDistanceInDays(dateStartOf(date, "year"), date));
}

export function dateStartOf(date, unit) {
    date = new Date(date.getTime());

    switch (unit) {
        case "year":
            date.setMonth(0);
        /* falls through */
        case "month":
            date.setDate(1);
        /* falls through */
        case "day":
            date.setHours(0);
        /* falls through */
        case "hour":
            date.setMinutes(0);
        /* falls through */
        case "minute":
            date.setSeconds(0);
        /* falls through */
        case "second":
            date.setMilliseconds(0);
    }

    return date;
}

export function dateDistanceInDays (from, to) {
    var inDays = 864e5;
    return (to.getTime() - from.getTime()) / inDays;
}

export function dateMillisecondsInDay (date) {
    // TODO Handle daylight savings discontinuities
    return date - dateStartOf(date, "day");
};

export function pad (str, count, right) {
    var length;

    if (typeof str !== "string") {
        str = String(str);
    }

    for (length = str.length; length < count; length += 1) {
        str = (right ? (str + "0") : ("0" + str));
    }

    return str;
}