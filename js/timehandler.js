/**
 * Resseltrafiken Web Application - Time Handling Module
 * 
 * Manages time-related calculations and schedule processing for the Resseltrafiken
 * timetable application. This module handles time conversions and departure sorting.
 * 
 * Version History:
 * 5.1.0 (2025-03-25) - Removed past departures from display; next departure always first
 * 5.0.1 (2025-03-25) - Fixed deduplication logic to use uniqueId instead of time
 * 5.0.0 (2025-03-24) - Added day-based time identification for proper sorting and deduplication
 * 4.0.0 (2025-03-21) - Simplified for new JSON structure, removed schedule type detection
 * 3.0.0 (2025-03-20) - Added support for separate day types
 * 2.4.0 (2025-03-22) - Updated version numbering for consistency with other components
 * 2.1.0 (2025-03-18) - Updated to handle seasonal timetables and special holiday rules
 * 2.0.0 (2025-01-16) - Converted to static web module, improved holiday handling
 * 1.0.0 (2024-01-11) - Original version based on MMM-Resseltrafiken
 * 
 * @author Christian Gillinger
 * @version 5.1.0
 * @license MIT
 */

class TimeHandler {
    /**
     * Initializes the TimeHandler
     */
    constructor() {
        // No initialization needed in this version
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
     * Converts JavaScript day (0-6, where 0 is Sunday) to app day (1-7, where 1 is Monday)
     * @param {number} jsDay JavaScript day (0-6)
     * @returns {number} App day (1-7)
     */
    convertJsDayToAppDay(jsDay) {
        // Convert JavaScript's 0-6 (Sun-Sat) to 1-7 (Mon-Sun)
        return jsDay === 0 ? 7 : jsDay;
    }

    /**
     * Gets the day number (1-7) for a given date
     * @param {Date} date Date to get day number for
     * @returns {number} Day number (1-7, where 1 is Monday)
     */
    getDayNumber(date) {
        return this.convertJsDayToAppDay(date.getDay());
    }

    /**
     * Calculates the day difference between two day numbers, handling week wrapping
     * @param {number} day1 First day (1-7)
     * @param {number} day2 Second day (1-7)
     * @returns {number} Days difference (positive if day2 is after day1, negative if before)
     */
    getDayDifference(day1, day2) {
        // Handle direct difference
        let diff = day2 - day1;
        
        // Adjust for week wrapping
        if (diff > 3) {
            diff = diff - 7;
        } else if (diff < -3) {
            diff = diff + 7;
        }
        
        return diff;
    }

    /**
     * Creates a unique ID for a time-day combination
     * @param {number} day Day number (1-7)
     * @param {string} time Time in HH:MM format
     * @returns {string} Unique ID
     */
    createUniqueTimeId(day, time) {
        return `${day}-${time}`;
    }

    /**
     * Processes and sorts schedule times for display
     * Now enhanced with day-based identification for proper sorting and deduplication
     * 
     * @param {Array<Object>} times Array of time objects with format: 
     *                              {time: "HH:MM", isToday: boolean, day?: number, dayOffset?: number}
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
        const currentDay = this.getDayNumber(now);
        
        // Process times and create extended information with day awareness
        let processedTimes = times.map(timeObj => {
            const minutesSinceMidnight = this.timeToMinutes(timeObj.time);
            
            // Get the day and dayOffset - either from the object or calculate from isToday
            let day = timeObj.day;
            let dayOffset = timeObj.dayOffset;
            
            // If day is not provided but isToday is, calculate day and dayOffset
            if (day === undefined) {
                if (timeObj.isToday) {
                    day = currentDay;
                    dayOffset = 0;
                } else {
                    // For tomorrow
                    const tomorrow = new Date(now);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    day = this.getDayNumber(tomorrow);
                    dayOffset = 1;
                }
            }
            
            // Calculate total minutes including day offset
            const totalMinutes = dayOffset * 24 * 60 + minutesSinceMidnight;
            
            // Create a unique ID for this time-day combination
            const uniqueId = this.createUniqueTimeId(day, timeObj.time);
            
            // Calculate time difference from now
            let diff;
            if (dayOffset === 0 && minutesSinceMidnight >= currentMinutes) {
                // Today and time is in future
                diff = minutesSinceMidnight - currentMinutes;
            } else if (dayOffset === 0 && minutesSinceMidnight < currentMinutes) {
                // Today but time is in past
                diff = minutesSinceMidnight - currentMinutes;
            } else {
                // Future day
                diff = (dayOffset * 24 * 60) + minutesSinceMidnight - currentMinutes;
            }
            
            return {
                time: timeObj.time,
                minutes: totalMinutes,
                day: day,
                dayOffset: dayOffset,
                diff: diff,
                isPast: diff < 0,
                isToday: dayOffset === 0,
                uniqueId: uniqueId
            };
        });

        // Deduplicate times by selecting the instance that's closest to now
        const uniqueTimes = [];
        const seenIds = new Set();
        
        // Sort first by diff to ensure we get the closest instances
        processedTimes.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
        
        // Then deduplicate using uniqueId instead of just time
        for (const time of processedTimes) {
            if (!seenIds.has(time.uniqueId)) {  // Fixed: Now using uniqueId instead of time
                uniqueTimes.push(time);
                seenIds.add(time.uniqueId);     // Fixed: Now using uniqueId instead of time
            }
        }
        
        // Resort by absolute time difference
        uniqueTimes.sort((a, b) => a.diff - b.diff);

        // Find the next departure
        const nextDepartureIndex = uniqueTimes.findIndex(t => !t.isPast);
        
        let selectedTimes;
        if (nextDepartureIndex === -1) {
            // If all departures are past, show the last ones
            selectedTimes = uniqueTimes.slice(-maxDepartures);
        } else {
            // FIXED: Get ONLY the next departure and future departures
            // No past departures are included at all
            selectedTimes = uniqueTimes.slice(nextDepartureIndex, nextDepartureIndex + maxDepartures);
        }

        // Return final format compatible with original API
        return selectedTimes.map(t => ({
            time: t.time,
            isToday: t.isToday
        }));
    }
}