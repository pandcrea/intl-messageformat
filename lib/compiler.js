/*
Copyright (c) 2014, Yahoo! Inc. All rights reserved.
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.
*/

/* jslint esnext: true */

"use strict";
var src$date$helpers$$ = require("./date/helpers.js");
exports["default"] = Compiler;

function Compiler(locales, formats, pluralFn) {
    this.locales  = locales;
    this.formats  = formats;
    this.pluralFn = pluralFn;
}

Compiler.prototype.compile = function (ast) {
    this.pluralStack        = [];
    this.currentPlural      = null;
    this.pluralNumberFormat = null;

    return this.compileMessage(ast);
};

Compiler.prototype.compileMessage = function (ast) {
    if (!(ast && ast.type === 'messageFormatPattern')) {
        throw new Error('Message AST is not of type: "messageFormatPattern"');
    }

    var elements = ast.elements,
        pattern  = [];

    var i, len, element;

    for (i = 0, len = elements.length; i < len; i += 1) {
        element = elements[i];

        switch (element.type) {
            case 'messageTextElement':
                pattern.push(this.compileMessageText(element));
                break;

            case 'argumentElement':
                pattern.push(this.compileArgument(element));
                break;

            default:
                throw new Error('Message element does not have a valid type');
        }
    }

    return pattern;
};

Compiler.prototype.compileMessageText = function (element) {
    // When this `element` is part of plural sub-pattern and its value contains
    // an unescaped '#', use a `PluralOffsetString` helper to properly output
    // the number with the correct offset in the string.
    if (this.currentPlural && /(^|[^\\])#/g.test(element.value)) {
        // Create a cache a NumberFormat instance that can be reused for any
        // PluralOffsetString instance in this message.
        if (!this.pluralNumberFormat) {
            this.pluralNumberFormat = new Intl.NumberFormat(this.locales);
        }

        return new PluralOffsetString(
                this.currentPlural.id,
                this.currentPlural.format.offset,
                this.pluralNumberFormat,
                element.value);
    }

    // Unescape the escaped '#'s in the message text.
    return element.value.replace(/\\#/g, '#');
};

Compiler.prototype.compileArgument = function (element) {
    var format = element.format;

    if (!format) {
        return new StringFormat(element.id);
    }

    var formats  = this.formats,
        locales  = this.locales,
        pluralFn = this.pluralFn,
        options;

    switch (format.type) {
        case 'numberFormat':
            options = formats.number[format.style];
            return {
                id    : element.id,
                format: new Intl.NumberFormat(locales, options).format
            };

        case 'dateFormat':
            if (format.style === 'skeleton') {
                return {
                    id: element.id,
                    format: this.compileSkeleton(format.skeleton)
                };
            }

            options = formats.date[format.style];
            return {
                id    : element.id,
                format: new Intl.DateTimeFormat(locales, options).format
            };

        case 'timeFormat':
            options = formats.time[format.style];
            return {
                id    : element.id,
                format: new Intl.DateTimeFormat(locales, options).format
            };

        case 'pluralFormat':
            options = this.compileOptions(element);
            return new PluralFormat(
                element.id, format.ordinal, format.offset, options, pluralFn
            );

        case 'selectFormat':
            options = this.compileOptions(element);
            return new SelectFormat(element.id, options);

        default:
            throw new Error('Message element does not have a valid format type');
    }
};

Compiler.prototype.compileOptions = function (element) {
    var format      = element.format,
        options     = format.options,
        optionsHash = {};

    // Save the current plural element, if any, then set it to a new value when
    // compiling the options sub-patterns. This conforms the spec's algorithm
    // for handling `"#"` syntax in message text.
    this.pluralStack.push(this.currentPlural);
    this.currentPlural = format.type === 'pluralFormat' ? element : null;

    var i, len, option;

    for (i = 0, len = options.length; i < len; i += 1) {
        option = options[i];

        // Compile the sub-pattern and save it under the options's selector.
        optionsHash[option.selector] = this.compileMessage(option.value);
    }

    // Pop the plural stack to put back the original current plural value.
    this.currentPlural = this.pluralStack.pop();

    return optionsHash;
};

Compiler.prototype.compileSkeleton = function (skeleton) {
    var locales = this.locales;

    return function (date) {
        return skeleton.replace(/([a-z])\1*|'([^']|'')+'|''|./ig, function(current) {
            var ret,
                chr = current.charAt(0),
                length = current.length;

            if (chr === "j") {
                // Locale preferred hHKk.
                // http://www.unicode.org/reports/tr35/tr35-dates.html#Time_Data
            }

            if (chr === "Z") {
                // Z..ZZZ: same as "xxxx".
                if (length < 4) {
                    chr = "x";
                    length = 4;

                // ZZZZ: same as "OOOO".
                } else if (length < 5) {
                    chr = "O";
                    length = 4;

                // ZZZZZ: same as "XXXXX"
                } else {
                    chr = "X";
                    length = 5;
                }
            }

            switch (chr) {
                // Era
                case "G":
                    if (length < 4) {
                        ret = new Intl.DateTimeFormat(locales, { era: 'short' }).format(date);
                    } else {
                        ret = new Intl.DateTimeFormat(locales, { era: 'long' }).format(date);
                    }
                    break;

                // Year
                case "y":

                    // Plain year.
                    // The length specifies the padding, but for two letters it also specifies the
                    // maximum length.
                    ret = date.getFullYear();
                    if (length === 2) {
                        ret = String(ret);
                        ret = +ret.substr(ret.length - 2);
                    }
                    break;

                case "Y":
                    // Year in "Week of Year"
                    // The length specifies the padding, but for two letters it also specifies the
                    // maximum length.
                    // yearInWeekofYear = date + DaysInAWeek - (dayOfWeek - firstDay) - minDays
                    ret = new Date(date.getTime());
                    ret.setDate(
                        ret.getDate() + 7 -
                        dateDayOfWeek(date, 1) -
                        1 -
                        4
                    );
                    ret = ret.getFullYear();
                    if (length === 2) {
                        ret = String(ret);
                        ret = +ret.substr(ret.length - 2);
                    }
                    break;

                // Month
                case "M":
                case "L":
                    ret = date.getMonth() + 1;
                    if (length === 3) {
                        ret = new Intl.DateTimeFormat(locales, { month: 'short' }).format(date);
                    } else if (length === 4) {
                        ret = new Intl.DateTimeFormat(locales, { month: 'long' }).format(date);
                    } else if (length === 5) {
                        ret = new Intl.DateTimeFormat(locales, { month: 'narrow' }).format(date);
                    }
                    break;

                // Week
                case "w":

                    // Week of Year.
                    // woy = ceil( ( doy + dow of 1/1 ) / 7 ) - minDaysStuff ? 1 : 0.
                    // TODO should pad on ww? Not documented, but I guess so.
                    ret = dateDayOfWeek(src$date$helpers$$.dateStartOf(date, "year"), 1);
                    ret = Math.ceil((src$date$helpers$$.dateDayOfYear(date) + ret) / 7) -
                        (7 - ret >= 4 ? 0 : 1);
                    break;

                case "W":

                    // Week of Month.
                    // wom = ceil( ( dom + dow of `1/month` ) / 7 ) - minDaysStuff ? 1 : 0.
                    ret = dateDayOfWeek(src$date$helpers$$.dateStartOf(date, "month"), 1);
                    ret = Math.ceil((date.getDate() + ret) / 7) -
                        (7 - ret >= 4 ? 0 : 1);
                    break;

                // Day
                case "d":
                    ret = src$date$helpers$$.pad(''+date.getDate(), length);
                    break;

                case "D":
                    ret = src$date$helpers$$.dateDayOfYear(date) + 1;
                    break;

                case "F":

                    // Day of Week in month. eg. 2nd Wed in July.
                    ret = Math.floor(date.getDate() / 7) + 1;
                    break;

                // Week day
                case "e":
                case "c":
                    if ( length <= 2 ) {

                        // Range is [1-7] (deduced by example provided on documentation)
                        // TODO Should pad with zeros (not specified in the docs)?
                        ret = dateDayOfWeek(date, 1) + 1;
                        break;
                    }

                /* falls through */
                case "E":
                    if (length < 3) {
                        ret = new Intl.DateTimeFormat(locales, { weekday: 'short' }).format(date);
                    } else if (length === 4) {
                        ret = new Intl.DateTimeFormat(locales, { weekday: 'long' }).format(date);
                    } else {
                        ret = new Intl.DateTimeFormat(locales, { weekday: 'narrow' }).format(date);
                    }
                    break;

                // Period (AM or PM)
                // case "a":
                //     ret = properties.dayPeriods[date.getHours() < 12 ? "am" : "pm"];
                //     break;

                // Hour
                case "h": // 1-12
                    ret = (date.getHours() % 12) || 12;
                    break;

                case "H": // 0-23
                    ret = date.getHours();
                    break;

                case "K": // 0-11
                    ret = date.getHours() % 12;
                    break;

                case "k": // 1-24
                    ret = date.getHours() || 24;
                    break;

                // Minute
                case "m":
                    ret = date.getMinutes();
                    break;

                // Second
                case "s":
                    ret = date.getSeconds();
                    break;

                case "S":
                    ret = Math.round(date.getMilliseconds() * Math.pow(10, length - 3));
                    break;

                case "A":
                    ret = Math.round(src$date$helpers$$.dateMillisecondsInDay(date) * Math.pow(10, length - 3));
                    break;

                // timeSeparator
                case ":":
                    ret = ':';
                    break;

                // ' literals.
                case "'":
                    current = current.replace(/''/, "'");
                    if (length > 2) {
                        current = current.slice( 1, -1 );
                    }
                    ret = current;
                    break;

                // Anything else is considered a literal, including [ ,:/.@#], chinese, japanese, and
                // arabic characters.
                default:
                    ret = current;
            }

            // if (typeof ret === "number") {
            //     ret = numberFormatters[length](ret);
            // }

            return ret;
        });
    };
};

