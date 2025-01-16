/**
 * Resseltrafiken Web Application - Time Handling Module
 * 
 * Manages all time-related calculations, schedule processing, and holiday detection
 * for the Resseltrafiken timetable application. This module handles Swedish holidays,
 * schedule types, and time conversions.
 * 
 * Version History:
 * 2.0.0 (2025-01-16) - Converted to static web module, improved holiday handling
 * 1.0.0 (2024-01-11) - Original version based on MMM-Resseltrafiken
 * 
 * @author Christian Gillinger
 * @version 2.0.0
 * @license MIT
 */

class TimeHandler {
    /**
     * Initializes the TimeHandler with Swedish holiday definitions
     * Fixed holidays are dates that occur on the same date every year
     */
    constructor() {
        this.fixedHolidays = {
            "01-01": "Nyårsdagen",
            "01-06": "Trettondedag jul",
            "05-01": "Första maj",
            "06-06": "Nationaldagen",
            "12-24": "Julafton",
            "12-25": "Juldagen",
            "12-26": "Annandag jul",
            "12-31": "Nyårsafton"
        };
    }

    /**
     * Converts time string (HH:MM) to minutes since midnight
     * @param {string} timeStr Time in HH:MM format
     * @returns {number} Minutes since midnight
     */
    timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(":").map(Number);
        return hours * 60 + minutes;
    }

    /**
     * Converts minutes since midnight to time string (HH:MM)
     * @param {number} minutes Minutes since midnight
     * @returns {string} Time in HH:MM format
     */
    minutesToTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }

    /**
     * Calculates Easter Sunday for a given year using the Meeus/Jones/Butcher algorithm
     * This algorithm is valid for years between 1583 and 4099
     * @param {number} year The year to calculate Easter for
     * @returns {Date} Easter Sunday date
     */
    calculateEaster(year) {
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        
        return new Date(year, month - 1, day);
    }

    /**
     * Calculates Midsummer Eve (Friday between June 19-25)
     * In Sweden, Midsummer Eve is always celebrated on a Friday
     * @param {number} year The year to calculate Midsummer for
     * @returns {Date} Midsummer Eve date
     */
    calculateMidsummer(year) {
        const june19 = new Date(year, 5, 19);
        const dayOfWeek = june19.getDay();
        const daysToAdd = (5 - dayOfWeek + 7) % 7; // Calculate days until Friday
        return new Date(year, 5, 19 + daysToAdd);
    }

    /**
     * Formats date to MM-DD string for holiday checking
     * @param {Date} date Date to format
     * @returns {string} Date in MM-DD format
     */
    formatDate(date) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${month}-${day}`;
    }

    /**
     * Adds specified number of days to a date
     * @param {Date} date Starting date
     * @param {number} days Number of days to add (can be negative)
     * @returns {Date} Resulting date
     */
    addDays(date, days) {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    /**
     * Gets all variable holidays for a specific year
     * Variable holidays are those that occur on different dates each year
     * @param {number} year The year to get holidays for
     * @returns {Object} Object mapping dates to holiday names
     */
    getVariableHolidays(year) {
        const easter = this.calculateEaster(year);
        const midsummer = this.calculateMidsummer(year);
        
        return {
            [this.formatDate(easter)]: "Påskdagen",
            [this.formatDate(this.addDays(easter, -2))]: "Långfredagen",
            [this.formatDate(this.addDays(easter, 1))]: "Annandag påsk",
            [this.formatDate(this.addDays(easter, 39))]: "Kristi himmelsfärdsdag",
            [this.formatDate(this.addDays(easter, 49))]: "Pingstdagen",
            [this.formatDate(midsummer)]: "Midsommarafton",
            [this.formatDate(this.addDays(midsummer, 1))]: "Midsommardagen"
        };
    }

    /**
     * Checks if a specific date is a holiday
     * Combines both fixed and variable holidays
     * @param {Date} date Date to check
     * @returns {boolean} True if date is a holiday
     */
    isHoliday(date) {
        const formatted = this.formatDate(date);
        const year = date.getFullYear();
        
        // Check fixed holidays first
        if (this.fixedHolidays[formatted]) {
            return true;
        }

        // Then check variable holidays
        const variableHolidays = this.getVariableHolidays(year);
        return !!variableHolidays[formatted];
    }

    /**
     * Checks if current time is after last departure of the day
     * @param {Object} timetable Current timetable data
     * @returns {boolean} True if after last departure
     */
    isAfterLastDeparture(timetable) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const scheduleType = this.getBasicScheduleType();
        
        if (!timetable || !timetable.routes) {
            return false;
        }

        let latestDeparture = "00:00";

        // Check Sjöstadstrafiken departures
        const sjoSchedule = timetable.routes.sjo_staden.schedule[scheduleType];
        Object.values(sjoSchedule).forEach(times => {
            const lastTime = times[times.length - 1];
            if (this.timeToMinutes(lastTime) > this.timeToMinutes(latestDeparture)) {
                latestDeparture = lastTime;
            }
        });

        // Check Emelietrafiken departures
        const emelieRoutes = timetable.routes.city_line.directions;
        Object.values(emelieRoutes).forEach(direction => {
            const schedule = direction[`${scheduleType}_schedule`].departures;
            Object.values(schedule).forEach(times => {
                const lastTime = times[times.length - 1];
                if (this.timeToMinutes(lastTime) > this.timeToMinutes(latestDeparture)) {
                    latestDeparture = lastTime;
                }
            });
        });

        return currentTime > this.timeToMinutes(latestDeparture);
    }

    /**
     * Gets basic schedule type based on current day
     * @returns {string} "weekend" or "weekday"
     */
    getBasicScheduleType() {
        const now = new Date();
        return now.getDay() === 6 || now.getDay() === 0 ? "weekend" : "weekday";
    }

    /**
     * Determines schedule type based on current time and holidays
     * Takes into account holidays and next day scheduling
     * @param {Object} timetable Current timetable data
     * @returns {string} "weekend" or "weekday"
     */
    getScheduleType(timetable) {
        const now = new Date();
        
        // Check if current time is a holiday
        if (this.isHoliday(now)) {
            return "weekend";
        }

        // If after last departure, check next day's schedule
        if (this.isAfterLastDeparture(timetable)) {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            if (this.isHoliday(tomorrow)) {
                return "weekend";
            }
            
            const tomorrowDay = tomorrow.getDay();
            if (tomorrowDay === 0 || tomorrowDay === 6) {
                return "weekend";
            }
            
            return "weekday";
        }

        return this.getBasicScheduleType();
    }

    /**
     * Gets display name for schedule type
     * @param {string} scheduleType The schedule type
     * @returns {string} Display name in Swedish
     */
    getScheduleDisplayName(scheduleType) {
        return scheduleType === "weekday" ? "Vardagar" : "Helgtrafik";
    }

    /**
     * Processes and sorts schedule times for display
     * Handles tomorrow times and sorts by next departure
     * @param {string[]} times Array of time strings
     * @param {number} maxDepartures Maximum number of departures to return
     * @returns {Array<Object>} Processed and sorted departure times
     */
    processScheduleTimes(times, maxDepartures) {
        if (!Array.isArray(times)) {
            console.error("Invalid times array:", times);
            return [];
        }

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const isBeforeMidnight = currentMinutes < 24 * 60;
        
        // Process times and create extended information
        let processedTimes = times.map(time => {
            const minutesSinceMidnight = this.timeToMinutes(time);
            let diff = minutesSinceMidnight - currentMinutes;
            
            // Handle times that might be for tomorrow
            if (isBeforeMidnight && diff < 0) {
                const tomorrowDiff = (24 * 60 + minutesSinceMidnight) - currentMinutes;
                return [
                    {
                        time: time,
                        minutes: minutesSinceMidnight,
                        diff: diff,
                        isPast: true,
                        isToday: true
                    },
                    {
                        time: time,
                        minutes: minutesSinceMidnight + 24 * 60,
                        diff: tomorrowDiff,
                        isPast: false,
                        isToday: false
                    }
                ];
            }
            
            return [{
                time: time,
                minutes: minutesSinceMidnight,
                diff: diff,
                isPast: diff < 0,
                isToday: true
            }];
        }).flat();

        // Sort by time difference
        processedTimes.sort((a, b) => a.diff - b.diff);

        // Find the next departure
        const nextDepartureIndex = processedTimes.findIndex(t => !t.isPast);
        
        let selectedTimes;
        if (nextDepartureIndex === -1) {
            // If all departures are past, show the last ones
            selectedTimes = processedTimes.slice(-maxDepartures);
        } else {
            // Get the next departure and future departures
            const nextDeparture = processedTimes[nextDepartureIndex];
            const futureDepartures = processedTimes.slice(
                nextDepartureIndex + 1,
                nextDepartureIndex + maxDepartures
            );
            
            selectedTimes = [nextDeparture, ...futureDepartures];
            
            // Add past departures if space allows
            const remainingSlots = maxDepartures - selectedTimes.length;
            if (remainingSlots > 0) {
                const pastDepartures = processedTimes
                    .slice(Math.max(0, nextDepartureIndex - remainingSlots), nextDepartureIndex)
                    .reverse();
                selectedTimes = [...selectedTimes, ...pastDepartures];
            }
        }

        // Return final format
        return selectedTimes.map(t => ({
            time: t.time,
            isToday: t.isToday
        }));
    }
}
