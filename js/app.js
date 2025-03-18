/**
 * Resseltrafiken Web Application - Main Application
 * 
 * This is the main entry point and controller for the Resseltrafiken web application.
 * It coordinates the TimeHandler and Renderer modules, manages data loading and updates,
 * and handles the overall application lifecycle.
 * 
 * Version History:
 * 2.1.0 (2025-03-18) - Added support for seasonal timetables
 * 2.0.0 (2025-01-16) - Converted to static web application
 * 1.0.0 (2024-01-11) - Original version based on MMM-Resseltrafiken
 * 
 * @author Christian Gillinger
 * @version 2.1.0
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
        cityHighlightStop: "Lumabryggan", // Stop to highlight for city line (to city)
        cityReturnStop: "Nybroplan",     // Return stop to highlight for city direction
        maxVisibleDepartures: 9,         // Maximum number of visible departures per stop
        dataPaths: {                     // Paths to timetable data 
            sjo: './data/ressel-sjo.json',
            city: './data/ressel-city.json',
            citySpring: './data/ressel-city-spring-2025.json' // Spring timetable for 2025
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
     * Determines which timetable file to use based on the current date
     * @returns {Object} An object with the paths to use for each service
     */
    function determineTimeTablePaths() {
        const now = new Date();
        const paths = {
            sjo: config.dataPaths.sjo,
            city: config.dataPaths.city
        };

        // Spring timetable for M/S Emelie (April 22 - June 19, 2025)
        const springStart = new Date('2025-04-22T00:00:00');
        const springEnd = new Date('2025-06-20T00:00:00'); // End date is inclusive

        if (now >= springStart && now < springEnd) {
            debugLog('Using Spring 2025 timetable for Emelietrafiken');
            paths.city = config.dataPaths.citySpring;
        }

        return paths;
    }

    /**
     * Loads and validates the timetable data
     * @returns {Promise<Object>} The parsed and validated timetable data
     * @throws {Error} If data cannot be loaded or is invalid
     */
    async function loadTimetableData() {
        try {
            debugLog('Loading timetable data...');
            
            // Determine which timetable files to use
            const paths = determineTimeTablePaths();
            debugLog('Using timetable paths:', paths);

            // Load both JSON files
            const [sjoResponse, cityResponse] = await Promise.all([
                fetch(paths.sjo),
                fetch(paths.city)
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
                version: sjoData._metadata?.version || 'Unknown',
                validPeriod: `${sjoValidFrom.toLocaleDateString()} - ${sjoValidTo.toLocaleDateString()}`
            },
            city: {
                version: cityData._metadata?.version || 'Unknown',
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
            
            // Add timetable validity information
            addValidityInfo(wrapper, timetable);
            
            renderTimetables(wrapper, timetable, scheduleType);
            renderer.setupOverflowObservers(wrapper);
            appElement.appendChild(wrapper);
            debugLog('Display update complete');
        } catch (error) {
            handleError(error, 'Fel vid uppdatering av display');
        }
    }

    /**
     * Adds timetable validity information to the display
     * @param {HTMLElement} wrapper - The container element
     * @param {Object} timetable - The timetable data
     */
    function addValidityInfo(wrapper, timetable) {
        const cityData = timetable.city;
        
        if (cityData.metadata && cityData.metadata.valid_period) {
            const validFrom = new Date(cityData.metadata.valid_period.start);
            const validTo = new Date(cityData.metadata.valid_period.end);
            
            const infoElement = document.createElement("div");
            infoElement.className = "validity-info";
            infoElement.innerHTML = `Aktuell tidtabell gäller: ${validFrom.toLocaleDateString('sv-SE')} - ${validTo.toLocaleDateString('sv-SE')}`;
            wrapper.appendChild(infoElement);
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
                    scheduleDisplayName,
                    config.highlightStop
                )
            );
        }
    }

    /**
     * Merges morning, lunch and afternoon departures for city line
     * @param {Object} schedule - Schedule containing different time periods
     * @returns {Object} Merged departures
     */
    function mergeCityLineDepartures(schedule) {
        const mergedDepartures = {};
        
        // Helper function to process departures
        const processDepartures = (departures) => {
            if (!departures) return;
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

        // Process lunch departures if they exist (added in Spring 2025 schedule)
        if (schedule.lunch && schedule.lunch.departures) {
            processDepartures(schedule.lunch.departures);
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
     * Process weekend schedule based on day of week (Saturday/Sunday)
     * Special handling for spring 2025 timetable which has separate weekend schedules
     * @param {Object} timetable - The timetable data
     * @param {string} direction - Direction (to_city or from_city)
     * @returns {Object} The processed weekend schedule
     */
    function processWeekendSchedule(timetable, direction) {
        // Check if timetable has separate weekend schedules for Saturday and Sunday
        if (timetable.schedules.weekend.saturday && timetable.schedules.weekend.sunday) {
            // Spring 2025 format with separate day schedules
            const now = new Date();
            const isSaturday = now.getDay() === 6;
            
            return isSaturday 
                ? timetable.schedules.weekend.saturday[direction].departures
                : timetable.schedules.weekend.sunday[direction].departures;
        }
        
        // Standard format with combined weekend schedule
        return timetable.schedules.weekend[direction].departures;
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
                    config.cityHighlightStop 
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
            // Weekend schedule handling
            const toCity = processWeekendSchedule(timetable, 'to_city');
            const fromCity = processWeekendSchedule(timetable, 'from_city');

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
                    config.cityHighlightStop
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
                
                // Check if we need to reload timetable data (e.g., day change)
                const now = new Date();
                const paths = determineTimeTablePaths();
                const currentCityPath = paths.city;
                
                // If timetable has changed, reload it
                if (currentCityPath !== lastLoadedCityPath) {
                    debugLog('Timetable changed, reloading data');
                    loadTimetableData().then(newData => {
                        if (newData) {
                            timetableData = newData;
                            lastLoadedCityPath = currentCityPath;
                            updateDisplay(timetableData);
                        }
                    });
                } else {
                    // Just update the display with current data
                    updateDisplay(timetable);
                }
            } catch (error) {
                handleError(error, 'Kunde inte uppdatera tidtabellen');
            }
        }, config.updateInterval);
    }

    // Track which timetable was last loaded
    let lastLoadedCityPath = '';

    // Initialize the application
    try {
        debugLog('Initializing application...');
        
        // Determine initial timetable paths
        const initialPaths = determineTimeTablePaths();
        lastLoadedCityPath = initialPaths.city;
        
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