// -- Compiler Helper Classes --------------------------------------------------

function StringFormat(id) {
    this.id = id;
}

StringFormat.prototype.format = function (value) {
    if (!value) {
        return '';
    }

    return typeof value === 'string' ? value : String(value);
};

function PluralFormat(id, useOrdinal, offset, options, pluralFn) {
    this.id         = id;
    this.useOrdinal = useOrdinal;
    this.offset     = offset;
    this.options    = options;
    this.pluralFn   = pluralFn;
}

PluralFormat.prototype.getOption = function (value) {
    var options = this.options;

    var option = options['=' + value] ||
            options[this.pluralFn(value - this.offset, this.useOrdinal)];

    return option || options.other;
};

function PluralOffsetString(id, offset, numberFormat, string) {
    this.id           = id;
    this.offset       = offset;
    this.numberFormat = numberFormat;
    this.string       = string;
}

PluralOffsetString.prototype.format = function (value) {
    var number = this.numberFormat.format(value - this.offset);

    return this.string
            .replace(/(^|[^\\])#/g, '$1' + number)
            .replace(/\\#/g, '#');
};

function SelectFormat(id, options) {
    this.id      = id;
    this.options = options;
}

SelectFormat.prototype.getOption = function (value) {
    var options = this.options;
    return options[value] || options.other;
};

//# sourceMappingURL=compiler.js.map