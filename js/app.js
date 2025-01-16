/**
 * Resseltrafiken Web Application - Main Application
 * 
 * This is the main entry point and controller for the Resseltrafiken web application.
 * It coordinates the TimeHandler and Renderer modules, manages data loading and updates,
 * and handles the overall application lifecycle.
 * 
 * Version History:
 * 2.0.0 (2025-01-16) - Converted to static web application
 * 1.0.0 (2024-01-11) - Original version based on MMM-Resseltrafiken
 * 
 * @author Christian Gillinger
 * @version 2.0.0
 * @license MIT
 */

document.addEventListener('DOMContentLoaded', async function() {
    /**
     * Application configuration object
     * @type {Object}
     */
    const config = {
        updateInterval: 60000,           // Update interval in milliseconds
        showBothDirections: true,        // Show both outbound and return trips
        highlightStop: "Lumabryggan",    // Stop to highlight in the UI
        cityReturnStop: "Nybroplan",     // Return stop to highlight for city direction
        maxVisibleDepartures: 9,         // Maximum number of visible departures per stop
        dataPath: 'data/Ressel.json',    // Path to timetable data
        debug: false                     // Enable debug logging
    };

    let timetableData = null;            // Holds the current timetable data
    const timeHandler = new TimeHandler();
    const renderer = new Renderer(config);

    /**
     * Logs debug messages if debug mode is enabled
     * @param {string} message - Message to log
     * @param {*} [data] - Optional data to log
     */
    function debugLog(message, data = null) {
        if (config.debug) {
            console.log(`[Resseltrafiken] ${message}`, data || '');
        }
    }

    /**
     * Loads and validates the timetable data
     * @returns {Promise<Object>} The parsed and validated timetable data
     * @throws {Error} If data cannot be loaded or is invalid
     */
    async function loadTimetableData() {
        try {
            debugLog('Loading timetable data...');
            const response = await fetch(config.dataPath);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            validateTimetableData(data);
            debugLog('Timetable data loaded successfully');
            return data;
        } catch (error) {
            console.error('Error loading timetable:', error);
            handleError(error, 'Kunde inte ladda tidtabellsdata');
            return null;
        }
    }

    /**
     * Validates the structure and content of timetable data
     * @param {Object} data - The timetable data to validate
     * @throws {Error} If data structure is invalid
     */
    function validateTimetableData(data) {
        if (!data.metadata || !data.routes) {
            throw new Error('Ogiltig datastruktur i tidtabellen');
        }

        // Validate version and period
        const validFrom = new Date(data.metadata.valid_period.start_date);
        const validTo = new Date(data.metadata.valid_period.end_date);
        const now = new Date();
        
        if (now > validTo) {
            console.warn('Varning: Tidtabellsdata kan vara inaktuell');
        }

        debugLog('Data validation complete', {
            version: data.metadata.version,
            validPeriod: `${validFrom.toLocaleDateString()} - ${validTo.toLocaleDateString()}`
        });
    }

    /**
     * Updates the display with current timetable information
     * @param {Object} timetable - The current timetable data
     */
    function updateDisplay(timetable) {
        const appElement = document.getElementById('app');
        if (!appElement) {
            console.error('App container not found');
            return;
        }

        appElement.innerHTML = '';
        const wrapper = renderer.createWrapper();

        if (!timetable) {
            handleError(null, 'Ingen tidtabellsdata tillgänglig');
            return;
        }

        try {
            debugLog('Updating display...');
            const scheduleType = timeHandler.getScheduleType(timetable);
            renderTimetables(wrapper, timetable, scheduleType);
            renderer.setupOverflowObservers(wrapper);
            appElement.appendChild(wrapper);
            debugLog('Display update complete');
        } catch (error) {
            handleError(error, 'Fel vid uppdatering av display');
        }
    }

    /**
     * Renders all timetables for the current schedule
     * @param {HTMLElement} wrapper - The container element
     * @param {Object} timetable - The timetable data
     * @param {string} scheduleType - The current schedule type (weekday/weekend)
     */
    function renderTimetables(wrapper, timetable, scheduleType) {
        const scheduleDisplayName = timeHandler.getScheduleDisplayName(scheduleType);

        // Render Sjöstadstrafiken schedules
        renderSjostadsTimetable(wrapper, timetable, scheduleType, scheduleDisplayName);

        // Render Emelietrafiken schedules
        renderEmelieTimetables(wrapper, timetable, scheduleType, scheduleDisplayName);
    }

    /**
     * Renders Sjöstadstrafiken timetable
     * @param {HTMLElement} wrapper - The container element
     * @param {Object} timetable - The timetable data
     * @param {string} scheduleType - Current schedule type
     * @param {string} scheduleDisplayName - Display name for schedule type
     */
    function renderSjostadsTimetable(wrapper, timetable, scheduleType, scheduleDisplayName) {
        const sjoStadsSchedule = timetable.routes.sjo_staden.schedule[scheduleType];
        if (sjoStadsSchedule) {
            const processedDepartures = {};
            for (const [stop, times] of Object.entries(sjoStadsSchedule)) {
                processedDepartures[stop] = timeHandler.processScheduleTimes(
                    times, 
                    config.maxVisibleDepartures
                );
            }

            wrapper.appendChild(
                renderer.createTimetable(
                    { departures: processedDepartures },
                    "Sjöstadstrafiken",
                    scheduleDisplayName
                )
            );
        }
    }

    /**
     * Renders Emelietrafiken timetables
     * @param {HTMLElement} wrapper - The container element
     * @param {Object} timetable - The timetable data
     * @param {string} scheduleType - Current schedule type
     * @param {string} scheduleDisplayName - Display name for schedule type
     */
    function renderEmelieTimetables(wrapper, timetable, scheduleType, scheduleDisplayName) {
        const routes = timetable.routes.city_line.directions;

        // Process schedule data for rendering
        const processEmelieSchedule = (schedule) => {
            const processed = { ...schedule };
            processed.departures = {};
            
            for (const [stop, times] of Object.entries(schedule.departures)) {
                processed.departures[stop] = timeHandler.processScheduleTimes(
                    times, 
                    config.maxVisibleDepartures
                );
            }
            return processed;
        };

        // Render outbound route (to city)
        const outboundSchedule = routes.Hammarbysjöstad_to_Nybroplan[`${scheduleType}_schedule`];
        if (outboundSchedule) {
            wrapper.appendChild(
                renderer.createTimetable(
                    processEmelieSchedule(outboundSchedule),
                    "M/S Emelie → City",
                    scheduleDisplayName,
                    config.highlightStop
                )
            );
        }

        // Render return route if configured
        if (config.showBothDirections) {
            const returnSchedule = routes.Nybroplan_to_Hammarbysjöstad[`${scheduleType}_schedule`];
            if (returnSchedule) {
                wrapper.appendChild(
                    renderer.createTimetable(
                        processEmelieSchedule(returnSchedule),
                        "M/S Emelie ← City",
                        scheduleDisplayName,
                        config.cityReturnStop
                    )
                );
            }
        }
    }

    /**
     * Handles and displays errors to the user
     * @param {Error} error - The error object
     * @param {string} message - User-friendly error message
     */
    function handleError(error, message) {
        console.error('Application error:', error);
        const appElement = document.getElementById('app');
        const wrapper = renderer.createWrapper();
        wrapper.innerHTML = `
            <div class="notification error" role="alert">
                ${message}
            </div>
        `;
        appElement.appendChild(wrapper);
    }

    /**
     * Starts periodic updates of the display
     * @param {Object} timetable - The timetable data
     */
    function startPeriodicUpdates(timetable) {
        setInterval(() => {
            try {
                debugLog('Running periodic update');
                updateDisplay(timetable);
            } catch (error) {
                handleError(error, 'Kunde inte uppdatera tidtabellen');
            }
        }, config.updateInterval);
    }

    // Initialize the application
    try {
        debugLog('Initializing application...');
        
        // Load initial data
        timetableData = await loadTimetableData();
        
        if (timetableData) {
            // Perform first display update
            updateDisplay(timetableData);
            
            // Start periodic updates
            startPeriodicUpdates(timetableData);
            
            debugLog('Application initialized successfully');
        }
    } catch (error) {
        handleError(error, 'Kunde inte starta applikationen');
    }
});
