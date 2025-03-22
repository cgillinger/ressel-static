/**
 * Sjöstadsfärjetrafiken Web Application - Main Application
 * 
 * This is the main entry point and controller for the Sjöstadsfärjetrafiken web application.
 * It coordinates the TimeHandler and Renderer modules, manages data loading and updates,
 * and handles the overall application lifecycle.
 * 
 * Version History:
 * 5.1.1 (2025-03-25) - Added reset button and changed default to 7 departures
 * 5.1.0 (2025-03-25) - Removed past departures from display; next departure always first
 * 5.0.0 (2025-03-24) - Added day-based time identification for proper sorting and deduplication
 * 4.2.0 (2025-03-24) - Removed maximum departure limit to allow flexible display of all departures
 * 4.1.0 (2025-03-23) - Limited max departures to 7 to prevent display issues
 * 4.0.0 (2025-03-21) - Complete redesign with new JSON structure for day type handling
 * 3.0.0 (2025-03-20) - Added support for separate day types
 * 2.4.0 (2025-03-22) - Added speech synthesis functionality for accessibility
 * 2.3.1 (2025-03-21) - Fixed visibility of direction settings, replaced toggles with settings panel
 * 2.2.1 (2025-03-20) - Fixed toggle controls visibility logic
 * 2.2.0 (2025-03-19) - Added options to show/hide individual timetables
 * 2.1.0 (2025-03-18) - Added support for seasonal timetables
 * 2.0.0 (2025-01-16) - Converted to static web application
 * 1.0.0 (2024-01-11) - Original version based on MMM-Resseltrafiken
 * 
 * @author Christian Gillinger
 * @version 5.1.1
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
        showSjostadstrafiken: true,      // Show Sjöstadstrafiken timetable
        showEmelietrafiken: true,        // Show Emelietrafiken (M/S Emelie) timetable
        showSpeechSynthesis: true,       // Show speech synthesis buttons for accessibility
        highlightStop: "Lumabryggan",    // Stop to highlight in the UI
        cityHighlightStop: "Lumabryggan", // Stop to highlight for city line (to city)
        cityReturnStop: "Nybroplan",     // Return stop to highlight for city direction
        maxVisibleDepartures: 7,         // Default number of visible departures per stop (changed from 9 to 7)
        dataPaths: {                     // Paths to config files
            sjoConfig: './data/ressel-sjo-config.json',
            cityConfig: './data/ressel-city-config.json'
        },
        debug: false                     // Enable debug logging
    };

    // Try to load config from URL parameters if they exist
    loadConfigFromURL();
    
    // Try to load config from localStorage if they exist
    loadConfigFromLocalStorage();

    document.documentElement.style.setProperty('--visible-departures', config.maxVisibleDepartures);

    // Store loaded timetable data for different days
    let timetableData = {
        today: {
            sjo: null,
            city: null
        },
        tomorrow: {
            sjo: null,
            city: null
        },
        config: {
            sjo: null,
            city: null
        }
    };

    const timeHandler = new TimeHandler();
    const renderer = new Renderer(config);
    
    // Keep a reference to the settings panel
    let settingsPanel = null;

    /**
     * Converts JavaScript day (0-6, where 0 is Sunday) to app day (1-7, where 1 is Monday)
     * @param {number} jsDay JavaScript day (0-6)
     * @returns {number} App day (1-7)
     */
    function convertJsDayToAppDay(jsDay) {
        // Convert JavaScript's 0-6 (Sun-Sat) to 1-7 (Mon-Sun)
        return jsDay === 0 ? 7 : jsDay;
    }

    /**
     * Gets the day number (1-7) for a given date
     * @param {Date} date Date to get day number for
     * @returns {number} Day number (1-7, where 1 is Monday)
     */
    function getDayNumber(date) {
        return convertJsDayToAppDay(date.getDay());
    }

    /**
     * Creates time objects with day information
     * @param {Array<string>} times Array of time strings
     * @param {Date} date Date for these times
     * @param {Date} currentDate Current date for comparison
     * @returns {Array<Object>} Enhanced time objects with day information
     */
    function createEnhancedTimeObjects(times, date, currentDate) {
        if (!Array.isArray(times)) return [];
        
        const dayNumber = getDayNumber(date);
        let dayOffset = 0;
        
        // Calculate day offset based on dates
        if (date.toDateString() !== currentDate.toDateString()) {
            // Simple calculation for tomorrow (most common case)
            if (date.getDate() === currentDate.getDate() + 1 &&
                date.getMonth() === currentDate.getMonth() &&
                date.getFullYear() === currentDate.getFullYear()) {
                dayOffset = 1;
            } else {
                // For other cases, calculate exact difference
                const diffTime = date.getTime() - currentDate.getTime();
                dayOffset = Math.ceil(diffTime / (1000 * 3600 * 24));
            }
        }
        
        return times.map(time => ({
            time: time,
            isToday: dayOffset === 0,
            day: dayNumber,
            dayOffset: dayOffset
        }));
    }

    /**
     * Resets all settings to default values and reloads the page
     */
    function resetSettings() {
        if (localStorage) {
            localStorage.removeItem('sjostadsfarjetrafiken_settings');
        }
        
        // Clear URL parameters as well
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Reload the page to apply default settings
        window.location.reload();
    }

    /**
     * Loads configuration from localStorage
     * This preserves user preferences between sessions
     */
    function loadConfigFromLocalStorage() {
        try {
            // Only load if localStorage is available and we have saved settings
            if (localStorage && localStorage.getItem('sjostadsfarjetrafiken_settings')) {
                const savedSettings = JSON.parse(localStorage.getItem('sjostadsfarjetrafiken_settings'));
                
                // Apply saved settings if they exist, but don't override URL parameters
                if (savedSettings.showSjostadstrafiken !== undefined && !urlHasParam('sjo')) {
                    config.showSjostadstrafiken = savedSettings.showSjostadstrafiken;
                }
                
                if (savedSettings.showEmelietrafiken !== undefined && !urlHasParam('emelie')) {
                    config.showEmelietrafiken = savedSettings.showEmelietrafiken;
                }
                
                if (savedSettings.showBothDirections !== undefined && !urlHasParam('bothdir')) {
                    config.showBothDirections = savedSettings.showBothDirections;
                }
                
                if (savedSettings.maxVisibleDepartures !== undefined && !urlHasParam('maxdep')) {
                    config.maxVisibleDepartures = savedSettings.maxVisibleDepartures;
                    // Update CSS variable
                    document.documentElement.style.setProperty('--visible-departures', config.maxVisibleDepartures);
                }
                
                if (savedSettings.highlightStop !== undefined && !urlHasParam('highlight')) {
                    config.highlightStop = savedSettings.highlightStop;
                }
                
                if (savedSettings.cityHighlightStop !== undefined && !urlHasParam('cityhighlight')) {
                    config.cityHighlightStop = savedSettings.cityHighlightStop;
                }
                
                if (savedSettings.cityReturnStop !== undefined && !urlHasParam('returnstop')) {
                    config.cityReturnStop = savedSettings.cityReturnStop;
                }
                
                if (savedSettings.showSpeechSynthesis !== undefined && !urlHasParam('speech')) {
                    config.showSpeechSynthesis = savedSettings.showSpeechSynthesis;
                }
            }
        } catch (error) {
            console.warn('Could not load settings from localStorage:', error);
        }
    }
    
    /**
     * Checks if a URL parameter exists
     * @param {string} paramName - Parameter name to check
     * @returns {boolean} True if parameter exists in URL
     */
    function urlHasParam(paramName) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.has(paramName);
    }
    
    /**
     * Saves current configuration to localStorage
     */
    function saveConfigToLocalStorage() {
        try {
            if (localStorage) {
                const settings = {
                    showSjostadstrafiken: config.showSjostadstrafiken,
                    showEmelietrafiken: config.showEmelietrafiken,
                    showBothDirections: config.showBothDirections,
                    maxVisibleDepartures: config.maxVisibleDepartures,
                    highlightStop: config.highlightStop,
                    cityHighlightStop: config.cityHighlightStop,
                    cityReturnStop: config.cityReturnStop,
                    showSpeechSynthesis: config.showSpeechSynthesis
                };
                
                localStorage.setItem('sjostadsfarjetrafiken_settings', JSON.stringify(settings));
            }
        } catch (error) {
            console.warn('Could not save settings to localStorage:', error);
        }
    }

    /**
     * Loads configuration from URL parameters
     * This allows for easy customization of display without editing code
     */
    function loadConfigFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        
        // Check for show/hide parameters
        if (urlParams.has('sjo')) {
            config.showSjostadstrafiken = urlParams.get('sjo') === '1' || 
                                          urlParams.get('sjo') === 'true';
        }
        
        if (urlParams.has('emelie')) {
            config.showEmelietrafiken = urlParams.get('emelie') === '1' || 
                                        urlParams.get('emelie') === 'true';
        }
        
        // Check for highlight stop parameters
        if (urlParams.has('highlight')) {
            config.highlightStop = decodeURIComponent(urlParams.get('highlight'));
        }
        
        if (urlParams.has('cityhighlight')) {
            config.cityHighlightStop = decodeURIComponent(urlParams.get('cityhighlight'));
        }
        
        if (urlParams.has('returnstop')) {
            config.cityReturnStop = decodeURIComponent(urlParams.get('returnstop'));
        }
        
        // Check for direction setting
        if (urlParams.has('bothdir')) {
            config.showBothDirections = urlParams.get('bothdir') === '1' || 
                                        urlParams.get('bothdir') === 'true';
        }
        
        // Check for speech synthesis setting
        if (urlParams.has('speech')) {
            config.showSpeechSynthesis = urlParams.get('speech') === '1' || 
                                        urlParams.get('speech') === 'true';
        }
        
        // Check for maxVisibleDepartures
        if (urlParams.has('maxdep')) {
            let maxDep = parseInt(urlParams.get('maxdep'), 10);
            if (!isNaN(maxDep) && maxDep > 0) {
                config.maxVisibleDepartures = maxDep;
                // Update CSS variable
                document.documentElement.style.setProperty('--visible-departures', config.maxVisibleDepartures);
            }
        } else {
            // Set default based on screen size if not specified in URL
            setDefaultDeparturesBasedOnScreenSize();
        }
    }
    
    /**
     * Sets default number of visible departures based on screen size
     */
    function setDefaultDeparturesBasedOnScreenSize() {
        // Only set default if not already set in localStorage
        if (localStorage && !localStorage.getItem('sjostadsfarjetrafiken_settings')) {
            // Check if mobile (<768px)
            if (window.innerWidth < 768) {
                config.maxVisibleDepartures = 4;
                document.documentElement.style.setProperty('--visible-departures', 4);
            } else {
                // Desktop default, changed from 9 to 7
                config.maxVisibleDepartures = 7;
                document.documentElement.style.setProperty('--visible-departures', 7);
            }
        }
    }

    /**
     * Logs debug messages if debug mode is enabled
     * @param {string} message - Message to log
     * @param {*} [data] - Optional data to log
     */
    function debugLog(message, data = null) {
        if (config.debug) {
            console.log(`[Sjöstadsfärjetrafiken] ${message}`, data || '');
        }
    }

    /**
     * Loads configuration files for Sjöstadstrafiken and City Line
     * @returns {Promise<Object>} The loaded configuration data
     */
    async function loadConfigData() {
        try {
            debugLog('Loading configuration data...');
            
            // Load both configuration files
            const [sjoConfigResponse, cityConfigResponse] = await Promise.all([
                fetch(config.dataPaths.sjoConfig),
                fetch(config.dataPaths.cityConfig)
            ]);
            
            if (!sjoConfigResponse.ok || !cityConfigResponse.ok) {
                throw new Error(`HTTP error! status: ${sjoConfigResponse.status} / ${cityConfigResponse.status}`);
            }

            const sjoConfig = await sjoConfigResponse.json();
            const cityConfig = await cityConfigResponse.json();

            debugLog('Configuration data loaded successfully');
            
            return {
                sjo: sjoConfig,
                city: cityConfig
            };
        } catch (error) {
            console.error('Error loading configuration data:', error);
            handleError(error, 'Kunde inte ladda konfigurationsdata');
            return null;
        }
    }

    /**
     * Determines which timetable files to use based on the current date and configuration
     * @param {Object} configData - The configuration data
     * @param {Date} date - The date to determine schedule for
     * @returns {Object} An object with the paths to use for each service and day type
     */
    function determineTimetableFiles(configData, date) {
        const result = {
            sjo: null,
            city: null
        };

        try {
            // Determine day type - Note: Using DayOfWeek rather than isHoliday
            const dayOfWeek = date.getDay();
            const isSaturday = dayOfWeek === 6;
            const isSunday = dayOfWeek === 0;
            const dayType = isSaturday ? "saturday" : (isSunday ? "sunday" : "weekday");

            // Find appropriate Sjöstadstrafiken timetable file
            for (const season of configData.sjo.season_mapping) {
                const seasonStart = new Date(season.period.start);
                const seasonEnd = new Date(season.period.end);
                
                if (date >= seasonStart && date <= seasonEnd) {
                    // For Sjöstadstrafiken, handle weekend differently (only weekday/weekend)
                    if (dayType === "saturday" || dayType === "sunday") {
                        result.sjo = season.files.weekend;
                    } else {
                        result.sjo = season.files.weekday;
                    }
                    break;
                }
            }

            // Find appropriate City Line timetable file
            for (const season of configData.city.season_mapping) {
                const seasonStart = new Date(season.period.start);
                const seasonEnd = new Date(season.period.end);
                
                if (date >= seasonStart && date <= seasonEnd) {
                    // Check if the current date is a holiday that should use weekend schedule
                    if (season.holiday_rules && season.holiday_rules.weekend_schedule) {
                        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
                        if (season.holiday_rules.weekend_schedule.includes(dateStr)) {
                            // If it's a holiday, use the Sunday schedule
                            result.city = season.files.sunday;
                            return result;
                        }
                    }
                    
                    // Normal day type selection
                    result.city = season.files[dayType];
                    break;
                }
            }

            return result;
        } catch (error) {
            console.error('Error determining timetable files:', error);
            return result;
        }
    }

    /**
     * Loads and validates the timetable data for a specific day
     * @param {Object} configData - The configuration data
     * @param {Date} date - The date to load timetable for
     * @returns {Promise<Object>} The parsed and validated timetable data
     */
    async function loadTimetableForDate(configData, date) {
        try {
            const timetableFiles = determineTimetableFiles(configData, date);
            debugLog(`Loading timetable for ${date.toDateString()}`, timetableFiles);
            
            if (!timetableFiles.sjo || !timetableFiles.city) {
                throw new Error('Could not determine timetable files for the specified date');
            }

            // Load both JSON files
            const [sjoResponse, cityResponse] = await Promise.all([
                fetch(`./data/${timetableFiles.sjo}`),
                fetch(`./data/${timetableFiles.city}`)
            ]);
            
            if (!sjoResponse.ok || !cityResponse.ok) {
                throw new Error(`HTTP error! status: ${sjoResponse.status} / ${cityResponse.status}`);
            }

            const sjoData = await sjoResponse.json();
            const cityData = await cityResponse.json();

            // Add the day type to metadata for reference
            sjoData._loadedForDate = date.toISOString();
            cityData._loadedForDate = date.toISOString();

            debugLog(`Timetable data loaded for ${date.toDateString()}`);
            
            return {
                sjo: sjoData,
                city: cityData
            };
        } catch (error) {
            console.error(`Error loading timetable for ${date.toDateString()}:`, error);
            return null;
        }
    }

    /**
     * Updates the display with current timetable information
     */
    function updateDisplay() {
        const appElement = document.getElementById('app');
        if (!appElement) {
            console.error('App container not found');
            return;
        }

        appElement.innerHTML = '';
        const wrapper = renderer.createWrapper();

        if (!timetableData.today || !timetableData.today.sjo || !timetableData.today.city) {
            handleError(null, 'Ingen tidtabellsdata tillgänglig');
            return;
        }

        try {
            debugLog('Updating display...');
            
            // Add timetable validity information
            addValidityInfo(wrapper);
            
            // First render timetables
            renderTimetables(wrapper);
            
            // Then add settings button if not in embedded mode
            if (!isEmbedded()) {
                addSettingsButton(wrapper);
            }
            
            renderer.setupOverflowObservers(wrapper);
            appElement.appendChild(wrapper);
            debugLog('Display update complete');
        } catch (error) {
            handleError(error, 'Fel vid uppdatering av display');
        }
    }

    /**
     * Checks if the app is running in an embedded mode
     * @returns {boolean} True if app is embedded
     */
    function isEmbedded() {
        return window.location.search.includes('embedded=true');
    }

    /**
     * Adds settings button that opens the settings panel
     * @param {HTMLElement} wrapper - The container element
     */
    function addSettingsButton(wrapper) {
        const settingsButton = document.createElement('div');
        settingsButton.className = 'settings-button';
        settingsButton.setAttribute('role', 'button');
        settingsButton.setAttribute('tabindex', '0');
        settingsButton.setAttribute('aria-label', 'Öppna inställningar');
        
        const hamburgerIcon = document.createElement('span');
        hamburgerIcon.className = 'hamburger-icon';
        hamburgerIcon.innerHTML = '&#9776;'; // Unicode for hamburger icon
        
        const buttonText = document.createElement('span');
        buttonText.className = 'settings-button-text';
        buttonText.textContent = 'Inställningar';
        
        settingsButton.appendChild(hamburgerIcon);
        settingsButton.appendChild(buttonText);
        
        settingsButton.addEventListener('click', () => {
            openSettingsPanel();
        });
        
        settingsButton.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                openSettingsPanel();
                e.preventDefault();
            }
        });
        
        wrapper.appendChild(settingsButton);
    }
    
    /**
     * Opens the settings panel
     */
    function openSettingsPanel() {
        // If panel already exists, remove it first
        if (settingsPanel) {
            settingsPanel.remove();
            settingsPanel = null;
            return;
        }
        
        // Create the settings panel
        settingsPanel = document.createElement('div');
        settingsPanel.className = 'settings-panel';
        settingsPanel.setAttribute('role', 'dialog');
        settingsPanel.setAttribute('aria-labelledby', 'settings-title');
        
        // Panel header
        const panelHeader = document.createElement('div');
        panelHeader.className = 'settings-header';
        
        const panelTitle = document.createElement('h2');
        panelTitle.id = 'settings-title';
        panelTitle.textContent = 'Inställningar';
        
        const closeButton = document.createElement('button');
        closeButton.className = 'settings-close-button';
        closeButton.innerHTML = '&times;'; // × symbol
        closeButton.setAttribute('aria-label', 'Stäng inställningar');
        closeButton.addEventListener('click', () => {
            closeSettingsPanel();
        });
        
        panelHeader.appendChild(panelTitle);
        panelHeader.appendChild(closeButton);
        settingsPanel.appendChild(panelHeader);
        
        // Panel content
        const panelContent = document.createElement('div');
        panelContent.className = 'settings-content';
        
        // Add Tidtabeller section
        panelContent.appendChild(createSettingsSection('Tidtabeller', [
            {
                type: 'toggle',
                id: 'sjo-toggle',
                label: 'Sjöstadstrafiken',
                checked: config.showSjostadstrafiken,
                onChange: (checked) => {
                    config.showSjostadstrafiken = checked;
                    updateDisplay();
                    updateURLParameter('sjo', checked ? '1' : '0');
                    saveConfigToLocalStorage();
                }
            },
            {
                type: 'toggle',
                id: 'emelie-toggle',
                label: 'M/S Emelie',
                checked: config.showEmelietrafiken,
                onChange: (checked) => {
                    config.showEmelietrafiken = checked;
                    
                    // Toggle visibility of the directions section
                    const directionsSection = document.getElementById('emelie-directions-section');
                    if (directionsSection) {
                        directionsSection.style.display = checked ? 'block' : 'none';
                    }
                    
                    updateDisplay();
                    updateURLParameter('emelie', checked ? '1' : '0');
                    saveConfigToLocalStorage();
                }
            }
        ]));
        
        // Add M/S Emelie - Riktningar section
        const directionsSection = createSettingsSection('M/S Emelie - Riktningar', [
            {
                type: 'toggle',
                id: 'bothdir-toggle',
                label: 'Visa båda riktningar (till/från City)',
                checked: config.showBothDirections,
                onChange: (checked) => {
                    config.showBothDirections = checked;
                    updateDisplay();
                    updateURLParameter('bothdir', checked ? '1' : '0');
                    saveConfigToLocalStorage();
                }
            }
        ]);
        directionsSection.id = 'emelie-directions-section';
        directionsSection.style.display = config.showEmelietrafiken ? 'block' : 'none';
        panelContent.appendChild(directionsSection);
        
        // Add Visning section with expanded range of departures
        panelContent.appendChild(createSettingsSection('Visning', [
            {
                type: 'select',
                id: 'maxdep-select',
                label: 'Antal avgångar:',
                value: config.maxVisibleDepartures,
                options: Array.from({length: 13}, (_, i) => i + 3).map(num => ({
                    value: num,
                    text: num.toString()
                })),
                onChange: (value) => {
                    const numValue = parseInt(value, 10);
                    config.maxVisibleDepartures = numValue;
                    document.documentElement.style.setProperty('--visible-departures', numValue);
                    updateDisplay();
                    updateURLParameter('maxdep', numValue.toString());
                    saveConfigToLocalStorage();
                }
            }
        ]));
        
        // Add Tillgänglighet section
        panelContent.appendChild(createSettingsSection('Tillgänglighet', [
            {
                type: 'toggle',
                id: 'speech-toggle',
                label: 'Talsyntes för nästa avgång',
                checked: config.showSpeechSynthesis,
                onChange: (checked) => {
                    config.showSpeechSynthesis = checked;
                    updateDisplay();
                    updateURLParameter('speech', checked ? '1' : '0');
                    saveConfigToLocalStorage();
                }
            }
        ]));
        
        // Add Bryggval för Sjöstadstrafiken section if data is available
        if (timetableData.today && timetableData.today.sjo && timetableData.today.sjo.departures) {
            const sjoStops = Object.keys(timetableData.today.sjo.departures || {});
            if (sjoStops.length > 0) {
                panelContent.appendChild(createSettingsSection('Bryggval för Sjöstadstrafiken', [
                    {
                        type: 'select',
                        id: 'highlight-select',
                        label: 'Markera brygga:',
                        value: config.highlightStop,
                        options: sjoStops.map(stop => ({
                            value: stop,
                            text: stop
                        })),
                        onChange: (value) => {
                            config.highlightStop = value;
                            updateDisplay();
                            updateURLParameter('highlight', encodeURIComponent(value));
                            saveConfigToLocalStorage();
                        }
                    }
                ]));
            }
        }
        
        // Add Bryggval för M/S Emelie section if data is available
        if (timetableData.config && timetableData.config.city && timetableData.config.city.service_configuration) {
            const cityStops = timetableData.config.city.service_configuration.stop_sequence?.to_city || [];
            const fromCityStops = timetableData.config.city.service_configuration.stop_sequence?.from_city || [];
            
            if (cityStops.length > 0 && fromCityStops.length > 0) {
                panelContent.appendChild(createSettingsSection('Bryggval för M/S Emelie', [
                    {
                        type: 'select',
                        id: 'cityhighlight-select',
                        label: 'Till City:',
                        value: config.cityHighlightStop,
                        options: cityStops.map(stop => ({
                            value: stop,
                            text: stop
                        })),
                        onChange: (value) => {
                            config.cityHighlightStop = value;
                            updateDisplay();
                            updateURLParameter('cityhighlight', encodeURIComponent(value));
                            saveConfigToLocalStorage();
                        }
                    },
                    {
                        type: 'select',
                        id: 'returnstop-select',
                        label: 'Från City:',
                        value: config.cityReturnStop,
                        options: fromCityStops.map(stop => ({
                            value: stop,
                            text: stop
                        })),
                        onChange: (value) => {
                            config.cityReturnStop = value;
                            updateDisplay();
                            updateURLParameter('returnstop', encodeURIComponent(value));
                            saveConfigToLocalStorage();
                        }
                    }
                ]));
            }
        }
        
        settingsPanel.appendChild(panelContent);
        
        // Add panel footer with close button and reset button
        const panelFooter = document.createElement('div');
        panelFooter.className = 'settings-footer';
        
        // Reset button
        const resetButton = document.createElement('button');
        resetButton.className = 'settings-button-reset';
        resetButton.textContent = 'Återställ';
        resetButton.setAttribute('aria-label', 'Återställ alla inställningar till standard');
        resetButton.addEventListener('click', resetSettings);
        
        // Close button
        const closeSettingsButton = document.createElement('button');
        closeSettingsButton.className = 'settings-button-close';
        closeSettingsButton.textContent = 'Stäng';
        closeSettingsButton.addEventListener('click', () => {
            closeSettingsPanel();
        });
        
        // First add reset button, then spacer, then close button
        panelFooter.appendChild(resetButton);
        
        // Add a spacer div to push close button to the right
        const spacer = document.createElement('div');
        spacer.style.flexGrow = '1';
        panelFooter.appendChild(spacer);
        
        panelFooter.appendChild(closeSettingsButton);
        settingsPanel.appendChild(panelFooter);
        
        // Add panel to document
        document.body.appendChild(settingsPanel);
        
        // Add overlay
        const overlay = document.createElement('div');
        overlay.className = 'settings-overlay';
        overlay.addEventListener('click', () => {
            closeSettingsPanel();
        });
        document.body.appendChild(overlay);
        
        // Focus the first interactive element for accessibility
        setTimeout(() => {
            const firstToggle = settingsPanel.querySelector('input[type="checkbox"], select');
            if (firstToggle) {
                firstToggle.focus();
            }
        }, 100);
        
        // Add animation class after a tiny delay to trigger transition
        setTimeout(() => {
            settingsPanel.classList.add('open');
            overlay.classList.add('visible');
        }, 10);
    }
    
    /**
     * Closes the settings panel
     */
    function closeSettingsPanel() {
        if (settingsPanel) {
            settingsPanel.classList.remove('open');
            
            const overlay = document.querySelector('.settings-overlay');
            if (overlay) {
                overlay.classList.remove('visible');
                setTimeout(() => {
                    overlay.remove();
                }, 300);
            }
            
            // Wait for animation to complete before removing from DOM
            setTimeout(() => {
                if (settingsPanel) {
                    settingsPanel.remove();
                    settingsPanel = null;
                }
            }, 300);
        }
    }
    
    /**
     * Creates a settings section with a title and items
     * @param {string} title - Section title
     * @param {Array<Object>} items - Setting items configuration
     * @returns {HTMLElement} The settings section element
     */
    function createSettingsSection(title, items) {
        const section = document.createElement('div');
        section.className = 'settings-group';
        
        const sectionTitle = document.createElement('h3');
        sectionTitle.className = 'settings-group-title';
        sectionTitle.textContent = title;
        section.appendChild(sectionTitle);
        
        items.forEach(item => {
            let settingItem;
            
            if (item.type === 'toggle') {
                settingItem = createToggleSetting(item.id, item.label, item.checked, item.onChange);
            } else if (item.type === 'select') {
                settingItem = createSelectSetting(
                    item.id, 
                    item.label, 
                    item.value, 
                    item.options, 
                    item.onChange
                );
            }
            
            if (settingItem) {
                section.appendChild(settingItem);
            }
        });
        
        return section;
    }
    
    /**
     * Creates a toggle setting element
     * @param {string} id - Element ID
     * @param {string} label - Setting label
     * @param {boolean} initialState - Initial toggle state
     * @param {Function} onChange - Change handler
     * @returns {HTMLElement} The toggle setting element
     */
    function createToggleSetting(id, label, initialState, onChange) {
        const container = document.createElement('div');
        container.className = 'setting-item toggle-container';
        
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.id = id;
        toggleInput.checked = initialState;
        toggleInput.addEventListener('change', (e) => onChange(e.target.checked));
        
        const toggleLabel = document.createElement('label');
        toggleLabel.htmlFor = id;
        toggleLabel.textContent = label;
        
        container.appendChild(toggleInput);
        container.appendChild(toggleLabel);
        return container;
    }
    
    /**
     * Creates a select setting element
     * @param {string} id - Element ID
     * @param {string} label - Setting label
     * @param {string|number} initialValue - Initial selected value
     * @param {Array<Object>} options - Select options {value, text}
     * @param {Function} onChange - Change handler
     * @returns {HTMLElement} The select setting element
     */
    function createSelectSetting(id, label, initialValue, options, onChange) {
        const container = document.createElement('div');
        container.className = 'setting-item select-container';
        
        const selectLabel = document.createElement('label');
        selectLabel.htmlFor = id;
        selectLabel.textContent = label;
        
        const select = document.createElement('select');
        select.id = id;
        select.className = 'settings-select';
        
        options.forEach(option => {
            const optElement = document.createElement('option');
            optElement.value = option.value;
            optElement.textContent = option.text;
            
            if (option.value == initialValue) { // Loose equality check for number/string comparison
                optElement.selected = true;
            }
            
            select.appendChild(optElement);
        });
        
        select.addEventListener('change', (e) => onChange(e.target.value));
        
        container.appendChild(selectLabel);
        container.appendChild(select);
        return container;
    }

    /**
     * Updates a URL parameter without refreshing the page
     * @param {string} key - Parameter name
     * @param {string} value - Parameter value
     */
    function updateURLParameter(key, value) {
        const url = new URL(window.location);
        url.searchParams.set(key, value);
        window.history.replaceState({}, '', url);
    }

    /**
     * Adds timetable validity information to the display
     * @param {HTMLElement} wrapper - The container element
     */
    function addValidityInfo(wrapper) {
        // Use config data for validity information
        if (timetableData.config && timetableData.config.city) {
            const cityConfig = timetableData.config.city;
            
            // Find the current season
            const now = new Date();
            let currentSeason = null;
            
            for (const season of cityConfig.season_mapping) {
                const seasonStart = new Date(season.period.start);
                const seasonEnd = new Date(season.period.end);
                
                if (now >= seasonStart && now <= seasonEnd) {
                    currentSeason = season;
                    break;
                }
            }
            
            if (currentSeason) {
                const validFrom = new Date(currentSeason.period.start);
                const validTo = new Date(currentSeason.period.end);
                
                const infoElement = document.createElement("div");
                infoElement.className = "validity-info";
                infoElement.innerHTML = `Aktuell tidtabell gäller: ${validFrom.toLocaleDateString('sv-SE')} - ${validTo.toLocaleDateString('sv-SE')}`;
                wrapper.appendChild(infoElement);
            }
        }
    }

    /**
     * Renders all timetables for the current schedule
     * @param {HTMLElement} wrapper - The container element
     */
    function renderTimetables(wrapper) {
        // Render Sjöstadstrafiken schedules if enabled
        if (config.showSjostadstrafiken) {
            renderSjostadsTimetable(wrapper);
        }

        // Render Emelietrafiken schedules if enabled
        if (config.showEmelietrafiken) {
            renderEmelieTimetables(wrapper);
        }
        
        // If no timetables are visible, show a message
        if (!config.showSjostadstrafiken && !config.showEmelietrafiken) {
            const noDataMessage = document.createElement("div");
            noDataMessage.className = "notification warning";
            noDataMessage.textContent = "Inga tidtabeller valda att visa. Aktivera minst en tidtabell från inställningarna.";
            noDataMessage.setAttribute('role', 'alert');
            wrapper.appendChild(noDataMessage);
        }
    }

    /**
     * Renders Sjöstadstrafiken timetable
     * @param {HTMLElement} wrapper - The container element
     */
    function renderSjostadsTimetable(wrapper) {
        const sjoData = timetableData.today.sjo;
        const sjoTomorrow = timetableData.tomorrow.sjo;
        
        if (sjoData && sjoData.departures) {
            const dayTypeText = sjoData.metadata.day_type === 'weekday' ? 'Vardagar' : 'Helgtrafik';
            const processedDepartures = {};
            
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            for (const [stop, times] of Object.entries(sjoData.departures)) {
                // Create array with today's times with day information
                const todayTimes = createEnhancedTimeObjects(times, now, now);
                
                // Add tomorrow's times (if we have them and they're needed)
                let tomorrowTimes = [];
                if (sjoTomorrow && sjoTomorrow.departures && sjoTomorrow.departures[stop]) {
                    tomorrowTimes = createEnhancedTimeObjects(sjoTomorrow.departures[stop], tomorrow, now);
                }
                
                // Combine both arrays
                processedDepartures[stop] = timeHandler.processScheduleTimes(
                    [...todayTimes, ...tomorrowTimes], 
                    config.maxVisibleDepartures
                );
            }

            wrapper.appendChild(
                renderer.createTimetable(
                    { departures: processedDepartures },
                    "Sjöstadstrafiken",
                    dayTypeText,
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
     * Renders Emelietrafiken timetables
     * @param {HTMLElement} wrapper - The container element
     */
    function renderEmelieTimetables(wrapper) {
        const cityData = timetableData.today.city;
        const cityTomorrow = timetableData.tomorrow.city;
        
        if (!cityData) return;
        
        const dayTypeText = cityData.metadata.day_type === 'weekday' ? 'Vardagar' : 
                           (cityData.metadata.day_type === 'saturday' ? 'Lördagar' : 'Söndagar');
        
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // TO CITY
        if (cityData.to_city) {
            let toCityDepartures;
            
            // Handle different file structures (sometimes nested, sometimes flat)
            if (cityData.to_city.departures) {
                // Weekend structure in spring format
                toCityDepartures = cityData.to_city.departures;
            } else {
                // Weekday structure with morning/afternoon periods
                toCityDepartures = mergeCityLineDepartures(cityData.to_city);
            }
            
            // Process today's departures
            const processedToCity = {};
            for (const [stop, times] of Object.entries(toCityDepartures)) {
                // Create array with today's times with day information
                const todayTimes = createEnhancedTimeObjects(times, now, now);
                
                // Get tomorrow's times if available
                let tomorrowTimes = [];
                if (cityTomorrow && cityTomorrow.to_city) {
                    let tomorrowDepartures;
                    
                    if (cityTomorrow.to_city.departures) {
                        tomorrowDepartures = cityTomorrow.to_city.departures;
                    } else {
                        tomorrowDepartures = mergeCityLineDepartures(cityTomorrow.to_city);
                    }
                    
                    if (tomorrowDepartures[stop]) {
                        tomorrowTimes = createEnhancedTimeObjects(tomorrowDepartures[stop], tomorrow, now);
                    }
                }
                
                // Combine and process
                processedToCity[stop] = timeHandler.processScheduleTimes(
                    [...todayTimes, ...tomorrowTimes], 
                    config.maxVisibleDepartures
                );
            }

            wrapper.appendChild(
                renderer.createTimetable(
                    { departures: processedToCity },
                    "M/S Emelie → City",
                    dayTypeText,
                    config.cityHighlightStop
                )
            );
        }

        // FROM CITY (if enabled)
        if (config.showBothDirections && cityData.from_city) {
            let fromCityDepartures;
            
            // Handle different file structures
            if (cityData.from_city.departures) {
                // Weekend structure in spring format
                fromCityDepartures = cityData.from_city.departures;
            } else {
                // Weekday structure with morning/afternoon periods
                fromCityDepartures = mergeCityLineDepartures(cityData.from_city);
            }
            
            // Process today's and tomorrow's departures
            const processedFromCity = {};
            for (const [stop, times] of Object.entries(fromCityDepartures)) {
                // Create array with today's times with day information
                const todayTimes = createEnhancedTimeObjects(times, now, now);
                
                // Get tomorrow's times if available
                let tomorrowTimes = [];
                if (cityTomorrow && cityTomorrow.from_city) {
                    let tomorrowDepartures;
                    
                    if (cityTomorrow.from_city.departures) {
                        tomorrowDepartures = cityTomorrow.from_city.departures;
                    } else {
                        tomorrowDepartures = mergeCityLineDepartures(cityTomorrow.from_city);
                    }
                    
                    if (tomorrowDepartures[stop]) {
                        tomorrowTimes = createEnhancedTimeObjects(tomorrowDepartures[stop], tomorrow, now);
                    }
                }
                
                // Combine and process
                processedFromCity[stop] = timeHandler.processScheduleTimes(
                    [...todayTimes, ...tomorrowTimes], 
                    config.maxVisibleDepartures
                );
            }

            wrapper.appendChild(
                renderer.createTimetable(
                    { departures: processedFromCity },
                    "M/S Emelie ← City",
                    dayTypeText,
                    config.cityReturnStop
                )
            );
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
     */
    function startPeriodicUpdates() {
        setInterval(async () => {
            try {
                debugLog('Running periodic update');
                
                // Check if we need to reload data (e.g., day change or time change)
                const now = new Date();
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                
                // We need to reload if:
                // 1. The date has changed
                // 2. The clock has moved past midnight
                const needsReload = !timetableData.today ||
                                    !timetableData.today.sjo ||
                                    !timetableData.today.city ||
                                    new Date(timetableData.today.sjo._loadedForDate).getDate() !== now.getDate();
                
                if (needsReload) {
                    debugLog('Day changed, reloading timetable data');
                    
                    // If config data is not loaded yet, load it
                    if (!timetableData.config.sjo || !timetableData.config.city) {
                        timetableData.config = await loadConfigData();
                    }
                    
                    // Load today's and tomorrow's timetables
                    const [todayData, tomorrowData] = await Promise.all([
                        loadTimetableForDate(timetableData.config, now),
                        loadTimetableForDate(timetableData.config, tomorrow)
                    ]);
                    
                    if (todayData && tomorrowData) {
                        timetableData.today = todayData;
                        timetableData.tomorrow = tomorrowData;
                        updateDisplay();
                    }
                } else {
                    // Just update the display with current data
                    updateDisplay();
                }
            } catch (error) {
                handleError(error, 'Kunde inte uppdatera tidtabellen');
            }
        }, config.updateInterval);
    }

    // Initialize the application
    async function initialize() {
        try {
            debugLog('Initializing application...');
            
            // Load configuration data
            timetableData.config = await loadConfigData();
            
            if (!timetableData.config) {
                handleError(null, 'Kunde inte ladda konfigurationsdata');
                return;
            }
            
            // Load today's and tomorrow's timetables
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            const [todayData, tomorrowData] = await Promise.all([
                loadTimetableForDate(timetableData.config, now),
                loadTimetableForDate(timetableData.config, tomorrow)
            ]);
            
            if (todayData && tomorrowData) {
                timetableData.today = todayData;
                timetableData.tomorrow = tomorrowData;
                
                // Perform first display update
                updateDisplay();
                
                // Start periodic updates
                startPeriodicUpdates();
                
                debugLog('Application initialized successfully');
            } else {
                handleError(null, 'Kunde inte ladda tidtabellsdata');
            }
        } catch (error) {
            handleError(error, 'Kunde inte starta applikationen');
        }
    }

    // Start the application
    initialize();
});