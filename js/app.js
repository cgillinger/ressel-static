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
        dataPaths: {                     // Paths to timetable data - ÄNDRAD TILL RELATIVA SÖKVÄGAR
            sjo: './data/ressel-sjo.json',
            city: './data/ressel-city.json'
        },
        debug: false                     // Enable debug logging
    };

    let timetableData = {
        sjo: null,
        city: null
    };
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
            
            // Load both JSON files
            const [sjoResponse, cityResponse] = await Promise.all([
                fetch(config.dataPaths.sjo),
                fetch(config.dataPaths.city)
            ]);
            
            if (!sjoResponse.ok || !cityResponse.ok) {
                throw new Error(`HTTP error! status: ${sjoResponse.status} / ${cityResponse.status}`);
            }

            const sjoData = await sjoResponse.json();
            const cityData = await cityResponse.json();

            validateTimetableData(sjoData, cityData);
            debugLog('Timetable data loaded successfully');
            
            return {
                sjo: sjoData,
                city: cityData
            };
        } catch (error) {
            console.error('Error loading timetable:', error);
            handleError(error, 'Kunde inte ladda tidtabellsdata');
            return null;
        }
    }

    /**
     * Validates the structure and content of timetable data
     * @param {Object} sjoData - The Sjöstadstrafiken timetable data
     * @param {Object} cityData - The City Line timetable data
     * @throws {Error} If data structure is invalid
     */
    function validateTimetableData(sjoData, cityData) {
        if (!sjoData.metadata || !cityData.metadata) {
            throw new Error('Ogiltig datastruktur i tidtabellen');
        }

        // Validate version and period for both services
        const now = new Date();
        
        // Validate Sjöstadstrafiken period
        const sjoValidFrom = new Date(sjoData.metadata.valid_period.start);
        const sjoValidTo = new Date(sjoData.metadata.valid_period.end);
        
        // Validate City Line period
        const cityValidFrom = new Date(cityData.metadata.valid_period.start);
        const cityValidTo = new Date(cityData.metadata.valid_period.end);
        
        if (now > sjoValidTo || now > cityValidTo) {
            console.warn('Varning: Tidtabellsdata kan vara inaktuell');
        }

        debugLog('Data validation complete', {
            sjo: {
                version: sjoData._metadata.version,
                validPeriod: `${sjoValidFrom.toLocaleDateString()} - ${sjoValidTo.toLocaleDateString()}`
            },
            city: {
                version: cityData._metadata.version,
                validPeriod: `${cityValidFrom.toLocaleDateString()} - ${cityValidTo.toLocaleDateString()}`
            }
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

        if (!timetable || !timetable.sjo || !timetable.city) {
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
        renderSjostadsTimetable(wrapper, timetable.sjo, scheduleType, scheduleDisplayName);

        // Render Emelietrafiken schedules
        renderEmelieTimetables(wrapper, timetable.city, scheduleType, scheduleDisplayName);
    }

    /**
     * Renders Sjöstadstrafiken timetable
     * @param {HTMLElement} wrapper - The container element
     * @param {Object} timetable - The timetable data
     * @param {string} scheduleType - Current schedule type
     * @param {string} scheduleDisplayName - Display name for schedule type
     */
    function renderSjostadsTimetable(wrapper, timetable, scheduleType, scheduleDisplayName) {
        const sjoStadsSchedule = timetable.schedules[scheduleType].departures;
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
     * Merges morning and afternoon departures for city line
     * @param {Object} schedule - Schedule containing morning and afternoon departures
     * @returns {Object} Merged departures
     */
    function mergeCityLineDepartures(schedule) {
        const mergedDepartures = {};
        
        // Helper function to process departures
        const processDepartures = (departures) => {
            Object.entries(departures).forEach(([stop, times]) => {
                if (!mergedDepartures[stop]) {
                    mergedDepartures[stop] = [];
                }
                mergedDepartures[stop].push(...times);
            });
        };

        // Process morning departures if they exist
        if (schedule.morning && schedule.morning.departures) {
            processDepartures(schedule.morning.departures);
        }

        // Process afternoon departures if they exist
        if (schedule.afternoon && schedule.afternoon.departures) {
            processDepartures(schedule.afternoon.departures);
        }

        // Sort times for each stop
        Object.keys(mergedDepartures).forEach(stop => {
            mergedDepartures[stop].sort();
        });

        return mergedDepartures;
    }

    /**
     * Renders Emelietrafiken timetables
     * @param {HTMLElement} wrapper - The container element
     * @param {Object} timetable - The timetable data
     * @param {string} scheduleType - Current schedule type
     * @param {string} scheduleDisplayName - Display name for schedule type
     */
    function renderEmelieTimetables(wrapper, timetable, scheduleType, scheduleDisplayName) {
        if (scheduleType === 'weekday') {
            const toCity = mergeCityLineDepartures(timetable.schedules.weekday.to_city);
            const fromCity = mergeCityLineDepartures(timetable.schedules.weekday.from_city);

            // Process outbound route (to city)
            const processedToCity = {};
            Object.entries(toCity).forEach(([stop, times]) => {
                processedToCity[stop] = timeHandler.processScheduleTimes(
                    times,
                    config.maxVisibleDepartures
                );
            });

            wrapper.appendChild(
                renderer.createTimetable(
                    { departures: processedToCity },
                    "M/S Emelie → City",
                    scheduleDisplayName,
                    config.highlightStop
                )
            );

            // Render return route if configured
            if (config.showBothDirections) {
                const processedFromCity = {};
                Object.entries(fromCity).forEach(([stop, times]) => {
                    processedFromCity[stop] = timeHandler.processScheduleTimes(
                        times,
                        config.maxVisibleDepartures
                    );
                });

                wrapper.appendChild(
                    renderer.createTimetable(
                        { departures: processedFromCity },
                        "M/S Emelie ← City",
                        scheduleDisplayName,
                        config.cityReturnStop
                    )
                );
            }
        } else {
            // Weekend schedule is already in the correct format
            const toCity = timetable.schedules.weekend.to_city.departures;
            const fromCity = timetable.schedules.weekend.from_city.departures;

            // Process and render outbound route
            const processedToCity = {};
            Object.entries(toCity).forEach(([stop, times]) => {
                processedToCity[stop] = timeHandler.processScheduleTimes(
                    times,
                    config.maxVisibleDepartures
                );
            });

            wrapper.appendChild(
                renderer.createTimetable(
                    { departures: processedToCity },
                    "M/S Emelie → City",
                    scheduleDisplayName,
                    config.highlightStop
                )
            );

            // Render return route if configured
            if (config.showBothDirections) {
                const processedFromCity = {};
                Object.entries(fromCity).forEach(([stop, times]) => {
                    processedFromCity[stop] = timeHandler.processScheduleTimes(
                        times,
                        config.maxVisibleDepartures
                    );
                });

                wrapper.appendChild(
                    renderer.createTimetable(
                        { departures: processedFromCity },
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
