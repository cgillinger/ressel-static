/**
 * Resseltrafiken Web Application - Time Handling Module
 * 
 * Manages time-related calculations and schedule processing for the Resseltrafiken
 * timetable application. This module handles time conversions and departure sorting.
 * 
 * Version History:
 * 4.0.0 (2025-03-21) - Simplified for new JSON structure, removed schedule type detection
 * 3.0.0 (2025-03-20) - Added support for separate day types
 * 2.4.0 (2025-03-22) - Updated version numbering for consistency with other components
 * 2.1.0 (2025-03-18) - Updated to handle seasonal timetables and special holiday rules
 * 2.0.0 (2025-01-16) - Converted to static web module, improved holiday handling
 * 1.0.0 (2024-01-11) - Original version based on MMM-Resseltrafiken
 * 
 * @author Christian Gillinger
 * @version 4.0.0
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
     * Processes and sorts schedule times for display
     * The function expects an array of objects with time and isToday properties
     * @param {Array<Object>} times Array of time objects with format: {time: "HH:MM", isToday: boolean}
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
        
        // Process times and create extended information
        let processedTimes = times.map(timeObj => {
            const minutesSinceMidnight = this.timeToMinutes(timeObj.time);
            
            // Calculate difference based on whether it's today or tomorrow
            let diff;
            if (timeObj.isToday) {
                diff = minutesSinceMidnight - currentMinutes;
            } else {
                // For tomorrow's times, add 24 hours worth of minutes
                diff = (24 * 60 + minutesSinceMidnight) - currentMinutes;
            }
            
            return {
                time: timeObj.time,
                minutes: timeObj.isToday ? minutesSinceMidnight : minutesSinceMidnight + 24 * 60,
                diff: diff,
                isPast: diff < 0,
                isToday: timeObj.isToday
            };
        });

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
                selectedTimes = [...pastDepartures, ...selectedTimes];
            }
        }

        // Return final format
        return selectedTimes.map(t => ({
            time: t.time,
            isToday: t.isToday
        }));
    }
}